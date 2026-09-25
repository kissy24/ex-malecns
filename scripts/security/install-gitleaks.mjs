import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const release = JSON.parse(await readFile(new URL("./gitleaks-release.json", import.meta.url), "utf8"));
const archive = release.archives[`${process.platform}-${process.arch}`];
if (!archive) throw new Error("Unsupported platform. Use Linux/macOS or run the security workflow in GitHub Actions.");
const filename = `gitleaks_${release.version}_${archive.platform}.tar.gz`;
const response = await fetch(`https://github.com/gitleaks/gitleaks/releases/download/v${release.version}/${filename}`, { signal: AbortSignal.timeout(60_000) });
if (!response.ok) throw new Error(`Gitleaks download failed (${response.status}).`);
const bytes = Buffer.from(await response.arrayBuffer());
if (createHash("sha256").update(bytes).digest("hex") !== archive.sha256) throw new Error("Gitleaks checksum mismatch; refusing to install.");

const temporary = await mkdtemp(join(tmpdir(), "flylab-gitleaks-install-"));
const destination = fileURLToPath(new URL(`../../.cache/gitleaks/${release.version}/`, import.meta.url));
try {
  await writeFile(join(temporary, filename), bytes);
  // Extract only the verified release executable, not other archive entries.
  execFileSync("tar", ["-xzf", join(temporary, filename), "-C", temporary, "gitleaks"]);
  await mkdir(destination, { recursive: true });
  const binary = join(destination, "gitleaks");
  await writeFile(`${binary}.new`, await readFile(join(temporary, "gitleaks")));
  await chmod(`${binary}.new`, 0o755);
  await rename(`${binary}.new`, binary);
  console.log(`Installed checksum-verified Gitleaks ${release.version}.`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
