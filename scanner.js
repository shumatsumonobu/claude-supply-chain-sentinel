import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = import.meta.dirname;
const OUTPUT_DIR = join(ROOT, "logs");
const TARGETS_FILE = join(ROOT, "targets.txt");
const ENV_FILE = join(ROOT, ".env");
const API_BASE = "https://api.socket.dev/v0/npm";

function loadToken() {
  const env = readFileSync(ENV_FILE, "utf-8");
  const match = env.match(/SOCKET_API_TOKEN=(.+)/);
  if (!match) throw new Error(".env に SOCKET_API_TOKEN が見つからない");
  return match[1].trim();
}

function loadTargets() {
  return readFileSync(TARGETS_FILE, "utf-8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function loadDeps(repoPath) {
  const pkgPath = join(repoPath, "package.json");
  if (!existsSync(pkgPath)) return [];
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  return Object.entries(deps).map(([name, version]) => ({
    name,
    version: version.replace(/^[\^~>=<\s]+/, ""),
  }));
}

async function fetchIssues(token, pkg) {
  const url = `${API_BASE}/${encodeURIComponent(pkg.name)}/${pkg.version}/issues`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "vuln-check/0.2.0",
    },
  });
  if (!res.ok) {
    return {
      package: pkg.name,
      version: pkg.version,
      error: `HTTP ${res.status}`,
      alerts: [],
    };
  }
  const data = await res.json();
  const items = Array.isArray(data) ? data : data.value || [];
  const alerts = items
    .filter((i) => {
      const sev = i.value?.severity;
      const cat = i.value?.category;
      return (
        (sev === "critical" || sev === "high") &&
        (cat === "supplyChainRisk" || cat === "vulnerability")
      );
    })
    .map((i) => ({
      type: i.type,
      severity: i.value?.severity,
      category: i.value?.category,
      label: i.value?.label,
      description: i.value?.description,
    }));
  return { package: pkg.name, version: pkg.version, alerts };
}

async function main() {
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

  const token = loadToken();
  const targets = loadTargets();
  const timestamp = new Date().toISOString().slice(0, 10);
  const results = { date: timestamp, repos: [] };

  for (const repoPath of targets) {
    const deps = loadDeps(repoPath);
    const repo = {
      path: repoPath,
      name: repoPath.split(/[\\/]/).pop(),
      packages: [],
    };

    for (const dep of deps) {
      const result = await fetchIssues(token, dep);
      repo.packages.push(result);
    }

    results.repos.push(repo);
  }

  const outPath = join(OUTPUT_DIR, `scan-${timestamp}.json`);
  writeFileSync(outPath, JSON.stringify(results, null, 2), "utf-8");
  console.log(JSON.stringify(results, null, 2));
}

main();
