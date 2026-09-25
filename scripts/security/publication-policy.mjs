export function forbiddenPath(path) {
  if (/(^|\/)(\.env(?:\..*)?|\.dev\.vars(?:\..*)?)$/i.test(path) && !/\.(example|sample|template)$/i.test(path)) return true;
  if (/(^|\/)(\.npmrc|\.pypirc|\.netrc|\.git-credentials|\.gitleaksignore|id_rsa|id_dsa|id_ecdsa|id_ed25519|credentials(?:\.[^/]+)?|service[-_]account[^/]*\.json)$/i.test(path)) return true;
  if (/\.(pem|key|p12|pfx|jks|keystore|sqlite|sqlite3|db)$/i.test(path)) return true;
  return /(^|\/)(\.wrangler|\.cache|node_modules|dist|\.next|\.vinext)(\/|$)/.test(path);
}

export function validateHosting(bytes) {
  const config = JSON.parse(bytes.toString());
  if (!config || Array.isArray(config) || typeof config !== "object") throw new Error("Invalid hosting metadata.");
  if (Object.keys(config).some((key) => !["project_id", "d1", "r2"].includes(key))) throw new Error("Hosting metadata may contain only project_id, d1 and r2. Keep runtime values and credentials outside Git.");
  if (typeof config.project_id !== "string" || !/^appgprj_[a-zA-Z0-9]+$/.test(config.project_id)) throw new Error("Invalid non-secret Sites project identifier.");
  for (const key of ["d1", "r2"]) {
    if (config[key] != null && (typeof config[key] !== "string" || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(config[key]))) throw new Error("Hosting bindings must be logical names, not runtime settings.");
  }
}
