import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { forbiddenPath, validateHosting } from "./publication-policy.mjs";

// An optional repository argument supports testing the real scanner in isolated repos.
const repository = resolve(process.argv[2] ?? ".");
const release = JSON.parse(readFileSync(new URL("./gitleaks-release.json", import.meta.url), "utf8"));
const binary = fileURLToPath(new URL(`../../.cache/gitleaks/${release.version}/gitleaks`, import.meta.url));
const config = fileURLToPath(new URL("../../.gitleaks.toml", import.meta.url));
const git = (args) => execFileSync("git", ["-C", repository, ...args], { maxBuffer: 64 * 1024 * 1024 });
let temporary;
try {
  if (!existsSync(binary)) throw new Error("Run npm run security:setup first. Secret scanning is required before pushing.");
  const paths = git(["ls-files", "-z"]).toString().split("\0").filter(Boolean);
  const historyPaths = git(["log", "--all", "--format=", "--name-only", "-z"]).toString().split("\0").map((path) => path.replace(/^\n+/, "")).filter(Boolean);
  const forbidden = [...new Set([...paths, ...historyPaths])].filter(forbiddenPath);
  if (forbidden.length) throw new Error(`Files unsuitable for publication (including history):\n${forbidden.join("\n")}`);
  temporary = mkdtempSync(join(tmpdir(), "flylab-secret-scan-"));
  // Scan the index snapshot too: staged files may not yet exist in commit history.
  for (const path of paths) {
    const destination = resolve(temporary, path);
    if (!destination.startsWith(temporary + sep)) throw new Error("Invalid Git path.");
    const bytes = git(["show", `:${path}`]);
    if (path === ".openai/hosting.json") validateHosting(bytes);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, bytes);
  }
  const options = ["--config", config, "--redact=100", "--no-banner", "--ignore-gitleaks-allow", "--max-decode-depth=2", "--max-archive-depth=2"];
  for (const args of [["git", "--log-opts=--all", repository], ["dir", temporary]]) {
    const result = spawnSync(binary, [...args, ...options], { cwd: repository, stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error("Secret scan failed. Resolve the finding before committing or pushing; do not paste secret values in public reports.");
  }
  console.log(`Publication policy and secret scans passed (${paths.length} indexed files; all local Git history).`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (temporary) rmSync(temporary, { recursive: true, force: true });
}
