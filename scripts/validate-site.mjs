/*
Purpose: validate the static Mullusi public website before deployment.
Governance scope: required files, product registry schema, sitemap, robots policy, CNAME, local links, and public-safe text.
Dependencies: Node.js standard library only.
Invariants: validation is deterministic, dependency-free, and exits nonzero on blocking findings.
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const failures = [];

const requiredFiles = [
  "index.html",
  "README.md",
  "CNAME",
  "robots.txt",
  "sitemap.xml",
  "assets/app.js",
  "assets/styles.css",
  "assets/mullusi-mark.svg",
  "data/products.json",
];

const allowedSystemStatuses = new Set(["active", "public", "live demo", "research"]);
const allowedFutureStatuses = new Set(["planned"]);

function readUtf8(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function pathExists(relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

function recordFailure(message) {
  failures.push(message);
}

function localTargetPath(sourceFile, url) {
  const cleanUrl = url.split("#")[0];
  if (cleanUrl.length === 0) {
    return sourceFile;
  }
  if (cleanUrl === "/") {
    return "index.html";
  }
  if (cleanUrl.startsWith("/")) {
    return cleanUrl.slice(1);
  }
  return path.normalize(path.join(path.dirname(sourceFile), cleanUrl)).replaceAll("\\", "/");
}

function idsForHtmlFile(relativePath) {
  const html = readUtf8(relativePath);
  const ids = new Set();
  for (const match of html.matchAll(/\sid="([^"]+)"/g)) {
    ids.add(match[1]);
  }
  return ids;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    recordFailure(`string_required:${label}`);
    return "";
  }
  return value;
}

function validateRequiredFiles() {
  for (const requiredFile of requiredFiles) {
    if (!pathExists(requiredFile)) {
      recordFailure(`required_file_missing:${requiredFile}`);
    }
  }
}

function validateCname() {
  const cname = readUtf8("CNAME").trim();
  if (cname !== "mullusi.com") {
    recordFailure(`cname_invalid:${cname}`);
  }
}

function validateRobots() {
  const robots = readUtf8("robots.txt");
  if (!robots.includes("User-agent: *")) {
    recordFailure("robots_missing_user_agent");
  }
  if (!robots.includes("Allow: /")) {
    recordFailure("robots_missing_allow");
  }
  if (!robots.includes("Sitemap: https://mullusi.com/sitemap.xml")) {
    recordFailure("robots_missing_sitemap");
  }
}

function validateSitemap() {
  const sitemap = readUtf8("sitemap.xml");
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  if (locs.length === 0) {
    recordFailure("sitemap_has_no_locs");
  }
  for (const loc of locs) {
    if (!loc.startsWith("https://mullusi.com/")) {
      recordFailure(`sitemap_invalid_host:${loc}`);
      continue;
    }
    const url = new URL(loc);
    const target = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    if (!pathExists(target)) {
      recordFailure(`sitemap_target_missing:${loc}`);
    }
  }
}

function validateLocalLinks() {
  const htmlFile = "index.html";
  const ids = idsForHtmlFile(htmlFile);
  const html = readUtf8(htmlFile);
  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const url = match[1];
    if (/^(https?:|mailto:|#)/.test(url)) {
      if (url.startsWith("#") && !ids.has(url.slice(1))) {
        recordFailure(`local_anchor_missing:${url}`);
      }
      continue;
    }
    const target = localTargetPath(htmlFile, url);
    if (!pathExists(target)) {
      recordFailure(`local_link_missing:${htmlFile}->${url}`);
    }
  }
}

function validateProductRegistry() {
  const registry = JSON.parse(readUtf8("data/products.json"));
  requireString(registry?.meta?.name, "meta.name");
  requireString(registry?.meta?.domain, "meta.domain");
  if (registry?.meta?.domain !== "mullusi.com") {
    recordFailure(`registry_domain_invalid:${registry?.meta?.domain}`);
  }
  if (!Array.isArray(registry.systems)) {
    recordFailure("registry_systems_not_array");
    return;
  }
  if (!Array.isArray(registry.futureDomains)) {
    recordFailure("registry_future_domains_not_array");
    return;
  }

  const seenRepos = new Set();
  for (const [index, system] of registry.systems.entries()) {
    const label = `systems.${index}`;
    const name = requireString(system.name, `${label}.name`);
    const repo = requireString(system.repo, `${label}.repo`);
    const href = requireString(system.href, `${label}.href`);
    requireString(system.category, `${label}.category`);
    requireString(system.summary, `${label}.summary`);
    if (!allowedSystemStatuses.has(system.status)) {
      recordFailure(`system_status_invalid:${name}:${system.status}`);
    }
    if (!/^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(href)) {
      recordFailure(`system_href_invalid:${name}:${href}`);
    }
    if (href !== `https://github.com/${repo}`) {
      recordFailure(`system_href_repo_mismatch:${name}`);
    }
    if (seenRepos.has(repo)) {
      recordFailure(`system_repo_duplicate:${repo}`);
    }
    seenRepos.add(repo);
    if (!Array.isArray(system.tags) || system.tags.length === 0) {
      recordFailure(`${label}.tags_missing`);
    }
  }

  const seenSlugs = new Set();
  for (const [index, domain] of registry.futureDomains.entries()) {
    const label = `futureDomains.${index}`;
    const name = requireString(domain.name, `${label}.name`);
    const slug = requireString(domain.slug, `${label}.slug`);
    requireString(domain.plannedRepo, `${label}.plannedRepo`);
    requireString(domain.summary, `${label}.summary`);
    if (!allowedFutureStatuses.has(domain.status)) {
      recordFailure(`future_status_invalid:${name}:${domain.status}`);
    }
    if (seenSlugs.has(slug)) {
      recordFailure(`future_slug_duplicate:${slug}`);
    }
    seenSlugs.add(slug);
  }
}

function validatePublicText() {
  const blockedPatterns = [
    new RegExp("\\b" + "artificial\\s+" + "intelligence\\b", "i"),
    new RegExp("\\bA" + "I\\b"),
    new RegExp("g" + "ho_[A-Za-z0-9_]+"),
    new RegExp("github_" + "pat_[A-Za-z0-9_]+"),
    new RegExp("BEGIN RSA " + "PRIVATE KEY"),
    new RegExp("BEGIN OPENSSH " + "PRIVATE KEY"),
    new RegExp("client_" + "secret\\s*[:=]", "i"),
    new RegExp("pass" + "word\\s*[:=]", "i"),
    new RegExp("api[_-]?" + "key\\s*[:=]", "i"),
    new RegExp("tok" + "en\\s*[:=]", "i"),
  ];
  const filesToScan = [
    ...requiredFiles,
    ".github/workflows/validate.yml",
  ].filter(pathExists);

  for (const fileName of filesToScan) {
    const content = readUtf8(fileName);
    for (const pattern of blockedPatterns) {
      if (pattern.test(content)) {
        recordFailure(`blocked_public_text:${fileName}:${pattern}`);
      }
    }
  }
}

function runValidation() {
  validateRequiredFiles();
  validateCname();
  validateRobots();
  validateSitemap();
  validateLocalLinks();
  validateProductRegistry();
  validatePublicText();

  if (failures.length > 0) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  console.log("site validation passed");
}

runValidation();
