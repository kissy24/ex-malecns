import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scanner = fileURLToPath(new URL("../scripts/security/scan-secrets.mjs", import.meta.url));

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "flylab-security-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-C", directory, ...args], { stdio: "pipe" });
  git("init", "--quiet", "--initial-branch=main");
  git("config", "user.name", "Security test");
  git("config", "user.email", "security-test@example.invalid");
  writeFileSync(join(directory, "README.md"), "Temporary scanner test.\n");
  git("add", "README.md");
  git("commit", "--quiet", "-m", "Initial fixture");
  const scan = () => spawnSync(process.execPath, [scanner, directory], { encoding: "utf8" });
  return { directory, git, scan };
}

test("clean history and non-secret Sites metadata pass the actual scanner", (t) => {
  const f = fixture(t);
  mkdirSync(join(f.directory, ".openai"));
  writeFileSync(join(f.directory, ".openai/hosting.json"), JSON.stringify({ project_id: "appgprj_fixture", d1: null, r2: null }));
  f.git("add", ".openai/hosting.json");
  const result = f.scan();
  assert.equal(result.status, 0, result.stderr);
});

test("force-added environment files are blocked despite gitignore", (t) => {
  const f = fixture(t);
  writeFileSync(join(f.directory, ".gitignore"), ".env*\n");
  writeFileSync(join(f.directory, ".env.local"), "MODE=private\n");
  f.git("add", "--force", ".env.local");
  const result = f.scan();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Files unsuitable for publication/);
});

test("runtime credentials cannot be inserted into hosting metadata", (t) => {
  const f = fixture(t);
  mkdirSync(join(f.directory, ".openai"));
  writeFileSync(join(f.directory, ".openai/hosting.json"), JSON.stringify({ project_id: "appgprj_fixture", token: "placeholder" }));
  f.git("add", ".openai/hosting.json");
  const result = f.scan();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /only project_id, d1 and r2/);
});

test("a newly staged credential fails and its value is redacted", (t) => {
  const f = fixture(t);
  // Fabricated at runtime; never store credential-shaped fixtures in Git.
  const fake = "gh" + "p_" + randomBytes(24).toString("hex").slice(0, 36);
  writeFileSync(join(f.directory, "settings.txt"), "credential=" + fake + "\n");
  f.git("add", "settings.txt");
  const result = f.scan();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Secret scan failed/);
  assert.ok(!(result.stdout + result.stderr).includes(fake));
});

test("a credential removed from HEAD is still detected in history", (t) => {
  const f = fixture(t);
  const fake = "gh" + "p_" + randomBytes(24).toString("hex").slice(0, 36);
  writeFileSync(join(f.directory, "settings.txt"), "credential=" + fake + "\n");
  f.git("add", "settings.txt");
  f.git("commit", "--quiet", "-m", "Historical fixture");
  f.git("rm", "--quiet", "settings.txt");
  f.git("commit", "--quiet", "-m", "Remove fixture");
  const result = f.scan();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Secret scan failed/);
  assert.ok(!(result.stdout + result.stderr).includes(fake));
});
