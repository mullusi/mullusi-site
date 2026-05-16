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
  "mullu/index.html",
  "proof/index.html",
  "README.md",
  "CNAME",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  "site.webmanifest",
  "assets/app.js",
  "assets/styles.css",
  "assets/mullusi-icon.svg",
  "assets/mullusi-icon-32.png",
  "assets/mullusi-icon-180.png",
  "assets/mullusi-icon-192.png",
  "assets/mullusi-icon-512.png",
  "assets/mullusi-icon-transparent.svg",
  "assets/mullusi-logo.svg",
  "assets/mullusi-mark.svg",
  "data/products.json",
  "data/site.json",
  "scripts/verify-registry-repos.mjs",
];

const allowedSystemStatuses = new Set(["active", "public", "live demo", "research", "deployed"]);
const allowedFutureStatuses = new Set(["planned"]);
const allowedInterfaceStatuses = new Set(["public route", "experimental", "reserved"]);
const allowedPublicRepoOwners = new Set(["mullusi"]);

function readUtf8(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function readBinary(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath));
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
  for (const htmlFile of ["index.html", "mullu/index.html", "proof/index.html"]) {
    const ids = idsForHtmlFile(htmlFile);
    const html = readUtf8(htmlFile);
    for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const url = match[1];
      if (/^(https?:|mailto:|#)/.test(url)) {
        if (url.startsWith("#") && !ids.has(url.slice(1))) {
          recordFailure(`local_anchor_missing:${htmlFile}:${url}`);
        }
        continue;
      }
      const target = localTargetPath(htmlFile, url);
      if (!pathExists(target)) {
        recordFailure(`local_link_missing:${htmlFile}->${url}`);
      }
    }
  }
}

function validateProductionClaimBoundary() {
  const requiredTerms = [
    "Production Claim Boundary",
    "Mullusi",
    "Mullu",
    "AwaitingEvidence",
    "/health",
    "/gateway/witness",
    "/runtime/conformance",
    "/proof/",
  ];

  for (const htmlFile of ["index.html", "mullu/index.html"]) {
    const html = readUtf8(htmlFile);
    if (!html.includes('id="production-boundary"')) {
      recordFailure(`production_boundary_section_missing:${htmlFile}`);
    }
    for (const term of requiredTerms) {
      if (!html.includes(term)) {
        recordFailure(`production_boundary_term_missing:${htmlFile}:${term}`);
      }
    }
  }
}

function pngDimensions(relativePath) {
  const content = readBinary(relativePath);
  const signature = "89504e470d0a1a0a";
  if (content.subarray(0, 8).toString("hex") !== signature) {
    recordFailure(`png_signature_invalid:${relativePath}`);
    return null;
  }
  return {
    width: content.readUInt32BE(16),
    height: content.readUInt32BE(20),
  };
}

function validateIconPng(relativePath, expectedSize) {
  const dimensions = pngDimensions(relativePath);
  if (!dimensions) {
    return;
  }
  if (dimensions.width !== expectedSize || dimensions.height !== expectedSize) {
    recordFailure(`png_size_invalid:${relativePath}:${dimensions.width}x${dimensions.height}`);
  }
}

function validateIco(relativePath) {
  const content = readBinary(relativePath);
  if (content.length < 6) {
    recordFailure(`ico_too_short:${relativePath}`);
    return;
  }
  const reserved = content.readUInt16LE(0);
  const type = content.readUInt16LE(2);
  const count = content.readUInt16LE(4);
  if (reserved !== 0 || type !== 1 || count === 0) {
    recordFailure(`ico_header_invalid:${relativePath}`);
  }
}

