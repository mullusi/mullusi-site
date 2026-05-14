/*
Purpose: verify public GitHub reachability for repositories listed in the Mullusi website product registry.
Governance scope: product registry exposure, repository visibility, URL-to-repo consistency, and evidence output.
Dependencies: Node.js standard library and public GitHub REST API access.
Invariants: every listed system repository must resolve, remain public, and match its declared href.
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const registryPath = path.join(repoRoot, "data", "products.json");
const failures = [];

function recordFailure(message) {
  failures.push(message);
}

function readRegistry() {
  try {
    return JSON.parse(fs.readFileSync(registryPath, "utf8"));
  } catch (error) {
    throw new Error(`registry_read_failed:${error.message}`);
  }
}

function requireSystems(registry) {
  if (!Array.isArray(registry?.systems)) {
    throw new Error("registry_systems_not_array");
  }
  return registry.systems;
}

function assertRepoShape(system, index) {
  const label = `systems.${index}`;
  if (typeof system.repo !== "string" || !/^[^/]+\/[^/]+$/.test(system.repo)) {
    recordFailure(`${label}.repo_invalid:${system.repo}`);
    return false;
  }
  const expectedHref = `https://github.com/${system.repo}`;
  if (system.href !== expectedHref) {
    recordFailure(`${label}.href_mismatch:${system.href}`);
    return false;
  }
  return true;
}

async function fetchRepo(repo) {
  const response = await fetch(`https://api.github.com/repos/${repo}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "mullusi-site-registry-verifier",
    },
  });

  if (!response.ok) {
    return {
      ok: false,
      repo,
      status: response.status,
    };
  }

  const body = await response.json();
  return {
    ok: true,
    repo,
    isPrivate: body.private,
    htmlUrl: body.html_url,
  };
}

async function verifyRegistryRepos() {
  const registry = readRegistry();
  const systems = requireSystems(registry);
  const repos = [];
  const seenRepos = new Set();

  for (const [index, system] of systems.entries()) {
    if (!assertRepoShape(system, index)) {
      continue;
    }
    if (seenRepos.has(system.repo)) {
      recordFailure(`repo_duplicate:${system.repo}`);
      continue;
    }
    seenRepos.add(system.repo);
    repos.push(system.repo);
  }

  const verified = [];
  for (const repo of repos) {
    const result = await fetchRepo(repo);
    if (!result.ok) {
      recordFailure(`repo_unreachable:${repo}:http_${result.status}`);
      continue;
    }
    if (result.isPrivate !== false) {
      recordFailure(`repo_not_public:${repo}`);
    }
    if (result.htmlUrl !== `https://github.com/${repo}`) {
      recordFailure(`repo_html_url_mismatch:${repo}:${result.htmlUrl}`);
    }
    verified.push(result);
  }

  if (failures.length > 0) {
    console.error(failures.join("\n"));
    process.exit(1);
  }

  for (const result of verified) {
    console.log(`${result.repo} PUBLIC ${result.htmlUrl}`);
  }
  console.log(`registry repository verification passed: ${verified.length} public repositories`);
}

verifyRegistryRepos().catch((error) => {
  console.error(`registry_repository_verification_failed:${error.message}`);
  process.exit(1);
});