function validateWebManifest() {
  const manifest = JSON.parse(readUtf8("site.webmanifest"));
  requireString(manifest.name, "manifest.name");
  requireString(manifest.short_name, "manifest.short_name");
  requireString(manifest.start_url, "manifest.start_url");
  requireString(manifest.display, "manifest.display");
  if (manifest.theme_color !== "#050609") {
    recordFailure(`manifest_theme_color_invalid:${manifest.theme_color}`);
  }
  if (!Array.isArray(manifest.icons) || manifest.icons.length === 0) {
    recordFailure("manifest_icons_missing");
    return;
  }
  for (const [index, icon] of manifest.icons.entries()) {
    const label = `manifest.icons.${index}`;
    const src = requireString(icon.src, `${label}.src`);
    const sizes = requireString(icon.sizes, `${label}.sizes`);
    if (icon.type !== "image/png") {
      recordFailure(`manifest_icon_type_invalid:${src}:${icon.type}`);
    }
    if (!pathExists(src)) {
      recordFailure(`manifest_icon_missing:${src}`);
      continue;
    }
    const sizeMatch = sizes.match(/^(\d+)x\1$/);
    if (!sizeMatch) {
      recordFailure(`manifest_icon_size_format_invalid:${src}:${sizes}`);
      continue;
    }
    validateIconPng(src, Number(sizeMatch[1]));
  }
  validateIconPng("assets/mullusi-icon-32.png", 32);
  validateIconPng("assets/mullusi-icon-180.png", 180);
  validateIco("favicon.ico");
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
    const [repoOwner] = repo.split("/");
    if (!allowedPublicRepoOwners.has(repoOwner)) {
      recordFailure(`system_repo_owner_not_public_surface:${name}:${repoOwner}`);
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

  if (registry.privateIncubation !== undefined) {
    if (!Array.isArray(registry.privateIncubation)) {
      recordFailure("registry_private_incubation_not_array");
      return;
    }
    for (const [index, item] of registry.privateIncubation.entries()) {
      const label = `privateIncubation.${index}`;
      requireString(item.name, `${label}.name`);
      requireString(item.summary, `${label}.summary`);
      requireString(item.publishGate, `${label}.publishGate`);
      if (item.visibility !== "private") {
        recordFailure(`private_incubation_visibility_invalid:${item.name}:${item.visibility}`);
      }
      const publicText = [item.name, item.summary, item.publishGate].join(" ");
      if (/github\.com\/|[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/.test(publicText)) {
        recordFailure(`private_incubation_repo_reference_forbidden:${item.name}`);
      }
    }
  }
}

function validateSiteContent() {
  const content = JSON.parse(readUtf8("data/site.json"));
  requireString(content?.meta?.name, "site.meta.name");
  requireString(content?.meta?.version, "site.meta.version");
  requireString(content?.meta?.purpose, "site.meta.purpose");

  if (!Array.isArray(content.proofLanes) || content.proofLanes.length === 0) {
    recordFailure("site_proof_lanes_missing");
  } else {
    for (const [index, lane] of content.proofLanes.entries()) {
      const label = `site.proofLanes.${index}`;
      requireString(lane.label, `${label}.label`);
      requireString(lane.title, `${label}.title`);
      requireString(lane.summary, `${label}.summary`);
    }
  }

  if (!Array.isArray(content.interfaces) || content.interfaces.length === 0) {
    recordFailure("site_interfaces_missing");
  } else {
    for (const [index, item] of content.interfaces.entries()) {
      const label = `site.interfaces.${index}`;
      const name = requireString(item.name, `${label}.name`);
      const href = requireString(item.href, `${label}.href`);
      requireString(item.summary, `${label}.summary`);
      if (!allowedInterfaceStatuses.has(item.status)) {
        recordFailure(`site_interface_status_invalid:${name}:${item.status}`);
      }
      if (!/^https:\/\/[a-z0-9.-]+\.mullusi\.com$/.test(href) && href !== "https://mullusi.com") {
        recordFailure(`site_interface_href_invalid:${name}:${href}`);
      }
    }
  }

  if (!Array.isArray(content.services) || content.services.length === 0) {
    recordFailure("site_services_missing");
  } else {
    for (const [index, service] of content.services.entries()) {
      const label = `site.services.${index}`;
      requireString(service.name, `${label}.name`);
      requireString(service.delivery, `${label}.delivery`);
      requireString(service.status, `${label}.status`);
      requireString(service.summary, `${label}.summary`);
      const proofSurface = requireString(service.proofSurface, `${label}.proofSurface`);
      if (!/^[a-z0-9.-]+\.mullusi\.com$/.test(proofSurface)) {
        recordFailure(`site_service_proof_surface_invalid:${proofSurface}`);
      }
    }
  }

  if (!Array.isArray(content.serviceTiers) || content.serviceTiers.length === 0) {
    recordFailure("site_service_tiers_missing");
  } else {
    for (const [index, tier] of content.serviceTiers.entries()) {
      const label = `site.serviceTiers.${index}`;
      requireString(tier.name, `${label}.name`);
      requireString(tier.audience, `${label}.audience`);
      requireString(tier.status, `${label}.status`);
      requireString(tier.priceSignal, `${label}.priceSignal`);
      requireString(tier.summary, `${label}.summary`);
    }
  }

  if (!Array.isArray(content.apiContracts) || content.apiContracts.length === 0) {
    recordFailure("site_api_contracts_missing");
  } else {
    for (const [index, contract] of content.apiContracts.entries()) {
      const label = `site.apiContracts.${index}`;
      requireString(contract.name, `${label}.name`);
      const route = requireString(contract.route, `${label}.route`);
      const host = requireString(contract.host, `${label}.host`);
      requireString(contract.status, `${label}.status`);
      requireString(contract.input, `${label}.input`);
      requireString(contract.output, `${label}.output`);
      requireString(contract.summary, `${label}.summary`);
      if (!/^(GET|POST) \/v1\/[a-z0-9/_{}-]+$/.test(route)) {
        recordFailure(`site_api_contract_route_invalid:${route}`);
      }
      if (!/^[a-z0-9.-]+\.mullusi\.com$/.test(host)) {
        recordFailure(`site_api_contract_host_invalid:${host}`);
      }
    }
  }

  const handoff = content.repositoryHandoff;
  if (!handoff || typeof handoff !== "object") {
    recordFailure("site_repository_handoff_missing");
  } else {
    requireString(handoff.label, "site.repositoryHandoff.label");
    requireString(handoff.title, "site.repositoryHandoff.title");
    requireString(handoff.summary, "site.repositoryHandoff.summary");
    if (!Array.isArray(handoff.steps) || handoff.steps.length < 2) {
      recordFailure("site_repository_handoff_steps_missing");
    } else {
      for (const [index, step] of handoff.steps.entries()) {
        requireString(step, `site.repositoryHandoff.steps.${index}`);
      }
    }
  }

  if (!Array.isArray(content.releaseStages) || content.releaseStages.length === 0) {
    recordFailure("site_release_stages_missing");
  } else {
    for (const [index, stage] of content.releaseStages.entries()) {
      const label = `site.releaseStages.${index}`;
      requireString(stage.step, `${label}.step`);
      requireString(stage.title, `${label}.title`);
      requireString(stage.summary, `${label}.summary`);
    }
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
  const textFilePattern = /\.(?:css|html|js|json|md|mjs|svg|txt|webmanifest|xml|ya?ml)$/i;
  const filesToScan = [
    ...requiredFiles,
    ".github/workflows/validate.yml",
  ].filter((fileName) => pathExists(fileName) && textFilePattern.test(fileName));

  for (const fileName of filesToScan) {
    const content = readUtf8(fileName);
    for (const pattern of blockedPatterns) {
      if (pattern.test(content)) {
        recordFailure(`blocked_public_text:${fileName}:${pattern}`);
      }
    }
  }
}

function validateHeadContract() {
  const ogImage = "https://mullusi.com/assets/mullusi-icon-512.png";
  const routes = [
    { file: "index.html", url: "https://mullusi.com" },
    { file: "mullu/index.html", url: "https://mullusi.com/mullu/" },
    { file: "proof/index.html", url: "https://mullusi.com/proof/" },
  ];
  for (const { file, url } of routes) {
    const html = readUtf8(file);
    const checks = [
      [/<meta\s+charset=/i, "charset"],
      [/<meta\s+name="viewport"/i, "viewport"],
      [/<title>[^<]+<\/title>/i, "title"],
      [/<meta\s+name="description"\s+content="[^"]+"/i, "description"],
      [`<link rel="canonical" href="${url}"`, "canonical"],
      [`<meta property="og:title" content="`, "og:title"],
      [`<meta property="og:description" content="`, "og:description"],
      [`<meta property="og:type" content="website"`, "og:type"],
      [`<meta property="og:url" content="${url}"`, "og:url"],
      [`<meta property="og:image" content="${ogImage}"`, "og:image"],
      [`<meta name="twitter:card" content="`, "twitter:card"],
      [`<meta name="twitter:image" content="${ogImage}"`, "twitter:image"],
    ];
    for (const [matcher, label] of checks) {
      const present = matcher instanceof RegExp ? matcher.test(html) : html.includes(matcher);
      if (!present) {
        recordFailure(`head_contract_missing:${file}:${label}`);
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
  validateHeadContract();
  validateProductionClaimBoundary();
  validateWebManifest();
  validateProductRegistry();
  validateSiteContent();
  validatePublicText();

  if (failures.length > 0) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  console.log("site validation passed");
}

runValidation();
