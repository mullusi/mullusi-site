/*
Purpose: validate the static Mullusi public website before deployment.
Governance scope: required files, product registry schema, sitemap, robots policy, deployment controls, local links, and public-safe text.
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
  "playground/index.html",
  "404.html",
  ".nojekyll",
  ".well-known/security.txt",
  "README.md",
  "docs/private-source-deployment-migration.md",
  "ops/public-claim-gate.md",
  "ops/repo-release-gate.md",
  "ops/product-release-gate.md",
  "ops/ip-disclosure-gate.md",
  "ops/MULLUSI_INFRASTRUCTURE_ROOT.md",
  "ops/mullusi-doctrine.md",
  "ops/api-runtime-host-path.md",
  "ops/api-production-readiness-gate.md",
  "ops/website-origin-witness.md",
  "ops/www-canonical-redirect-gate.md",
  "ops/recovery-inventory-template.md",
  "ops/recovery-completion-witness.md",
  "LICENSE",
  "CNAME",
  "_headers",
  "_redirects",
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
  "assets/mullusi-logo-light.svg",
  "assets/mullusi-mark.svg",
  "assets/fonts/noto-sans-symbols-2-math.woff2",
  "assets/fonts/OFL.txt",
  "data/products.json",
  "data/news.json",
  "data/site.json",
  "data/i18n.json",
  "scripts/fetch-news.mjs",
  "scripts/build-cloudflare-pages.mjs",
  "scripts/test-build-cloudflare-pages.mjs",
  "scripts/check-website-origin.mjs",
  "scripts/test-check-website-origin.mjs",
  "scripts/check-www-canonical-redirect-gate.mjs",
  "scripts/test-www-canonical-redirect-gate.mjs",
  "scripts/verify-registry-repos.mjs",
  "scripts/check-ops-gates.mjs",
  "scripts/test-ops-gates.mjs",
  "scripts/promote-recovery-witness.mjs",
  "scripts/test-promote-recovery-witness.mjs",
  "scripts/check-private-recovery-inventory.mjs",
  "scripts/test-private-recovery-inventory.mjs",
];

const allowedSystemStatuses = new Set(["active", "public", "live demo", "research", "deployed"]);
const allowedFutureStatuses = new Set(["planned"]);
const allowedInterfaceStatuses = new Set(["public route", "experimental", "reserved"]);
const allowedProductStatuses = new Set(["awaiting-evidence", "private-incubation", "planned", "restricted"]);
const allowedStatusBoardStates = new Set(["live", "awaiting-evidence", "planned"]);
const allowedProductClassifications = new Set([
  "public product",
  "public product later",
  "private research product",
  "internal tool",
  "API service",
  "dashboard module",
  "sandbox demo",
  "library/package",
]);

function readUtf8(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function readBinary(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath));
}

function pathExists(relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

function relativePathExists(baseRelativePath, relativePath) {
  return fs.existsSync(path.join(repoRoot, baseRelativePath, relativePath));
}

function recordFailure(message) {
  failures.push(message);
}

function hasExactLine(text, expectedLine) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .some((line) => line === expectedLine);
}

function hexToRgb(hex) {
  const match = hex.trim().match(/^#([0-9a-f]{6})$/i);
  if (!match) {
    return null;
  }
  return [
    Number.parseInt(match[1].slice(0, 2), 16),
    Number.parseInt(match[1].slice(2, 4), 16),
    Number.parseInt(match[1].slice(4, 6), 16),
  ];
}

function relativeLuminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return null;
  }
  const channels = rgb.map((value) => {
    const normalized = value / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground, background) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  if (foregroundLuminance === null || backgroundLuminance === null) {
    return null;
  }
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function cssVariable(block, variableName) {
  const match = block.match(new RegExp(`${variableName}:\\s*(#[0-9a-fA-F]{6});`));
  return match?.[1] ?? "";
}

function localTargetPath(sourceFile, url) {
  const cleanUrl = url.split(/[?#]/)[0];
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

function validateCloudflarePagesControls() {
  const headers = readUtf8("_headers");
  const redirects = readUtf8("_redirects");
  const requiredHeaderTerms = [
    "Cloudflare Pages response headers",
    "Content-Security-Policy:",
    "X-Content-Type-Options: nosniff",
    "X-Frame-Options: DENY",
    "/assets/*",
    "Cache-Control: public, max-age=600",
    "/data/*",
    "Cache-Control: no-store",
    "/.well-known/security.txt",
  ];
  for (const term of requiredHeaderTerms) {
    if (!headers.includes(term)) {
      recordFailure(`cloudflare_headers_term_missing:${term}`);
    }
  }
  const requiredRedirectRules = [
    "https://www.mullusi.com/* https://mullusi.com/:splat 301",
    "/CNAME / 302",
  ];
  for (const rule of requiredRedirectRules) {
    if (!hasExactLine(redirects, rule)) {
      recordFailure(`cloudflare_redirect_rule_missing:${rule}`);
    }
  }
}

function validateCloudflarePagesArtifact() {
  if (!pathExists("dist")) {
    return;
  }
  const allowedTopLevelEntries = new Set([
    ".well-known",
    "assets",
    "data",
    "mullu",
    "playground",
    "proof",
    "404.html",
    "favicon.ico",
    "index.html",
    "robots.txt",
    "site.webmanifest",
    "sitemap.xml",
    "_headers",
    "_redirects",
  ]);
  const forbiddenTopLevelEntries = [
    ".claude",
    ".git",
    ".github",
    ".nojekyll",
    "backend",
    "docs",
    "ops",
    "scripts",
    "CNAME",
    "LICENSE",
    "README.md",
  ];
  for (const entry of fs.readdirSync(path.join(repoRoot, "dist"))) {
    if (!allowedTopLevelEntries.has(entry)) {
      recordFailure(`cloudflare_artifact_unexpected_entry:${entry}`);
    }
  }
  for (const entry of allowedTopLevelEntries) {
    if (!relativePathExists("dist", entry)) {
      recordFailure(`cloudflare_artifact_public_entry_missing:${entry}`);
    }
  }
  for (const entry of forbiddenTopLevelEntries) {
    if (relativePathExists("dist", entry)) {
      recordFailure(`cloudflare_artifact_forbidden_entry_present:${entry}`);
    }
  }
  const byteMatchedFiles = [
    "index.html",
    "mullu/index.html",
    "proof/index.html",
    "playground/index.html",
    "404.html",
    "_headers",
    "_redirects",
    ".well-known/security.txt",
    "assets/app.js",
    "assets/styles.css",
    "data/site.json",
    "data/products.json",
    "robots.txt",
    "sitemap.xml",
    "site.webmanifest",
  ];
  for (const relativePath of byteMatchedFiles) {
    const sourcePath = path.join(repoRoot, relativePath);
    const artifactPath = path.join(repoRoot, "dist", relativePath);
    if (!fs.existsSync(artifactPath)) {
      recordFailure(`cloudflare_artifact_file_missing:${relativePath}`);
      continue;
    }
    const source = fs.readFileSync(sourcePath);
    const artifact = fs.readFileSync(artifactPath);
    if (!source.equals(artifact)) {
      recordFailure(`cloudflare_artifact_file_stale:${relativePath}`);
    }
  }
}

function validateWebsiteOriginWitness() {
  const witness = readUtf8("ops/website-origin-witness.md");
  const requiredTerms = [
    "command=node scripts/check-website-origin.mjs",
    "target=https://mullusi.com/",
    "target=https://www.mullusi.com/",
    "final_url=https://mullusi.com/",
    "target=https://www.mullusi.com/proof/?gate=www-canonical",
    "final_url=https://mullusi.com/proof/?gate=www-canonical",
    "target=https://mullusi.com/assets/app.js",
    "target=https://mullusi.com/data/site.json",
    "target=https://mullusi.com/.well-known/security.txt",
    "status=200",
    "redirect_count=0",
    "redirect_count=1",
    "first_redirect_status=",
    "first_redirect_status=301",
    "first_redirect_url=",
    "first_redirect_url=https://mullusi.com/",
    "first_redirect_url=https://mullusi.com/proof/?gate=www-canonical",
    "server=cloudflare",
    "verdict=CloudflareOriginCandidate",
    "proof_state=Pass",
    "origin_headers_no_github=true",
    "cloudflare_edge_observed=true",
    "github_pages_origin_markers=false",
    "www_canonical_redirect=SolvedVerified",
    "www_redirect_count=1",
    "www_first_redirect_status=301",
    "www_path_query_preserved=true",
    "runtime_api_readiness=AwaitingEvidence",
    "accepted_targets=https://mullusi.com/*, https://www.mullusi.com/",
    "accepted_www_redirect_witnesses=https://www.mullusi.com/, https://www.mullusi.com/proof/?gate=www-canonical",
    "json_output=sanitized_witness_records_only",
    "raw_response_headers=not_recorded",
    "redirect_boundary=stays_within_mullusi_https_hosts",
    "www_redirect_failure_state=none",
    "www_redirect_path_query_preservation=Pass",
    "www_redirect_status_code=301",
    "required_www_redirect_status=301",
  ];
  for (const term of requiredTerms) {
    if (!witness.includes(term)) {
      recordFailure(`website_origin_witness_term_missing:${term}`);
    }
  }
  if (/x-github-request-id\s*=\S+|x-fastly-request-id\s*=\S+|x-served-by\s*=\S+|account_id\s*=|billing_id\s*=|token\s*=/i.test(witness)) {
    recordFailure("website_origin_witness_boundary_invalid");
  }
}

function validatePrivateSourceMigrationDoc() {
  const migration = readUtf8("docs/private-source-deployment-migration.md");
  const requiredTerms = [
    "one permanent `301` hop",
    "ops/www-canonical-redirect-gate.md",
    "node --check scripts/check-www-canonical-redirect-gate.mjs",
    "node --check scripts/test-www-canonical-redirect-gate.mjs",
    "node scripts/check-website-origin.mjs",
    "node scripts/test-www-canonical-redirect-gate.mjs",
    "node scripts/check-www-canonical-redirect-gate.mjs",
    "www_canonical_redirect=pass",
    "www_redirect_count=1",
    "www_first_redirect_status=301",
    "www_path_query_preserved=true",
    "www one-hop 301 redirect closure",
  ];
  for (const term of requiredTerms) {
    if (!migration.includes(term)) {
      recordFailure(`private_source_migration_term_missing:${term}`);
    }
  }
  if (/account_id\s*=|billing_id\s*=|token\s*=|dns_target\s*=/i.test(migration)) {
    recordFailure("private_source_migration_boundary_invalid");
  }
}

function validateWwwCanonicalRedirectGate() {
  const gate = readUtf8("ops/www-canonical-redirect-gate.md");
  const redirects = readUtf8("_redirects");
  const infrastructureRoot = readUtf8("ops/MULLUSI_INFRASTRUCTURE_ROOT.md");
  const originChecker = readUtf8("scripts/check-website-origin.mjs");
  const wwwRedirectGate = readUtf8("scripts/check-www-canonical-redirect-gate.mjs");
  const wwwRedirectGateTest = readUtf8("scripts/test-www-canonical-redirect-gate.mjs");
  const requiredTerms = [
    "https://www.mullusi.com/* https://mullusi.com/:splat 301",
    "uncommented exact `_redirects` line",
    "embedded copy, or partial match is not a valid source-rule witness.",
    "Each required live witness target must appear exactly once in the witness file.",
    "Missing or duplicated target blocks fail closed",
    "expected_final_url=https://mullusi.com/",
    "expected_redirect_count=1",
    "expected_first_redirect_status=301",
    "expected_first_redirect_url=https://mullusi.com/",
    "request=https://www.mullusi.com/proof/?gate=www-canonical",
    "expected_final_url=https://mullusi.com/proof/?gate=www-canonical",
    "expected_first_redirect_url=https://mullusi.com/proof/?gate=www-canonical",
    "expected_verdict=CloudflareOriginCandidate",
    "observed_witness_block_count=1",
    "observed_final_url=https://mullusi.com/",
    "observed_final_url=https://mullusi.com/proof/?gate=www-canonical",
    "observed_redirect_count=1",
    "observed_first_redirect_status=301",
    "observed_first_redirect_url=https://mullusi.com/",
    "observed_first_redirect_url=https://mullusi.com/proof/?gate=www-canonical",
    "observed_verdict=CloudflareOriginCandidate",
    "observed_proof_state=Pass",
    "source_redirect_rule=present",
    "live_redirect_witness=Pass",
    "path_query_redirect_witness=Pass",
    "permanent_redirect_status_witness=Pass",
    "single_redirect_hop_witness=Pass",
    "unique_witness_blocks=Pass",
    "release_gate=ready",
    "failure_action=none",
    "rule_surface=Cloudflare Pages redirect, Cloudflare zone redirect rule, or versioned Cloudflare Worker route",
    "match_host=www.mullusi.com",
    "target_host=mullusi.com",
    "status_code=301",
    "preserve_path=true",
    "preserve_query=true",
    "single_redirect_hop=true",
    "runtime_dependency=false",
    "secret_required=false",
    "node scripts/check-website-origin.mjs https://www.mullusi.com/ \"https://www.mullusi.com/proof/?gate=www-canonical\"",
    "final_url=https://mullusi.com/",
    "first_redirect_status=301",
    "final_url=https://mullusi.com/proof/?gate=www-canonical",
    "first_redirect_url=https://mullusi.com/proof/?gate=www-canonical",
    "path/query preservation verified",
    "permanent 301 verified",
    "Do not close this gate from a dashboard screenshot alone.",
  ];
  for (const term of requiredTerms) {
    if (!gate.includes(term)) {
      recordFailure(`www_canonical_redirect_gate_term_missing:${term}`);
    }
  }
  if (!hasExactLine(redirects, "https://www.mullusi.com/* https://mullusi.com/:splat 301")) {
    recordFailure("www_canonical_redirect_source_rule_missing");
  }
  if (/account_id\s*=|billing_id\s*=|token\s*=|dns_target\s*=/i.test(gate)) {
    recordFailure("www_canonical_redirect_gate_boundary_invalid");
  }
  const checkerTerms = [
    "const allowedWwwTargetUrls = new Set([",
    "\"https://www.mullusi.com/\"",
    "\"https://www.mullusi.com/proof/?gate=www-canonical\"",
    "target_www_route_invalid",
    "UnsupportedArgument",
    "unsupported_args",
    "redirectHistory",
    "CanonicalRedirectChainMismatch",
    "CanonicalRedirectStatusMismatch",
    "first_redirect_status",
  ];
  for (const term of checkerTerms) {
    if (!originChecker.includes(term)) {
      recordFailure(`www_canonical_redirect_checker_term_missing:${term}`);
    }
  }
  const gateScriptTerms = [
    "function witnessBlocksForTarget",
    "witnessBlockCount",
    "blocks.length === 1",
    "function hasExactRedirectRule",
    "line === rule",
    "hasExactRedirectRule(redirects, redirectRule)",
  ];
  for (const term of gateScriptTerms) {
    if (!wwwRedirectGate.includes(term)) {
      recordFailure(`www_canonical_redirect_gate_script_term_missing:${term}`);
    }
  }
  const gateTestTerms = [
    "testDuplicateWitnessBlocksBlockClosure",
    "testDuplicateReadyWitnessBlocksBlockClosure",
    "testCommentedSourceRuleDoesNotSatisfyGate",
    "testEmbeddedSourceRuleDoesNotSatisfyGate",
  ];
  for (const term of gateTestTerms) {
    if (!wwwRedirectGateTest.includes(term)) {
      recordFailure(`www_canonical_redirect_gate_test_term_missing:${term}`);
    }
  }
  const infrastructureTerms = [
    "| Canonical host | Live | `www.mullusi.com` root and path/query witnesses return one-hop 301 redirects to apex through Cloudflare | None |",
    "| `https://www.mullusi.com` | One-hop 301 to `https://mullusi.com/`, then 200 through Cloudflare |",
    "| `https://www.mullusi.com/proof/?gate=www-canonical` | One-hop 301 to `https://mullusi.com/proof/?gate=www-canonical`, then 200 through Cloudflare |",
    "| `www.mullusi.com` | Live | Canonical one-hop 301 redirect to apex with path/query preservation | Keep redirect stable |",
    "www one-hop 301 root and path/query witnesses verified",
  ];
  for (const term of infrastructureTerms) {
    if (!infrastructureRoot.includes(term)) {
      recordFailure(`www_canonical_redirect_infra_term_missing:${term}`);
    }
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
  for (const htmlFile of ["index.html", "mullu/index.html", "proof/index.html", "playground/index.html", "404.html"]) {
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

  const css = readUtf8("assets/styles.css");
  for (const match of css.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
    const url = match[1];
    if (/^(https?:|data:)/.test(url)) {
      continue;
    }
    const target = path.normalize(path.join("assets", url.split(/[?#]/)[0])).replaceAll("\\", "/");
    if (!pathExists(target)) {
      recordFailure(`css_asset_missing:assets/styles.css->${url}`);
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

function validateSvgAssets() {
  const svgFiles = requiredFiles.filter((fileName) => fileName.endsWith(".svg"));
  for (const fileName of svgFiles) {
    const svg = readUtf8(fileName);
    if (!/<svg\b[^>]*viewBox="[^"]+"/.test(svg)) {
      recordFailure(`svg_viewbox_missing:${fileName}`);
    }
    if (!/<title\b[^>]*>[^<]+<\/title>/.test(svg)) {
      recordFailure(`svg_title_missing:${fileName}`);
    }
    if (!/<desc\b[^>]*>[^<]+<\/desc>/.test(svg)) {
      recordFailure(`svg_desc_missing:${fileName}`);
    }
    if (/<script\b|<foreignObject\b|javascript:|on[a-z]+\s*=/i.test(svg)) {
      recordFailure(`svg_active_content_forbidden:${fileName}`);
    }
    if (/https?:\/\//i.test(svg.replace('xmlns="http://www.w3.org/2000/svg"', ""))) {
      recordFailure(`svg_external_reference_forbidden:${fileName}`);
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
  if (!Array.isArray(registry.productRegistry)) {
    recordFailure("registry_product_registry_not_array");
    return;
  }
  if (!Array.isArray(registry.futureDomains)) {
    recordFailure("registry_future_domains_not_array");
    return;
  }

  const seenProductNames = new Set();
  for (const [index, product] of registry.productRegistry.entries()) {
    const label = `productRegistry.${index}`;
    const name = requireString(product.name, `${label}.name`);
    const classification = requireString(product.classification, `${label}.classification`);
    const status = requireString(product.status, `${label}.status`);
    requireString(product.owner, `${label}.owner`);
    const sourceBoundary = requireString(product.sourceBoundary, `${label}.sourceBoundary`);
    requireString(product.runtimeType, `${label}.runtimeType`);
    requireString(product.dataType, `${label}.dataType`);
    requireString(product.releaseGate, `${label}.releaseGate`);
    const docsPath = requireString(product.docsPath, `${label}.docsPath`);
    const apiPath = requireString(product.apiPath, `${label}.apiPath`);
    const evidencePath = requireString(product.evidencePath, `${label}.evidencePath`);
    requireString(product.failureMode, `${label}.failureMode`);
    requireString(product.summary, `${label}.summary`);
    if (!allowedProductClassifications.has(classification)) {
      recordFailure(`product_classification_invalid:${name}:${classification}`);
    }
    if (!allowedProductStatuses.has(status)) {
      recordFailure(`product_status_invalid:${name}:${status}`);
    }
    if (Object.prototype.hasOwnProperty.call(product, "repo") || Object.prototype.hasOwnProperty.call(product, "plannedRepo")) {
      recordFailure(`product_repo_field_forbidden:${name}`);
    }
    if (/github\.com\//i.test(sourceBoundary)) {
      recordFailure(`product_source_boundary_public_repo_forbidden:${name}`);
    }
    if (!/^docs\.mullusi\.com(?:\/[a-z0-9-]+)?$/.test(docsPath) && docsPath !== "private docs only") {
      recordFailure(`product_docs_path_invalid:${name}:${docsPath}`);
    }
    if (!/^(GET|POST) \/v1\/[a-z0-9_{}\/-]+$/.test(apiPath) && apiPath !== "client access to governed API routes" && apiPath !== "no public endpoint") {
      recordFailure(`product_api_path_invalid:${name}:${apiPath}`);
    }
    if (!/^\/proof\/$/.test(evidencePath) && evidencePath !== "#evidence") {
      recordFailure(`product_evidence_path_invalid:${name}:${evidencePath}`);
    }
    if (seenProductNames.has(name)) {
      recordFailure(`product_name_duplicate:${name}`);
    }
    seenProductNames.add(name);
  }

  const seenRepos = new Set();
  for (const [index, system] of registry.systems.entries()) {
    const label = `systems.${index}`;
    const name = requireString(system.name, `${label}.name`);
    const href = requireString(system.href, `${label}.href`);
    const sourceState = requireString(system.sourceState, `${label}.sourceState`);
    requireString(system.category, `${label}.category`);
    requireString(system.summary, `${label}.summary`);
    if (!allowedSystemStatuses.has(system.status)) {
      recordFailure(`system_status_invalid:${name}:${system.status}`);
    }
    if (!/^https:\/\/(?:[a-z0-9.-]+\.)?mullusi\.com(?:\/.*)?$/.test(href)) {
      recordFailure(`system_href_invalid:${name}:${href}`);
    }
    if (sourceState !== "private-source" && sourceState !== "public-release") {
      recordFailure(`system_source_state_invalid:${name}:${sourceState}`);
    }
    if (Object.prototype.hasOwnProperty.call(system, "repo")) {
      recordFailure(`system_repo_field_forbidden:${name}`);
    }
    if (seenRepos.has(href)) {
      recordFailure(`system_href_duplicate:${href}`);
    }
    seenRepos.add(href);
    if (!Array.isArray(system.tags) || system.tags.length === 0) {
      recordFailure(`${label}.tags_missing`);
    }
  }

  const seenSlugs = new Set();
  for (const [index, domain] of registry.futureDomains.entries()) {
    const label = `futureDomains.${index}`;
    const name = requireString(domain.name, `${label}.name`);
    const slug = requireString(domain.slug, `${label}.slug`);
    requireString(domain.releaseBoundary, `${label}.releaseBoundary`);
    requireString(domain.summary, `${label}.summary`);
    if (!allowedFutureStatuses.has(domain.status)) {
      recordFailure(`future_status_invalid:${name}:${domain.status}`);
    }
    if (Object.prototype.hasOwnProperty.call(domain, "plannedRepo")) {
      recordFailure(`future_planned_repo_field_forbidden:${name}`);
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

function validateNewsFeed() {
  const feed = JSON.parse(readUtf8("data/news.json"));
  requireString(feed?.meta?.name, "news.meta.name");
  const sourceUrl = requireString(feed?.meta?.sourceUrl, "news.meta.sourceUrl");
  requireString(feed?.meta?.updated, "news.meta.updated");

  if (!/^https:\/\//.test(sourceUrl)) {
    recordFailure(`news_source_url_not_https:${sourceUrl}`);
  }
  if (!Array.isArray(feed.items)) {
    recordFailure("news_items_not_array");
    return;
  }
  if (feed.meta?.count !== feed.items.length) {
    recordFailure(`news_count_mismatch:${feed.meta?.count}:${feed.items.length}`);
  }
  if (feed.items.length < 3 || feed.items.length > 7) {
    recordFailure(`news_item_count_out_of_bounds:${feed.items.length}`);
  }

  const seenUrls = new Set();
  for (const [index, item] of feed.items.entries()) {
    const label = `news.items.${index}`;
    const title = requireString(item.title, `${label}.title`);
    const url = requireString(item.url, `${label}.url`);
    requireString(item.source, `${label}.source`);
    const date = requireString(item.date, `${label}.date`);
    if (new RegExp("\\bA" + "I\\b").test(title) || new RegExp("\\ba" + "rtificial\\s+i" + "ntelligence\\b", "i").test(title)) {
      recordFailure(`news_title_public_text_forbidden:${title}`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      recordFailure(`news_date_invalid:${label}:${date}`);
    }
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      recordFailure(`news_url_invalid:${label}:${url}`);
      continue;
    }
    if (parsedUrl.protocol !== "https:") {
      recordFailure(`news_url_not_https:${label}:${url}`);
    }
    if (seenUrls.has(parsedUrl.toString())) {
      recordFailure(`news_url_duplicate:${url}`);
    }
    seenUrls.add(parsedUrl.toString());
    if (!Number.isFinite(item.points) || item.points < 0) {
      recordFailure(`news_points_invalid:${label}:${item.points}`);
    }
    if (!Number.isFinite(item.comments) || item.comments < 0) {
      recordFailure(`news_comments_invalid:${label}:${item.comments}`);
    }
  }
}

function validateSiteContent() {
  const content = JSON.parse(readUtf8("data/site.json"));
  requireString(content?.meta?.name, "site.meta.name");
  requireString(content?.meta?.version, "site.meta.version");
  requireString(content?.meta?.purpose, "site.meta.purpose");
  const expectedPlatformBuildOrder = [
    "Public website",
    "Docs route",
    "Private source boundary",
    "Cloudflare edge",
    "Control-plane skeleton",
    "API health endpoint",
    "User/auth layer",
    "First governed product",
  ];

  if (!Array.isArray(content.platformLayers) || content.platformLayers.length < 5) {
    recordFailure("site_platform_layers_missing");
  } else {
    for (const [index, layer] of content.platformLayers.entries()) {
      const label = `site.platformLayers.${index}`;
      requireString(layer.name, `${label}.name`);
      requireString(layer.role, `${label}.role`);
      requireString(layer.boundary, `${label}.boundary`);
      requireString(layer.governs, `${label}.governs`);
      if (!Array.isArray(layer.components) || layer.components.length === 0) {
        recordFailure(`${label}.components_missing`);
      } else {
        for (const [componentIndex, component] of layer.components.entries()) {
          requireString(component, `${label}.components.${componentIndex}`);
        }
      }
    }
  }

  const requestFlow = content.requestFlow;
  if (!requestFlow || typeof requestFlow !== "object") {
    recordFailure("site_request_flow_missing");
  } else {
    requireString(requestFlow.label, "site.requestFlow.label");
    requireString(requestFlow.title, "site.requestFlow.title");
    requireString(requestFlow.summary, "site.requestFlow.summary");
    if (!Array.isArray(requestFlow.steps) || requestFlow.steps.length < 5) {
      recordFailure("site_request_flow_steps_missing");
    } else {
      for (const [index, step] of requestFlow.steps.entries()) {
        requireString(step, `site.requestFlow.steps.${index}`);
      }
    }
    if (!Array.isArray(requestFlow.guards) || requestFlow.guards.length < 4) {
      recordFailure("site_request_flow_guards_missing");
    } else {
      for (const [index, guard] of requestFlow.guards.entries()) {
        requireString(guard, `site.requestFlow.guards.${index}`);
      }
    }
  }

  const platformBuildSequence = content.platformBuildSequence;
  if (!platformBuildSequence || typeof platformBuildSequence !== "object") {
    recordFailure("site_platform_build_sequence_missing");
  } else {
    requireString(platformBuildSequence.label, "site.platformBuildSequence.label");
    requireString(platformBuildSequence.title, "site.platformBuildSequence.title");
    requireString(platformBuildSequence.summary, "site.platformBuildSequence.summary");
    if (!Array.isArray(platformBuildSequence.steps) || platformBuildSequence.steps.length !== expectedPlatformBuildOrder.length) {
      recordFailure("site_platform_build_sequence_steps_invalid");
    } else {
      for (const [index, step] of platformBuildSequence.steps.entries()) {
        const label = `site.platformBuildSequence.steps.${index}`;
        requireString(step.phase, `${label}.phase`);
        const name = requireString(step.name, `${label}.name`);
        requireString(step.status, `${label}.status`);
        requireString(step.reason, `${label}.reason`);
        if (name !== expectedPlatformBuildOrder[index]) {
          recordFailure(`site_platform_build_sequence_order_invalid:${index}:${name}`);
        }
      }
    }
  }

  if (!Array.isArray(content.productQuestions) || content.productQuestions.length !== 10) {
    recordFailure("site_product_questions_invalid");
  } else {
    for (const [index, question] of content.productQuestions.entries()) {
      requireString(question, `site.productQuestions.${index}`);
    }
  }

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
    const requiredCoreApiRoutes = new Set([
      "POST /v1/govern/evaluate",
      "GET /v1/evaluations/{evaluation_id}/trace",
      "GET /v1/proof-stamps/{stamp_id}",
    ]);
    const apiContractRoutes = new Set(content.apiContracts.map((contract) => contract.route));
    for (const route of requiredCoreApiRoutes) {
      if (!apiContractRoutes.has(route)) {
        recordFailure(`site_api_contract_core_route_missing:${route}`);
      }
    }
  }

  const statusBoard = content.statusBoard;
  if (!statusBoard || typeof statusBoard !== "object") {
    recordFailure("site_status_board_missing");
  } else {
    requireString(statusBoard.label, "site.statusBoard.label");
    requireString(statusBoard.title, "site.statusBoard.title");
    requireString(statusBoard.follow, "site.statusBoard.follow");
    const followHref = requireString(statusBoard.followHref, "site.statusBoard.followHref");
    requireString(statusBoard.followLabel, "site.statusBoard.followLabel");
    if (!/^(https:\/\/|mailto:)/.test(followHref)) {
      recordFailure(`site_status_board_follow_href_invalid:${followHref}`);
    }
    if (!Array.isArray(statusBoard.rows) || statusBoard.rows.length < 3) {
      recordFailure("site_status_board_rows_missing");
    } else {
      for (const [index, row] of statusBoard.rows.entries()) {
        const label = `site.statusBoard.rows.${index}`;
        requireString(row.component, `${label}.component`);
        const state = requireString(row.state, `${label}.state`);
        requireString(row.note, `${label}.note`);
        if (!allowedStatusBoardStates.has(state)) {
          recordFailure(`site_status_board_state_invalid:${label}:${state}`);
        }
      }
    }
    const requiredWitnessPaths = new Set(["/health", "/gateway/witness", "/runtime/conformance"]);
    if (!Array.isArray(statusBoard.witnessChecks) || statusBoard.witnessChecks.length !== requiredWitnessPaths.size) {
      recordFailure("site_status_board_witness_checks_invalid");
    } else {
      const seenWitnessPaths = new Set();
      for (const [index, check] of statusBoard.witnessChecks.entries()) {
        const label = `site.statusBoard.witnessChecks.${index}`;
        const checkPath = requireString(check.path, `${label}.path`);
        const state = requireString(check.state, `${label}.state`);
        requireString(check.purpose, `${label}.purpose`);
        if (!requiredWitnessPaths.has(checkPath)) {
          recordFailure(`site_status_board_witness_path_invalid:${checkPath}`);
        }
        if (!allowedStatusBoardStates.has(state)) {
          recordFailure(`site_status_board_witness_state_invalid:${checkPath}:${state}`);
        }
        if (seenWitnessPaths.has(checkPath)) {
          recordFailure(`site_status_board_witness_path_duplicate:${checkPath}`);
        }
        seenWitnessPaths.add(checkPath);
      }
    }
    if (!Array.isArray(statusBoard.closureGates) || statusBoard.closureGates.length !== requiredWitnessPaths.size) {
      recordFailure("site_status_board_closure_gates_invalid");
    } else {
      const seenClosureDependencies = new Set();
      for (const [index, gate] of statusBoard.closureGates.entries()) {
        const label = `site.statusBoard.closureGates.${index}`;
        requireString(gate.gate, `${label}.gate`);
        const dependsOn = requireString(gate.dependsOn, `${label}.dependsOn`);
        const state = requireString(gate.state, `${label}.state`);
        requireString(gate.evidence, `${label}.evidence`);
        requireString(gate.protects, `${label}.protects`);
        requireString(gate.failureAction, `${label}.failureAction`);
        if (!requiredWitnessPaths.has(dependsOn)) {
          recordFailure(`site_status_board_closure_dependency_invalid:${dependsOn}`);
        }
        if (!allowedStatusBoardStates.has(state)) {
          recordFailure(`site_status_board_closure_state_invalid:${dependsOn}:${state}`);
        }
        if (seenClosureDependencies.has(dependsOn)) {
          recordFailure(`site_status_board_closure_dependency_duplicate:${dependsOn}`);
        }
        seenClosureDependencies.add(dependsOn);
      }
    }
    const healthWitness = statusBoard.healthWitness;
    if (!healthWitness || typeof healthWitness !== "object" || Array.isArray(healthWitness)) {
      recordFailure("site_status_board_health_witness_missing");
    } else {
      requireString(healthWitness.label, "site.statusBoard.healthWitness.label");
      requireString(healthWitness.title, "site.statusBoard.healthWitness.title");
      const route = requireString(healthWitness.route, "site.statusBoard.healthWitness.route");
      const versionedRoute = requireString(healthWitness.versionedRoute, "site.statusBoard.healthWitness.versionedRoute");
      const versionRoute = requireString(healthWitness.versionRoute, "site.statusBoard.healthWitness.versionRoute");
      const state = requireString(healthWitness.status, "site.statusBoard.healthWitness.status");
      requireString(healthWitness.summary, "site.statusBoard.healthWitness.summary");
      if (route !== "/health" || versionedRoute !== "/v1/health" || versionRoute !== "/v1/version") {
        recordFailure(`site_status_board_health_witness_route_invalid:${route}:${versionedRoute}:${versionRoute}`);
      }
      if (!allowedStatusBoardStates.has(state)) {
        recordFailure(`site_status_board_health_witness_state_invalid:${state}`);
      }
      const requiredHealthExamples = new Set(["ok", "versioned"]);
      if (!Array.isArray(healthWitness.responseExamples) || healthWitness.responseExamples.length < requiredHealthExamples.size) {
        recordFailure("site_status_board_health_witness_examples_missing");
      } else {
        const observedHealthExamples = new Set();
        for (const [index, example] of healthWitness.responseExamples.entries()) {
          const label = `site.statusBoard.healthWitness.responseExamples.${index}`;
          requireString(example.title, `${label}.title`);
          const exampleState = requireString(example.state, `${label}.state`);
          requireString(example.purpose, `${label}.purpose`);
          if (example.statusCode !== 200) {
            recordFailure(`site_status_board_health_witness_example_status_invalid:${exampleState}:${example.statusCode}`);
          }
          const body = example.body;
          if (!body || typeof body !== "object" || Array.isArray(body)) {
            recordFailure(`site_status_board_health_witness_example_body_invalid:${exampleState}`);
            continue;
          }
          if (exampleState === "ok") {
            if (body.status !== "ok" || body.service !== "mullusi-govern-cloud") {
              recordFailure(`site_status_board_health_witness_health_body_invalid:${JSON.stringify(body)}`);
            }
          } else if (exampleState === "versioned") {
            if (body.api !== "2026.05.v1" || body.evaluator !== "govern-evaluator.v1") {
              recordFailure(`site_status_board_health_witness_version_body_invalid:${JSON.stringify(body)}`);
            }
          } else {
            recordFailure(`site_status_board_health_witness_example_state_invalid:${exampleState}`);
          }
          observedHealthExamples.add(exampleState);
        }
        for (const exampleState of requiredHealthExamples) {
          if (!observedHealthExamples.has(exampleState)) {
            recordFailure(`site_status_board_health_witness_example_missing:${exampleState}`);
          }
        }
      }
    }
    const runtimeConformance = statusBoard.runtimeConformance;
    if (!runtimeConformance || typeof runtimeConformance !== "object" || Array.isArray(runtimeConformance)) {
      recordFailure("site_status_board_runtime_conformance_missing");
    } else {
      requireString(runtimeConformance.label, "site.statusBoard.runtimeConformance.label");
      requireString(runtimeConformance.title, "site.statusBoard.runtimeConformance.title");
      const route = requireString(runtimeConformance.route, "site.statusBoard.runtimeConformance.route");
      const versionedRoute = requireString(runtimeConformance.versionedRoute, "site.statusBoard.runtimeConformance.versionedRoute");
      const state = requireString(runtimeConformance.status, "site.statusBoard.runtimeConformance.status");
      requireString(runtimeConformance.summary, "site.statusBoard.runtimeConformance.summary");
      if (route !== "/runtime/conformance" || versionedRoute !== "/v1/runtime/conformance") {
        recordFailure(`site_status_board_runtime_conformance_route_invalid:${route}:${versionedRoute}`);
      }
      if (!allowedStatusBoardStates.has(state)) {
        recordFailure(`site_status_board_runtime_conformance_state_invalid:${state}`);
      }
      const requiredFindingNames = new Set([
        "required_environment",
        "image",
        "MULLUSI_DEV_API_KEY",
        "MULLUSI_OPERATOR_API_KEY",
        "MULLUSI_PROOF_SIGNING_KEY",
        "database_url",
        "persistence_policy",
        "allowed_origins",
        "database_schema",
      ]);
      if (!Array.isArray(runtimeConformance.findingContract) || runtimeConformance.findingContract.length < requiredFindingNames.size) {
        recordFailure("site_status_board_runtime_conformance_findings_missing");
      } else {
        const observedFindings = new Set();
        for (const [index, finding] of runtimeConformance.findingContract.entries()) {
          const label = `site.statusBoard.runtimeConformance.findingContract.${index}`;
          const name = requireString(finding.name, `${label}.name`);
          requireString(finding.passDetail, `${label}.passDetail`);
          requireString(finding.blocks, `${label}.blocks`);
          observedFindings.add(name);
        }
        for (const name of requiredFindingNames) {
          if (!observedFindings.has(name)) {
            recordFailure(`site_status_board_runtime_conformance_finding_missing:${name}`);
          }
        }
      }
      const requiredRuntimeStates = new Set(["AwaitingEvidence", "SolvedVerified"]);
      if (!Array.isArray(runtimeConformance.responseExamples) || runtimeConformance.responseExamples.length < requiredRuntimeStates.size) {
        recordFailure("site_status_board_runtime_conformance_examples_missing");
      } else {
        const observedRuntimeStates = new Set();
        for (const [index, example] of runtimeConformance.responseExamples.entries()) {
          const label = `site.statusBoard.runtimeConformance.responseExamples.${index}`;
          requireString(example.title, `${label}.title`);
          const runtimeState = requireString(example.runtimeState, `${label}.runtimeState`);
          requireString(example.purpose, `${label}.purpose`);
          if (!requiredRuntimeStates.has(runtimeState)) {
            recordFailure(`site_status_board_runtime_conformance_example_state_invalid:${runtimeState}`);
          }
          if (example.statusCode !== 200) {
            recordFailure(`site_status_board_runtime_conformance_example_status_invalid:${runtimeState}:${example.statusCode}`);
          }
          const body = example.body;
          if (!body || typeof body !== "object" || Array.isArray(body)) {
            recordFailure(`site_status_board_runtime_conformance_example_body_invalid:${runtimeState}`);
            continue;
          }
          if (body.runtime_state !== runtimeState) {
            recordFailure(`site_status_board_runtime_conformance_example_body_state_mismatch:${runtimeState}:${body.runtime_state}`);
          }
          if (runtimeState === "AwaitingEvidence" && body.release_gate !== "blocked") {
            recordFailure(`site_status_board_runtime_conformance_example_blocked_gate_invalid:${body.release_gate}`);
          }
          if (runtimeState === "SolvedVerified" && body.release_gate !== "ready") {
            recordFailure(`site_status_board_runtime_conformance_example_ready_gate_invalid:${body.release_gate}`);
          }
          if (!Array.isArray(body.findings) || body.findings.length === 0) {
            recordFailure(`site_status_board_runtime_conformance_example_findings_missing:${runtimeState}`);
          } else {
            for (const [findingIndex, finding] of body.findings.entries()) {
              const findingLabel = `${label}.body.findings.${findingIndex}`;
              const findingName = requireString(finding.name, `${findingLabel}.name`);
              const findingState = requireString(finding.state, `${findingLabel}.state`);
              requireString(finding.detail, `${findingLabel}.detail`);
              if (!requiredFindingNames.has(findingName)) {
                recordFailure(`site_status_board_runtime_conformance_example_finding_invalid:${runtimeState}:${findingName}`);
              }
              if (!["pass", "fail"].includes(findingState)) {
                recordFailure(`site_status_board_runtime_conformance_example_finding_state_invalid:${runtimeState}:${findingState}`);
              }
            }
          }
          const serialized = JSON.stringify(body);
          for (const forbiddenSecret of ["prod-proof-key", "prod-api-key", "prod-operator-key", "prod-db-secret"]) {
            if (serialized.includes(forbiddenSecret)) {
              recordFailure(`site_status_board_runtime_conformance_example_secret_leak:${forbiddenSecret}`);
            }
          }
          observedRuntimeStates.add(runtimeState);
        }
        for (const runtimeState of requiredRuntimeStates) {
          if (!observedRuntimeStates.has(runtimeState)) {
            recordFailure(`site_status_board_runtime_conformance_example_missing:${runtimeState}`);
          }
        }
      }
    }
    const gatewayWitness = statusBoard.gatewayWitness;
    const requiredProtectedPaths = new Set([
      "/v1/govern/evaluate",
      "/v1/evaluations/{evaluation_id}/trace",
      "/v1/proof-stamps/{stamp_id}",
      "/v1/proof-stamps/{stamp_id}/revoke",
      "/v1/proof-stamps/{stamp_id}/revocation",
    ]);
    if (!gatewayWitness || typeof gatewayWitness !== "object" || Array.isArray(gatewayWitness)) {
      recordFailure("site_status_board_gateway_witness_missing");
    } else {
      requireString(gatewayWitness.label, "site.statusBoard.gatewayWitness.label");
      const route = requireString(gatewayWitness.route, "site.statusBoard.gatewayWitness.route");
      const versionedRoute = requireString(gatewayWitness.versionedRoute, "site.statusBoard.gatewayWitness.versionedRoute");
      const state = requireString(gatewayWitness.status, "site.statusBoard.gatewayWitness.status");
      requireString(gatewayWitness.summary, "site.statusBoard.gatewayWitness.summary");
      if (route !== "/gateway/witness" || versionedRoute !== "/v1/gateway/witness") {
        recordFailure(`site_status_board_gateway_witness_route_invalid:${route}:${versionedRoute}`);
      }
      if (!allowedStatusBoardStates.has(state)) {
        recordFailure(`site_status_board_gateway_witness_state_invalid:${state}`);
      }
      if (!Array.isArray(gatewayWitness.protectedPaths) || gatewayWitness.protectedPaths.length !== requiredProtectedPaths.size) {
        recordFailure("site_status_board_gateway_witness_protected_paths_invalid");
      } else {
        const observedProtectedPaths = new Set(gatewayWitness.protectedPaths);
        for (const path of requiredProtectedPaths) {
          if (!observedProtectedPaths.has(path)) {
            recordFailure(`site_status_board_gateway_witness_protected_path_missing:${path}`);
          }
        }
      }
      const requiredGatewayStates = new Set(["AwaitingEvidence", "SolvedVerified"]);
      if (!Array.isArray(gatewayWitness.responseExamples) || gatewayWitness.responseExamples.length < requiredGatewayStates.size) {
        recordFailure("site_status_board_gateway_witness_examples_missing");
      } else {
        const observedGatewayStates = new Set();
        for (const [index, example] of gatewayWitness.responseExamples.entries()) {
          const label = `site.statusBoard.gatewayWitness.responseExamples.${index}`;
          requireString(example.title, `${label}.title`);
          const runtimeState = requireString(example.runtimeState, `${label}.runtimeState`);
          requireString(example.purpose, `${label}.purpose`);
          if (!requiredGatewayStates.has(runtimeState)) {
            recordFailure(`site_status_board_gateway_witness_example_state_invalid:${runtimeState}`);
          }
          if (example.statusCode !== 200) {
            recordFailure(`site_status_board_gateway_witness_example_status_invalid:${runtimeState}:${example.statusCode}`);
          }
          const body = example.body;
          if (!body || typeof body !== "object" || Array.isArray(body)) {
            recordFailure(`site_status_board_gateway_witness_example_body_invalid:${runtimeState}`);
            continue;
          }
          const requiredGatewayBodyKeys = [
            "service",
            "api",
            "evaluator",
            "runtime_state",
            "release_gate",
            "health_path",
            "conformance_path",
            "protected_paths",
            "findings",
          ];
          for (const key of requiredGatewayBodyKeys) {
            if (!(key in body)) {
              recordFailure(`site_status_board_gateway_witness_example_body_key_missing:${runtimeState}:${key}`);
            }
          }
          if (body.service !== "mullusi-govern-cloud" || body.api !== "2026.05.v1" || body.evaluator !== "govern-evaluator.v1") {
            recordFailure(`site_status_board_gateway_witness_example_metadata_invalid:${runtimeState}`);
          }
          if (body.runtime_state !== runtimeState) {
            recordFailure(`site_status_board_gateway_witness_example_body_state_mismatch:${runtimeState}:${body.runtime_state}`);
          }
          if (runtimeState === "AwaitingEvidence" && body.release_gate !== "blocked") {
            recordFailure(`site_status_board_gateway_witness_example_blocked_gate_invalid:${body.release_gate}`);
          }
          if (runtimeState === "SolvedVerified" && body.release_gate !== "ready") {
            recordFailure(`site_status_board_gateway_witness_example_ready_gate_invalid:${body.release_gate}`);
          }
          if (body.health_path !== "/health" || body.conformance_path !== "/runtime/conformance") {
            recordFailure(`site_status_board_gateway_witness_example_path_invalid:${runtimeState}:${body.health_path}:${body.conformance_path}`);
          }
          if (!Array.isArray(body.protected_paths) || body.protected_paths.length !== requiredProtectedPaths.size) {
            recordFailure(`site_status_board_gateway_witness_example_protected_paths_invalid:${runtimeState}`);
          } else {
            const observedExampleProtectedPaths = new Set(body.protected_paths);
            for (const path of requiredProtectedPaths) {
              if (!observedExampleProtectedPaths.has(path)) {
                recordFailure(`site_status_board_gateway_witness_example_protected_path_missing:${runtimeState}:${path}`);
              }
            }
          }
          if (!Array.isArray(body.findings) || body.findings.length === 0) {
            recordFailure(`site_status_board_gateway_witness_example_findings_missing:${runtimeState}`);
          } else {
            for (const [findingIndex, finding] of body.findings.entries()) {
              const findingLabel = `${label}.body.findings.${findingIndex}`;
              requireString(finding.name, `${findingLabel}.name`);
              const findingState = requireString(finding.state, `${findingLabel}.state`);
              requireString(finding.detail, `${findingLabel}.detail`);
              if (!["pass", "fail"].includes(findingState)) {
                recordFailure(`site_status_board_gateway_witness_example_finding_state_invalid:${runtimeState}:${findingState}`);
              }
            }
          }
          const serialized = JSON.stringify(body);
          for (const forbiddenSecret of ["prod-proof-key", "prod-api-key", "prod-operator-key", "prod-db-secret"]) {
            if (serialized.includes(forbiddenSecret)) {
              recordFailure(`site_status_board_gateway_witness_example_secret_leak:${forbiddenSecret}`);
            }
          }
          observedGatewayStates.add(runtimeState);
        }
        for (const runtimeState of requiredGatewayStates) {
          if (!observedGatewayStates.has(runtimeState)) {
            recordFailure(`site_status_board_gateway_witness_example_missing:${runtimeState}`);
          }
        }
      }
    }
    const requiredPrivateProofRoutes = new Set([
      "POST /v1/proof-stamps/{stamp_id}/revoke",
      "GET /v1/proof-stamps/{stamp_id}/revocation",
    ]);
    const privateProofContracts = new Map(
      content.apiContracts
        .filter((contract) => requiredPrivateProofRoutes.has(contract.route))
        .map((contract) => [contract.route, contract]),
    );
    for (const route of requiredPrivateProofRoutes) {
      const contract = privateProofContracts.get(route);
      if (!contract) {
        recordFailure(`site_api_contract_private_proof_route_missing:${route}`);
        continue;
      }
      if (contract.status !== "private operator") {
        recordFailure(`site_api_contract_private_proof_status_invalid:${route}:${contract.status}`);
      }
      const joinedContract = `${contract.input} ${contract.output} ${contract.summary}`;
      if (!/operator key/i.test(joinedContract)) {
        recordFailure(`site_api_contract_private_proof_operator_boundary_missing:${route}`);
      }
    }
  }

  const proofStampArtifact = content.proofStampArtifact;
  if (!proofStampArtifact || typeof proofStampArtifact !== "object") {
    recordFailure("site_proof_stamp_artifact_missing");
  } else {
    requireString(proofStampArtifact.label, "site.proofStampArtifact.label");
    requireString(proofStampArtifact.title, "site.proofStampArtifact.title");
    requireString(proofStampArtifact.summary, "site.proofStampArtifact.summary");
    const stampStatus = requireString(proofStampArtifact.status, "site.proofStampArtifact.status");
    requireString(proofStampArtifact.version, "site.proofStampArtifact.version");
    if (!allowedStatusBoardStates.has(stampStatus)) {
      recordFailure(`site_proof_stamp_artifact_status_invalid:${stampStatus}`);
    }
    const requiredStampFields = new Set([
      "stamp_id",
      "evaluation_id",
      "subject",
      "verdict",
      "proof_state",
      "policy_version",
      "registry_version",
      "witness_set",
      "trace_ref",
      "issued_at",
      "content_hash",
      "signature",
    ]);
    if (!Array.isArray(proofStampArtifact.fields) || proofStampArtifact.fields.length < requiredStampFields.size) {
      recordFailure("site_proof_stamp_artifact_fields_missing");
    } else {
      const seenStampFields = new Set();
      const allowedFieldTypes = new Set(["array", "datetime", "enum", "hash", "object", "signature", "string", "uri"]);
      for (const [index, field] of proofStampArtifact.fields.entries()) {
        const label = `site.proofStampArtifact.fields.${index}`;
        const name = requireString(field.name, `${label}.name`);
        const type = requireString(field.type, `${label}.type`);
        requireString(field.purpose, `${label}.purpose`);
        if (field.required !== true) {
          recordFailure(`site_proof_stamp_artifact_field_not_required:${name}`);
        }
        if (!allowedFieldTypes.has(type)) {
          recordFailure(`site_proof_stamp_artifact_field_type_invalid:${name}:${type}`);
        }
        if (seenStampFields.has(name)) {
          recordFailure(`site_proof_stamp_artifact_field_duplicate:${name}`);
        }
        seenStampFields.add(name);
      }
      for (const requiredField of requiredStampFields) {
        if (!seenStampFields.has(requiredField)) {
          recordFailure(`site_proof_stamp_artifact_required_field_missing:${requiredField}`);
        }
      }
    }
    if (!Array.isArray(proofStampArtifact.issueRequirements) || proofStampArtifact.issueRequirements.length < 5) {
      recordFailure("site_proof_stamp_artifact_requirements_missing");
    } else {
      const requirementText = proofStampArtifact.issueRequirements.join(" ");
      for (const requiredPath of ["/health", "/gateway/witness", "/runtime/conformance"]) {
        if (!requirementText.includes(requiredPath)) {
          recordFailure(`site_proof_stamp_artifact_requirement_path_missing:${requiredPath}`);
        }
      }
      for (const [index, requirement] of proofStampArtifact.issueRequirements.entries()) {
        requireString(requirement, `site.proofStampArtifact.issueRequirements.${index}`);
      }
    }
    const requiredLifecycleStates = new Set(["Eligible", "Issued", "Verified", "Revoked"]);
    if (!Array.isArray(proofStampArtifact.lifecycle) || proofStampArtifact.lifecycle.length < requiredLifecycleStates.size) {
      recordFailure("site_proof_stamp_artifact_lifecycle_missing");
    } else {
      const seenLifecycleStates = new Set();
      for (const [index, item] of proofStampArtifact.lifecycle.entries()) {
        const label = `site.proofStampArtifact.lifecycle.${index}`;
        const lifecycleState = requireString(item.state, `${label}.state`);
        requireString(item.meaning, `${label}.meaning`);
        if (seenLifecycleStates.has(lifecycleState)) {
          recordFailure(`site_proof_stamp_artifact_lifecycle_duplicate:${lifecycleState}`);
        }
        seenLifecycleStates.add(lifecycleState);
      }
      for (const lifecycleState of requiredLifecycleStates) {
        if (!seenLifecycleStates.has(lifecycleState)) {
          recordFailure(`site_proof_stamp_artifact_lifecycle_state_missing:${lifecycleState}`);
        }
      }
    }
  }

  const proofStampVerifier = content.proofStampVerifier;
  if (!proofStampVerifier || typeof proofStampVerifier !== "object") {
    recordFailure("site_proof_stamp_verifier_missing");
  } else {
    requireString(proofStampVerifier.label, "site.proofStampVerifier.label");
    requireString(proofStampVerifier.title, "site.proofStampVerifier.title");
    requireString(proofStampVerifier.summary, "site.proofStampVerifier.summary");
    const verifierStatus = requireString(proofStampVerifier.status, "site.proofStampVerifier.status");
    const verifierRoute = requireString(proofStampVerifier.route, "site.proofStampVerifier.route");
    const verifierHost = requireString(proofStampVerifier.host, "site.proofStampVerifier.host");
    requireString(proofStampVerifier.input, "site.proofStampVerifier.input");
    requireString(proofStampVerifier.output, "site.proofStampVerifier.output");
    if (!allowedStatusBoardStates.has(verifierStatus)) {
      recordFailure(`site_proof_stamp_verifier_status_invalid:${verifierStatus}`);
    }
    if (verifierRoute !== "GET /v1/proof-stamps/{stamp_id}") {
      recordFailure(`site_proof_stamp_verifier_route_invalid:${verifierRoute}`);
    }
    if (verifierHost !== "api.mullusi.com") {
      recordFailure(`site_proof_stamp_verifier_host_invalid:${verifierHost}`);
    }
    const routeContractExists = Array.isArray(content.apiContracts)
      && content.apiContracts.some((contract) => contract.route === verifierRoute && contract.host === verifierHost);
    if (!routeContractExists) {
      recordFailure("site_proof_stamp_verifier_api_contract_missing");
    }
    const requiredVerifierDependencies = new Set([
      "stamp_id",
      "content_hash",
      "signature",
      "evaluation_id",
      "witness_set",
    ]);
    if (!Array.isArray(proofStampVerifier.checks) || proofStampVerifier.checks.length < 6) {
      recordFailure("site_proof_stamp_verifier_checks_missing");
    } else {
      const seenVerifierChecks = new Set();
      const seenVerifierDependencies = new Set();
      const allowedFailureStates = new Set(["AwaitingEvidence", "Invalid", "NotFound", "Revoked"]);
      for (const [index, check] of proofStampVerifier.checks.entries()) {
        const label = `site.proofStampVerifier.checks.${index}`;
        const checkName = requireString(check.name, `${label}.name`);
        const dependsOn = requireString(check.dependsOn, `${label}.dependsOn`);
        const failureState = requireString(check.failureState, `${label}.failureState`);
        requireString(check.purpose, `${label}.purpose`);
        if (!allowedFailureStates.has(failureState)) {
          recordFailure(`site_proof_stamp_verifier_failure_state_invalid:${checkName}:${failureState}`);
        }
        if (seenVerifierChecks.has(checkName)) {
          recordFailure(`site_proof_stamp_verifier_check_duplicate:${checkName}`);
        }
        seenVerifierChecks.add(checkName);
        seenVerifierDependencies.add(dependsOn);
      }
      for (const dependency of requiredVerifierDependencies) {
        if (!seenVerifierDependencies.has(dependency)) {
          recordFailure(`site_proof_stamp_verifier_dependency_missing:${dependency}`);
        }
      }
    }
    const requiredVerifierOutcomes = new Set(["Verified", "AwaitingEvidence", "Invalid", "Revoked", "NotFound"]);
    if (!Array.isArray(proofStampVerifier.outcomes) || proofStampVerifier.outcomes.length < requiredVerifierOutcomes.size) {
      recordFailure("site_proof_stamp_verifier_outcomes_missing");
    } else {
      const seenVerifierOutcomes = new Set();
      for (const [index, outcome] of proofStampVerifier.outcomes.entries()) {
        const label = `site.proofStampVerifier.outcomes.${index}`;
        const outcomeState = requireString(outcome.state, `${label}.state`);
        requireString(outcome.meaning, `${label}.meaning`);
        if (seenVerifierOutcomes.has(outcomeState)) {
          recordFailure(`site_proof_stamp_verifier_outcome_duplicate:${outcomeState}`);
        }
        seenVerifierOutcomes.add(outcomeState);
      }
      for (const outcomeState of requiredVerifierOutcomes) {
        if (!seenVerifierOutcomes.has(outcomeState)) {
          recordFailure(`site_proof_stamp_verifier_outcome_missing:${outcomeState}`);
        }
      }
    }
    if (!Array.isArray(proofStampVerifier.decisionLadder) || proofStampVerifier.decisionLadder.length < 6) {
      recordFailure("site_proof_stamp_verifier_decision_ladder_missing");
    } else {
      const seenDecisionStates = new Set();
      const seenDecisionSteps = new Set();
      const joinedDecisionActions = [];
      for (const [index, item] of proofStampVerifier.decisionLadder.entries()) {
        const label = `site.proofStampVerifier.decisionLadder.${index}`;
        const step = requireString(item.step, `${label}.step`);
        requireString(item.condition, `${label}.condition`);
        const publicState = requireString(item.publicState, `${label}.publicState`);
        requireString(item.evidence, `${label}.evidence`);
        const action = requireString(item.action, `${label}.action`);
        if (!/^\d{2}$/.test(step)) {
          recordFailure(`site_proof_stamp_verifier_decision_step_invalid:${step}`);
        }
        if (seenDecisionSteps.has(step)) {
          recordFailure(`site_proof_stamp_verifier_decision_step_duplicate:${step}`);
        }
        if (!requiredVerifierOutcomes.has(publicState)) {
          recordFailure(`site_proof_stamp_verifier_decision_state_invalid:${step}:${publicState}`);
        }
        seenDecisionSteps.add(step);
        seenDecisionStates.add(publicState);
        joinedDecisionActions.push(action);
      }
      for (const outcomeState of requiredVerifierOutcomes) {
        if (!seenDecisionStates.has(outcomeState)) {
          recordFailure(`site_proof_stamp_verifier_decision_state_missing:${outcomeState}`);
        }
      }
      const joinedDecisionText = joinedDecisionActions.join(" ");
      for (const requiredActionTerm of ["Block Verified", "Return Invalid", "Return Verified", "block the stale public claim"]) {
        if (!joinedDecisionText.includes(requiredActionTerm)) {
          recordFailure(`site_proof_stamp_verifier_decision_action_missing:${requiredActionTerm}`);
        }
      }
    }
    const requiredStateModel = new Map([
      ["record_missing", "NotFound"],
      ["unsigned", "AwaitingEvidence"],
      ["signing_key_missing", "AwaitingEvidence"],
      ["valid", "Verified"],
      ["invalid", "Invalid"],
      ["unsupported_algorithm", "Invalid"],
      ["revoked", "Revoked"],
    ]);
    if (!Array.isArray(proofStampVerifier.stateModel) || proofStampVerifier.stateModel.length < requiredStateModel.size) {
      recordFailure("site_proof_stamp_verifier_state_model_missing");
    } else {
      const seenStateModel = new Map();
      for (const [index, item] of proofStampVerifier.stateModel.entries()) {
        const label = `site.proofStampVerifier.stateModel.${index}`;
        const internal = requireString(item.internal, `${label}.internal`);
        const publicState = requireString(item.publicState, `${label}.publicState`);
        requireString(item.evidence, `${label}.evidence`);
        requireString(item.responseBoundary, `${label}.responseBoundary`);
        if (!requiredVerifierOutcomes.has(publicState)) {
          recordFailure(`site_proof_stamp_verifier_state_model_public_state_invalid:${internal}:${publicState}`);
        }
        if (seenStateModel.has(internal)) {
          recordFailure(`site_proof_stamp_verifier_state_model_duplicate:${internal}`);
        }
        seenStateModel.set(internal, publicState);
      }
      for (const [internal, publicState] of requiredStateModel.entries()) {
        if (seenStateModel.get(internal) !== publicState) {
          recordFailure(`site_proof_stamp_verifier_state_model_mapping_missing:${internal}:${publicState}`);
        }
      }
    }
    const sampleResponse = proofStampVerifier.sampleResponse;
    if (!sampleResponse || typeof sampleResponse !== "object" || Array.isArray(sampleResponse)) {
      recordFailure("site_proof_stamp_verifier_sample_missing");
    } else {
      const expectedSampleKeys = [
        "verification_state",
        "stamp_id",
        "envelope_version",
        "content_hash",
        "signature_state",
        "evaluation_id",
        "witness_state",
        "revocation_state",
        "checked_at",
        "note",
      ];
      for (const key of expectedSampleKeys) {
        requireString(sampleResponse[key], `site.proofStampVerifier.sampleResponse.${key}`);
      }
      if (sampleResponse.verification_state !== "AwaitingEvidence") {
        recordFailure(`site_proof_stamp_verifier_sample_state_invalid:${sampleResponse.verification_state}`);
      }
      if (sampleResponse.envelope_version !== proofStampArtifact?.version) {
        recordFailure(`site_proof_stamp_verifier_sample_version_mismatch:${sampleResponse.envelope_version}`);
      }
      if (!/^sha256:[a-z0-9-]+$/.test(sampleResponse.content_hash || "")) {
        recordFailure(`site_proof_stamp_verifier_sample_hash_invalid:${sampleResponse.content_hash}`);
      }
      if (sampleResponse.signature_state !== "not-issued") {
        recordFailure(`site_proof_stamp_verifier_sample_signature_invalid:${sampleResponse.signature_state}`);
      }
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(sampleResponse.checked_at || "")) {
        recordFailure(`site_proof_stamp_verifier_sample_checked_at_invalid:${sampleResponse.checked_at}`);
      }
      if (!/does not claim live runtime availability/i.test(sampleResponse.note || "")) {
        recordFailure("site_proof_stamp_verifier_sample_boundary_note_missing");
      }
    }
    const responseExamples = proofStampVerifier.responseExamples;
    const requiredTransportErrors = new Set(["PersistenceUnavailable"]);
    if (!Array.isArray(responseExamples) || responseExamples.length < requiredVerifierOutcomes.size + requiredTransportErrors.size) {
      recordFailure("site_proof_stamp_verifier_response_examples_missing");
    } else {
      const seenExampleStates = new Set();
      const expectedResponseKeys = [
        "verification_state",
        "stamp_id",
        "envelope_version",
        "content_hash",
        "signature_state",
        "witness_state",
        "revocation_state",
        "checked_at",
        "id",
        "evaluation_id",
        "state",
        "stamp_hash",
        "algorithm",
        "signature",
        "internal_verification_state",
      ];
      const allowedSignatureStates = new Set(["valid", "not-issued", "invalid", "unsupported-algorithm", "key-unavailable"]);
      const allowedRevocationStates = new Set(["not-revoked", "revoked"]);
      for (const [index, example] of responseExamples.entries()) {
        const label = `site.proofStampVerifier.responseExamples.${index}`;
        requireString(example.title, `${label}.title`);
        const state = requireString(example.state, `${label}.state`);
        requireString(example.purpose, `${label}.purpose`);
        const body = example.body;
        const isTransportError = requiredTransportErrors.has(state);
        if (!requiredVerifierOutcomes.has(state) && !isTransportError) {
          recordFailure(`site_proof_stamp_verifier_response_example_state_invalid:${state}`);
        }
        if (seenExampleStates.has(state)) {
          recordFailure(`site_proof_stamp_verifier_response_example_state_duplicate:${state}`);
        }
        seenExampleStates.add(state);
        if (!Number.isInteger(example.statusCode)) {
          recordFailure(`site_proof_stamp_verifier_response_example_status_invalid:${state}:${example.statusCode}`);
        }
        if (!body || typeof body !== "object" || Array.isArray(body)) {
          recordFailure(`site_proof_stamp_verifier_response_example_body_invalid:${state}`);
          continue;
        }
        if (state === "NotFound") {
          if (example.statusCode !== 404) {
            recordFailure(`site_proof_stamp_verifier_response_example_not_found_status_invalid:${example.statusCode}`);
          }
          if (!/^proof_stamp_not_found:/.test(body.detail || "")) {
            recordFailure("site_proof_stamp_verifier_response_example_not_found_detail_invalid");
          }
          continue;
        }
        if (state === "PersistenceUnavailable") {
          if (example.statusCode !== 503) {
            recordFailure(`site_proof_stamp_verifier_response_example_persistence_status_invalid:${example.statusCode}`);
          }
          if (!/^persistence_unavailable:/.test(body.detail || "")) {
            recordFailure("site_proof_stamp_verifier_response_example_persistence_detail_invalid");
          }
          continue;
        }
        if (example.statusCode !== 200) {
          recordFailure(`site_proof_stamp_verifier_response_example_status_not_200:${state}:${example.statusCode}`);
        }
        for (const key of expectedResponseKeys) {
          if (!(key in body)) {
            recordFailure(`site_proof_stamp_verifier_response_example_key_missing:${state}:${key}`);
          }
        }
        if (body.verification_state !== state) {
          recordFailure(`site_proof_stamp_verifier_response_example_state_mismatch:${state}:${body.verification_state}`);
        }
        if (body.envelope_version !== proofStampArtifact?.version) {
          recordFailure(`site_proof_stamp_verifier_response_example_version_mismatch:${state}:${body.envelope_version}`);
        }
        if (!/^sha256:[a-z0-9-]+$/.test(body.content_hash || "") || body.stamp_hash !== body.content_hash) {
          recordFailure(`site_proof_stamp_verifier_response_example_hash_invalid:${state}:${body.content_hash}`);
        }
        if (!allowedSignatureStates.has(body.signature_state)) {
          recordFailure(`site_proof_stamp_verifier_response_example_signature_state_invalid:${state}:${body.signature_state}`);
        }
        if (!allowedRevocationStates.has(body.revocation_state)) {
          recordFailure(`site_proof_stamp_verifier_response_example_revocation_state_invalid:${state}:${body.revocation_state}`);
        }
        if (body.stamp_id !== body.id) {
          recordFailure(`site_proof_stamp_verifier_response_example_id_mismatch:${state}`);
        }
      }
      for (const outcomeState of requiredVerifierOutcomes) {
        if (!seenExampleStates.has(outcomeState)) {
          recordFailure(`site_proof_stamp_verifier_response_example_state_missing:${outcomeState}`);
        }
      }
      for (const errorState of requiredTransportErrors) {
        if (!seenExampleStates.has(errorState)) {
          recordFailure(`site_proof_stamp_verifier_response_example_transport_state_missing:${errorState}`);
        }
      }
    }
    const operatorBoundary = proofStampVerifier.operatorBoundary;
    if (!operatorBoundary || typeof operatorBoundary !== "object" || Array.isArray(operatorBoundary)) {
      recordFailure("site_proof_stamp_verifier_operator_boundary_missing");
    } else {
      requireString(operatorBoundary.label, "site.proofStampVerifier.operatorBoundary.label");
      requireString(operatorBoundary.title, "site.proofStampVerifier.operatorBoundary.title");
      const operatorStatus = requireString(operatorBoundary.status, "site.proofStampVerifier.operatorBoundary.status");
      const operatorSummary = requireString(operatorBoundary.summary, "site.proofStampVerifier.operatorBoundary.summary");
      if (operatorStatus !== "private operator") {
        recordFailure(`site_proof_stamp_verifier_operator_boundary_status_invalid:${operatorStatus}`);
      }
      if (!/operator-authenticated/.test(operatorSummary) || !/never exposes revocation as a public action/i.test(operatorSummary)) {
        recordFailure("site_proof_stamp_verifier_operator_boundary_summary_incomplete");
      }
      const requiredHeaders = new Set(["X-Mullusi-Key", "X-Mullusi-Operator-Key"]);
      const observedHeaders = new Set(Array.isArray(operatorBoundary.requiredHeaders) ? operatorBoundary.requiredHeaders : []);
      for (const header of requiredHeaders) {
        if (!observedHeaders.has(header)) {
          recordFailure(`site_proof_stamp_verifier_operator_boundary_header_missing:${header}`);
        }
      }
      const expectedOperatorRoutes = new Map([
        [
          "POST /v1/proof-stamps/{stamp_id}/revoke",
          {
            method: "POST",
            mutation: "append-only revocation write",
            successStatus: 200,
            requiredFailures: ["operator_key_required", "expected_non_empty_single_line", "persistence_unavailable:"],
          },
        ],
        [
          "GET /v1/proof-stamps/{stamp_id}/revocation",
          {
            method: "GET",
            mutation: "read-only revocation readback",
            successStatus: 200,
            requiredFailures: ["operator_key_required", "persistence_unavailable:"],
          },
        ],
      ]);
      if (!Array.isArray(operatorBoundary.routes) || operatorBoundary.routes.length < expectedOperatorRoutes.size) {
        recordFailure("site_proof_stamp_verifier_operator_routes_missing");
      } else {
        const observedOperatorRoutes = new Map();
        for (const [index, route] of operatorBoundary.routes.entries()) {
          const label = `site.proofStampVerifier.operatorBoundary.routes.${index}`;
          requireString(route.name, `${label}.name`);
          const routeId = requireString(route.route, `${label}.route`);
          const expectedRoute = expectedOperatorRoutes.get(routeId);
          const method = requireString(route.method, `${label}.method`);
          const host = requireString(route.host, `${label}.host`);
          const exposure = requireString(route.exposure, `${label}.exposure`);
          const mutation = requireString(route.mutation, `${label}.mutation`);
          requireString(route.input, `${label}.input`);
          if (!expectedRoute) {
            recordFailure(`site_proof_stamp_verifier_operator_route_unexpected:${routeId}`);
            continue;
          }
          observedOperatorRoutes.set(routeId, route);
          if (host !== "api.mullusi.com") {
            recordFailure(`site_proof_stamp_verifier_operator_route_host_invalid:${routeId}:${host}`);
          }
          if (method !== expectedRoute.method) {
            recordFailure(`site_proof_stamp_verifier_operator_route_method_invalid:${routeId}:${method}`);
          }
          if (exposure !== "private operator") {
            recordFailure(`site_proof_stamp_verifier_operator_route_exposure_invalid:${routeId}:${exposure}`);
          }
          if (mutation !== expectedRoute.mutation) {
            recordFailure(`site_proof_stamp_verifier_operator_route_mutation_invalid:${routeId}:${mutation}`);
          }
          if (route.successStatus !== expectedRoute.successStatus) {
            recordFailure(`site_proof_stamp_verifier_operator_route_success_status_invalid:${routeId}:${route.successStatus}`);
          }
          const apiContractExists = Array.isArray(content.apiContracts)
            && content.apiContracts.some((contract) => contract.route === routeId && contract.status === "private operator");
          if (!apiContractExists) {
            recordFailure(`site_proof_stamp_verifier_operator_route_api_contract_missing:${routeId}`);
          }
          const successBody = route.successBody;
          if (!successBody || typeof successBody !== "object" || Array.isArray(successBody)) {
            recordFailure(`site_proof_stamp_verifier_operator_route_success_body_invalid:${routeId}`);
          } else if (method === "POST") {
            for (const key of ["stamp_id", "revocation_id", "revocation_state", "reason", "authority", "trace_ref", "storage_state", "detail"]) {
              if (!(key in successBody)) {
                recordFailure(`site_proof_stamp_verifier_operator_route_success_key_missing:${routeId}:${key}`);
              }
            }
            if (successBody.revocation_state !== "revoked" || successBody.storage_state !== "stored") {
              recordFailure(`site_proof_stamp_verifier_operator_route_write_state_invalid:${routeId}`);
            }
            if (!/^proof_stamp_revoked:/.test(successBody.detail || "")) {
              recordFailure(`site_proof_stamp_verifier_operator_route_write_detail_invalid:${routeId}`);
            }
          } else if (method === "GET") {
            for (const key of ["stamp_id", "revocation_state", "reason", "trace_ref", "revoked_at"]) {
              if (!(key in successBody)) {
                recordFailure(`site_proof_stamp_verifier_operator_route_read_key_missing:${routeId}:${key}`);
              }
            }
            if (successBody.revocation_state !== "revoked") {
              recordFailure(`site_proof_stamp_verifier_operator_route_read_state_invalid:${routeId}`);
            }
            const alternateBody = route.alternateBody;
            if (!alternateBody || typeof alternateBody !== "object" || Array.isArray(alternateBody)) {
              recordFailure(`site_proof_stamp_verifier_operator_route_alternate_body_missing:${routeId}`);
            } else if (
              alternateBody.revocation_state !== "not-revoked"
              || alternateBody.reason !== null
              || alternateBody.trace_ref !== null
              || alternateBody.revoked_at !== null
            ) {
              recordFailure(`site_proof_stamp_verifier_operator_route_alternate_body_invalid:${routeId}`);
            }
          }
          if (!Array.isArray(route.failureModes) || route.failureModes.length < expectedRoute.requiredFailures.length) {
            recordFailure(`site_proof_stamp_verifier_operator_route_failures_missing:${routeId}`);
          } else {
            const failureText = route.failureModes
              .map((failure) => {
                requireString(failure.detail, `${label}.failure.detail`);
                requireString(failure.meaning, `${label}.failure.meaning`);
                if (!Number.isInteger(failure.statusCode)) {
                  recordFailure(`site_proof_stamp_verifier_operator_route_failure_status_invalid:${routeId}:${failure.statusCode}`);
                }
                return `${failure.statusCode}:${failure.detail}`;
              })
              .join(" ");
            for (const requiredFailure of expectedRoute.requiredFailures) {
              if (!failureText.includes(requiredFailure)) {
                recordFailure(`site_proof_stamp_verifier_operator_route_failure_missing:${routeId}:${requiredFailure}`);
              }
            }
          }
        }
        for (const routeId of expectedOperatorRoutes.keys()) {
          if (!observedOperatorRoutes.has(routeId)) {
            recordFailure(`site_proof_stamp_verifier_operator_route_missing:${routeId}`);
          }
        }
      }
    }
    const implementation = proofStampVerifier.implementation;
    if (!implementation || typeof implementation !== "object" || Array.isArray(implementation)) {
      recordFailure("site_proof_stamp_verifier_implementation_missing");
    } else {
      requireString(implementation.label, "site.proofStampVerifier.implementation.label");
      requireString(implementation.status, "site.proofStampVerifier.implementation.status");
      const runtimeBoundary = requireString(
        implementation.runtimeBoundary,
        "site.proofStampVerifier.implementation.runtimeBoundary",
      );
      if (!/AwaitingEvidence/.test(runtimeBoundary) || !/FastAPI route/.test(runtimeBoundary)) {
        recordFailure("site_proof_stamp_verifier_implementation_boundary_incomplete");
      }
      const requiredImplementationFiles = new Set([
        "backend/app/api/routes_proof.py",
        "backend/app/api/routes_evaluations.py",
        "backend/app/core/security.py",
        "backend/app/govern/proof.py",
        "backend/app/db/schema.sql",
        "backend/app/db/repository.py",
        "backend/scripts/revoke_proof_stamp.py",
        "backend/scripts/read_proof_stamp_revocation.py",
        "backend/scripts/probe_trace.py",
        "backend/tests/test_routes.py",
        "backend/tests/test_proof.py",
        "backend/tests/test_migration.py",
        "backend/tests/test_revoke_proof_stamp_script.py",
        "backend/tests/test_read_proof_stamp_revocation_script.py",
        "backend/tests/test_probe_trace_script.py",
      ]);
      if (!Array.isArray(implementation.files) || implementation.files.length < requiredImplementationFiles.size) {
        recordFailure("site_proof_stamp_verifier_implementation_files_missing");
      } else {
        const seenImplementationFiles = new Set();
        for (const [index, file] of implementation.files.entries()) {
          const label = `site.proofStampVerifier.implementation.files.${index}`;
          const filePath = requireString(file.path, `${label}.path`);
          requireString(file.role, `${label}.role`);
          seenImplementationFiles.add(filePath);
        }
        for (const filePath of requiredImplementationFiles) {
          if (!seenImplementationFiles.has(filePath)) {
            recordFailure(`site_proof_stamp_verifier_implementation_file_missing:${filePath}`);
          }
        }
      }
      if (!Array.isArray(implementation.tests) || implementation.tests.length < 2) {
        recordFailure("site_proof_stamp_verifier_implementation_tests_missing");
      } else {
        const implementationTests = implementation.tests.join("\n");
        if (!/python -m unittest discover -s tests/.test(implementationTests)) {
          recordFailure("site_proof_stamp_verifier_backend_test_missing");
        }
        if (!/node scripts\/validate-site\.mjs/.test(implementationTests)) {
          recordFailure("site_proof_stamp_verifier_site_test_missing");
        }
      }
      if (!Array.isArray(implementation.deploymentGates) || implementation.deploymentGates.length < 4) {
        recordFailure("site_proof_stamp_verifier_deployment_gates_missing");
      } else {
        const deploymentGates = implementation.deploymentGates.join(" ");
        for (const requiredGate of [
          "MULLUSI_PROOF_SIGNING_KEY",
          "MULLUSI_OPERATOR_API_KEY",
          "persistent",
          "GET /v1/evaluations/{evaluation_id}/trace",
          "runtime evidence",
          "revocation",
          "read_proof_stamp_revocation.py",
          "revoke_proof_stamp.py",
          "probe_trace.py",
          "trace_probe_passed",
        ]) {
          if (!deploymentGates.includes(requiredGate)) {
            recordFailure(`site_proof_stamp_verifier_deployment_gate_missing:${requiredGate}`);
          }
        }
      }
      const releaseWitnesses = implementation.releaseWitnesses;
      const requiredReleaseWitnesses = new Map([
        ["python scripts/check_deploy_env.py /etc/mullusi/govern.env", "deploy_env_check state=ready"],
        ["python scripts/preflight_release.py", "release_preflight state=ready"],
        ["python scripts/probe_persistence.py", "probe_passed storage=stored verification=Verified"],
        ["python scripts/probe_trace.py", "trace_probe_passed"],
        ["python scripts/read_proof_stamp_revocation.py <stamp_id>", "revocation_readback state=<revoked|not-revoked>"],
      ]);
      if (!Array.isArray(releaseWitnesses) || releaseWitnesses.length < requiredReleaseWitnesses.size) {
        recordFailure("site_proof_stamp_verifier_release_witnesses_missing");
      } else {
        const observedWitnesses = new Map();
        for (const [index, witness] of releaseWitnesses.entries()) {
          const label = `site.proofStampVerifier.implementation.releaseWitnesses.${index}`;
          requireString(witness.name, `${label}.name`);
          const command = requireString(witness.command, `${label}.command`);
          const expected = requireString(witness.expected, `${label}.expected`);
          requireString(witness.boundary, `${label}.boundary`);
          requireString(witness.blocks, `${label}.blocks`);
          observedWitnesses.set(command, expected);
        }
        for (const [command, expected] of requiredReleaseWitnesses.entries()) {
          if (observedWitnesses.get(command) !== expected) {
            recordFailure(`site_proof_stamp_verifier_release_witness_missing:${command}`);
          }
        }
      }
    }
  }

  const mulluActivity = content.mulluActivity;
  if (!mulluActivity || typeof mulluActivity !== "object") {
    recordFailure("site_mullu_activity_missing");
  } else {
    requireString(mulluActivity.label, "site.mulluActivity.label");
    requireString(mulluActivity.title, "site.mulluActivity.title");
    requireString(mulluActivity.summary, "site.mulluActivity.summary");
    const updated = requireString(mulluActivity.updated, "site.mulluActivity.updated");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(updated)) {
      recordFailure(`site_mullu_activity_updated_invalid:${updated}`);
    }
    if (!Array.isArray(mulluActivity.items) || mulluActivity.items.length < 3) {
      recordFailure("site_mullu_activity_items_missing");
    } else {
      for (const [index, item] of mulluActivity.items.entries()) {
        const label = `site.mulluActivity.items.${index}`;
        requireString(item.title, `${label}.title`);
        requireString(item.body, `${label}.body`);
        requireString(item.status, `${label}.status`);
        requireString(item.scope, `${label}.scope`);
        requireString(item.surface, `${label}.surface`);
        const href = requireString(item.href, `${label}.href`);
        const date = requireString(item.date, `${label}.date`);
        if (!/^#[A-Za-z][A-Za-z0-9_-]*$/.test(href) && !/^\/[A-Za-z0-9/_-]*\/?$/.test(href) && !/^https:\/\/(?:[a-z0-9.-]+\.)?mullusi\.com(?:\/.*)?$/i.test(href)) {
          recordFailure(`site_mullu_activity_href_invalid:${label}:${href}`);
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          recordFailure(`site_mullu_activity_date_invalid:${label}:${date}`);
        }
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

  const example = content.evaluationExample;
  if (!example || typeof example !== "object") {
    recordFailure("site_evaluation_example_missing");
  } else {
    requireString(example.label, "site.evaluationExample.label");
    requireString(example.title, "site.evaluationExample.title");
    requireString(example.disclaimer, "site.evaluationExample.disclaimer");
    requireString(example.route, "site.evaluationExample.route");
    requireString(example.request, "site.evaluationExample.request");
    requireString(example.verdict, "site.evaluationExample.verdict");
    requireString(example.summary, "site.evaluationExample.summary");
    if (!/(AwaitingEvidence|not a live endpoint)/i.test(example.disclaimer)) {
      recordFailure("site_evaluation_example_disclaimer_weak");
    }
    if (!Array.isArray(example.steps) || example.steps.length < 2) {
      recordFailure("site_evaluation_example_steps_missing");
    } else {
      for (const [index, step] of example.steps.entries()) {
        requireString(step.k, `site.evaluationExample.steps.${index}.k`);
        requireString(step.v, `site.evaluationExample.steps.${index}.v`);
      }
    }
    const am = example.am;
    if (!am || typeof am !== "object") {
      recordFailure("site_evaluation_example_am_missing");
    } else {
      requireString(am.label, "site.evaluationExample.am.label");
      requireString(am.title, "site.evaluationExample.am.title");
      requireString(am.disclaimer, "site.evaluationExample.am.disclaimer");
      requireString(am.summary, "site.evaluationExample.am.summary");
      if (!Array.isArray(am.steps) || am.steps.length !== (example.steps || []).length) {
        recordFailure("site_evaluation_example_am_steps_mismatch");
      } else {
        for (const [index, step] of am.steps.entries()) {
          requireString(step.k, `site.evaluationExample.am.steps.${index}.k`);
          requireString(step.v, `site.evaluationExample.am.steps.${index}.v`);
        }
      }
    }
  }
}

function validateI18n() {
  const dictionary = JSON.parse(readUtf8("data/i18n.json"));
  const languages = dictionary?.meta?.languages;
  if (!Array.isArray(languages) || !languages.includes("en") || !languages.includes("am")) {
    recordFailure("i18n_languages_invalid");
  }
  for (const lang of ["en", "am"]) {
    if (typeof dictionary?.languageNames?.[lang] !== "string" || dictionary.languageNames[lang].trim().length === 0) {
      recordFailure(`i18n_language_name_missing:${lang}`);
    }
  }

  const strings = dictionary?.strings;
  if (!strings || typeof strings !== "object") {
    recordFailure("i18n_strings_not_object");
    return;
  }

  for (const [key, entry] of Object.entries(strings)) {
    for (const lang of ["en", "am"]) {
      if (typeof entry?.[lang] !== "string" || entry[lang].trim().length === 0) {
        recordFailure(`i18n_translation_missing:${key}:${lang}`);
      }
    }
  }

  const referencedKeys = new Set();
  const html = readUtf8("index.html");
  for (const match of html.matchAll(/\sdata-i18n="([^"]+)"/g)) {
    referencedKeys.add(match[1]);
  }
  for (const match of html.matchAll(/\sdata-i18n-attr="([^"]+)"/g)) {
    for (const pair of match[1].split(";")) {
      const key = pair.split(":")[1];
      if (key && key.trim().length > 0) {
        referencedKeys.add(key.trim());
      }
    }
  }
  for (const key of referencedKeys) {
    if (!Object.prototype.hasOwnProperty.call(strings, key)) {
      recordFailure(`i18n_key_undefined:index.html:${key}`);
    }
  }
}

function validateIndexDesignContract() {
  const html = readUtf8("index.html");
  const css = readUtf8("assets/styles.css");
  const app = readUtf8("assets/app.js");
  const dictionary = JSON.parse(readUtf8("data/i18n.json"));
  const dictionaryText = JSON.stringify(dictionary?.strings ?? {});
  const symbolFontPath = "assets/fonts/noto-sans-symbols-2-math.woff2";
  const assetVersion = "2026.05.platform.14";

  if (!html.includes(`assets/styles.css?v=${assetVersion}`) || !html.includes(`assets/app.js?v=${assetVersion}`)) {
    recordFailure("index_asset_version_invalid");
  }

  const h2Labels = [...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/gs)]
    .map((match) => match[1].replace(/<[^>]+>/g, "").trim());
  for (const label of h2Labels) {
    if (/[.\u1362]$/.test(label)) {
      recordFailure(`index_heading_period_terminated:${label}`);
    }
  }
  const h2I18nKeys = [...html.matchAll(/<h2\b[^>]*data-i18n="([^"]+)"/g)].map((match) => match[1]);
  for (const key of h2I18nKeys) {
    for (const lang of ["en", "am"]) {
      const value = dictionary?.strings?.[key]?.[lang];
      if (typeof value !== "string" || value.trim().length === 0) {
        recordFailure(`index_heading_i18n_missing:${key}:${lang}`);
        continue;
      }
      if (/[.\u1362]$/.test(value.trim())) {
        recordFailure(`index_heading_i18n_period_terminated:${key}:${lang}`);
      }
    }
  }

  const startIndex = html.indexOf('id="start"');
  const metricsIndex = html.indexOf('id="metrics"');
  const newsIndex = html.indexOf('id="news"');
  const governanceIndex = html.indexOf('aria-labelledby="governance-title"');
  if (startIndex === -1 || metricsIndex === -1 || startIndex > metricsIndex) {
    recordFailure("index_start_router_not_second_screen");
  }
  if (newsIndex === -1 || governanceIndex === -1 || newsIndex < governanceIndex) {
    recordFailure("index_news_not_tertiary_footer_section");
  }
  const mobileMenu = html.match(/<div class="mobile-menu"[\s\S]*?<\/div>\s*<main/)?.[0] ?? "";
  const mobileNewsIndex = mobileMenu.indexOf('href="#news"');
  const mobileReposIndex = mobileMenu.indexOf('href="#repos"');
  if (mobileNewsIndex === -1 || mobileReposIndex === -1 || mobileNewsIndex < mobileReposIndex) {
    recordFailure("mobile_news_not_footer_ordered");
  }

  const forbiddenRepeatedCaveats = [
    "Public claims only",
    "not Mullusi claims",
    "illustrative, not live runtime claims",
    "not a live endpoint",
  ];
  for (const phrase of forbiddenRepeatedCaveats) {
    if (html.includes(phrase)) {
      recordFailure(`index_repeated_caveat_present:${phrase}`);
    }
    if (dictionaryText.includes(phrase)) {
      recordFailure(`i18n_repeated_caveat_present:${phrase}`);
    }
  }

  const requiredPlainKeys = [
    "hero.plain",
    "govern.plain",
    "evidence.plain",
    "architecture.plain",
    "products.plain",
    "sciences.plain",
    "governance.plain",
  ];
  for (const key of requiredPlainKeys) {
    if (!html.includes(`data-i18n="${key}"`)) {
      recordFailure(`index_plain_terms_missing:${key}`);
    }
    for (const lang of ["en", "am"]) {
      if (typeof dictionary?.strings?.[key]?.[lang] !== "string" || dictionary.strings[key][lang].trim().length === 0) {
        recordFailure(`plain_terms_i18n_missing:${key}:${lang}`);
      }
    }
  }
  for (const key of ["repo.errorBody", "news.errorBody"]) {
    const localized = dictionary?.strings?.[key] ?? {};
    if (/data\/[A-Za-z0-9./_-]+/.test(localized.en ?? "") || /data\/[A-Za-z0-9./_-]+/.test(localized.am ?? "")) {
      recordFailure(`plain_error_copy_machine_path_present:${key}`);
    }
  }

  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  for (const id of ids) {
    if (ids.indexOf(id) !== ids.lastIndexOf(id)) {
      recordFailure(`index_duplicate_id:${id}`);
    }
  }
  for (const match of html.matchAll(/href="#([^"]+)"/g)) {
    if (!ids.includes(match[1])) {
      recordFailure(`index_anchor_target_missing:#${match[1]}`);
    }
  }
  for (const match of html.matchAll(/<img\b[^>]*>/g)) {
    if (!/\salt="[^"]*"/.test(match[0])) {
      recordFailure(`index_img_alt_missing:${match[0]}`);
    }
  }
  for (const match of html.matchAll(/<section\b([^>]*)>/g)) {
    const attrs = match[1];
    if (!/aria-labelledby=/.test(attrs) && !/aria-label=/.test(attrs) && !/class="marquee"/.test(attrs)) {
      recordFailure(`index_section_label_missing:${attrs.trim()}`);
    }
  }

  if (!css.includes('@font-face') || !css.includes('Mullusi Symbols') || !css.includes('fonts/noto-sans-symbols-2-math.woff2')) {
    recordFailure("symbol_font_contract_missing");
  }
  if (!css.includes("--role-heading-size") || !css.includes("--role-card-body-size")) {
    recordFailure("type_scale_contract_missing");
  }
  const lightRootMatch = css.match(/:root\[data-theme="light"\]\s*\{([\s\S]*?)\n\}/);
  const darkInkDim = cssVariable(css, "--ink-dim");
  const darkBg = cssVariable(css, "--bg");
  const lightInkDim = lightRootMatch ? cssVariable(lightRootMatch[1], "--ink-dim") : "";
  const lightBg = lightRootMatch ? cssVariable(lightRootMatch[1], "--bg") : "";
  const darkDimContrast = contrastRatio(darkInkDim, darkBg);
  const lightDimContrast = contrastRatio(lightInkDim, lightBg);
  if (darkDimContrast === null || darkDimContrast < 4.5) {
    recordFailure(`dim_contrast_dark_insufficient:${darkInkDim}:${darkBg}`);
  }
  if (lightDimContrast === null || lightDimContrast < 4.5) {
    recordFailure(`dim_contrast_light_insufficient:${lightInkDim}:${lightBg}`);
  }
  if (!readUtf8("assets/fonts/OFL.txt").includes("SIL OPEN FONT LICENSE")) {
    recordFailure("symbol_font_license_missing");
  }
  if (pathExists("assets/fonts/noto-sans-symbols-2.ttf")) {
    recordFailure("oversized_symbol_ttf_present");
  }
  if (pathExists(symbolFontPath)) {
    const fontContent = readBinary(symbolFontPath);
    if (fontContent.subarray(0, 4).toString("ascii") !== "wOF2") {
      recordFailure("symbol_font_not_woff2");
    }
    if (fontContent.length > 64 * 1024) {
      recordFailure(`symbol_font_size_budget_exceeded:${fontContent.length}`);
    }
  }
  if (!app.includes("function promoteNoscriptFallbacks") || !app.includes("function renderNewsLoadError")) {
    recordFailure("dynamic_failure_renderer_missing");
  }
  if (!app.includes("function captureFallbackContent") || !app.includes("function restoreFallbackContent")) {
    recordFailure("static_child_fallback_renderer_missing");
  }
  if (app.indexOf("applyLang(preferredLang(), false)") > app.indexOf("const registryFallbacks = captureFallbackContent")) {
    recordFailure("fallback_capture_before_language_application");
  }
  const staticFallbackTargets = [
    "[data-platform-layers]",
    "[data-request-flow]",
    "[data-platform-build-sequence]",
    "[data-product-questions]",
    "[data-proof-lanes]",
    "[data-interface-links]",
    "[data-release-stages]",
    "[data-future-domains]",
    "[data-product-registry-controls]",
    "[data-product-registry]",
    "[data-mullu-activity]",
  ];
  for (const selector of staticFallbackTargets) {
    if (!app.includes(`"${selector}"`)) {
      recordFailure(`static_child_fallback_target_missing:${selector}`);
    }
  }
  if (/renderFutureDomains[\s\S]*localized\(domain, "summary"\)/.test(app)) {
    recordFailure("science_engine_cards_not_compressed");
  }
  if (!app.includes("function renderProductRegistryControls") || !app.includes("data-product-status")) {
    recordFailure("product_registry_controls_missing");
  }
  if (!app.includes("function renderProductRouteActions") || !app.includes("product-route-actions")) {
    recordFailure("product_registry_route_actions_missing");
  }
  const generatedAttributeEscapingRegressions = [
    /href="\$\{escapeHtml/,
    /aria-label="\$\{escapeHtml/,
    /id="\$\{escapeHtml/,
  ];
  for (const pattern of generatedAttributeEscapingRegressions) {
    if (pattern.test(app)) {
      recordFailure(`generated_attribute_uses_text_escape:${pattern}`);
    }
  }
  if (/plannedRepo/.test(app) || /plannedRepo/.test(html)) {
    recordFailure("planned_repo_public_renderer_present");
  }
  if (!app.includes('class="eng-boundary"') || /eng-repo/.test(html) || /eng-repo/.test(app)) {
    recordFailure("engine_boundary_renderer_invalid");
  }
  if (/Repository Observatory|repository observatory/.test(html)) {
    recordFailure("stale_repository_observatory_label_present");
  }
}

function validateProofPageContract() {
  const html = readUtf8("proof/index.html");
  const requiredProofTerms = [
    'id="products"',
    "Product evidence lanes",
    "data-product-evidence",
    "renderProductEvidenceLanes = async",
    "../data/products.json",
    "proof-summary",
    "product-proof-grid",
    "Product registry load failed",
    "data-runtime-witness",
    "renderRuntimeWitnessBoard = async",
    "../data/site.json",
    "runtime-check-grid",
    "runtime-closure-grid",
    "closureGates",
    "Health and version witness",
    "health-witness-grid",
    "healthWitness",
    "healthWitnessCard",
    "Runtime conformance contract",
    "renderRuntimeWitnessBoard = async",
    "finding-contract-grid",
    "runtime-response-grid",
    "gateway-response-grid",
    "protected-path-grid",
    "runtimeConformance",
    "gatewayWitness",
    "gatewayResponseCard",
    "Gateway witness response examples",
    "protectedPaths",
    'id="stamp"',
    "Proof stamp artifact",
    "data-proof-stamp-artifact",
    "renderProofStampArtifact = async",
    "proofStampArtifact",
    "proofStampVerifier",
    "stamp-field-grid",
    "verifier-check-grid",
    "verifier-outcomes",
    "verifier-decision-grid",
    "verifierDecisionCard",
    "Fail-closed verifier decision ladder",
    "verifier-state-model",
    "state-model-row",
    "verifier-sample",
    "verifier-response-grid",
    "verifierResponseExampleCard",
    "Verifier response examples",
    "responseExamples",
    "operatorBoundary",
    "operator-boundary",
    "operator-route-grid",
    "operatorRouteCard",
    "operator-failure-list",
    "Private revocation operator boundary",
    "verifier-implementation",
    "implementation-file-grid",
    "Verifier implementation boundary",
    "Deployment gates",
    "sampleResponse",
    "Static verifier response example",
    "Proof stamp and verifier contract is incomplete",
    "Proof stamp artifact load failed",
    "Runtime status load failed",
  ];

  for (const term of requiredProofTerms) {
    if (!html.includes(term)) {
      recordFailure(`proof_page_contract_missing:${term}`);
    }
  }

  if (!html.includes('href="#products"')) {
    recordFailure("proof_page_products_nav_missing");
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
    if (/[\u0300-\u036F\u1AB0-\u1AFF\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F]/u.test(content)) {
      recordFailure(`unicode_combining_mark_present:${fileName}`);
    }
    const mojibakePatterns = [
      /â[€œ€˜€™€“€”¢¦]/,
      /Î[\u0080-\u00BF]/,
      /á[\u0080-\u00BF]/,
      /Â©|Â·/,
    ];
    for (const pattern of mojibakePatterns) {
      if (pattern.test(content)) {
        recordFailure(`mojibake_sequence_present:${fileName}:${pattern}`);
      }
    }
    for (const pattern of blockedPatterns) {
      if (pattern.test(content)) {
        recordFailure(`blocked_public_text:${fileName}:${pattern}`);
      }
    }
  }
}

function validateEmailRendering() {
  const htmlFiles = ["index.html", "mullu/index.html", "proof/index.html", "playground/index.html", "404.html"];
  const emailPattern = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  for (const fileName of htmlFiles) {
    const html = readUtf8(fileName);
    const visibleHtml = html
      .replace(/<script\b[\s\S]*?<\/script>/gi, "")
      .replace(/<style\b[\s\S]*?<\/style>/gi, "");
    for (const anchorMatch of visibleHtml.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
      const attrs = anchorMatch[1];
      const body = anchorMatch[2].replace(/<[^>]+>/g, "");
      for (const emailMatch of body.matchAll(emailPattern)) {
        const email = emailMatch[0];
        if (/&lt;|&gt;|<|>/.test(body)) {
          recordFailure(`email_angle_bracket_rendering:${fileName}:${email}`);
        }
        if (!attrs.includes(`href="mailto:${email}`) && !attrs.includes(`href='mailto:${email}`)) {
          recordFailure(`email_visible_without_mailto:${fileName}:${email}`);
        }
      }
    }
    const htmlWithoutAnchors = visibleHtml.replace(/<a\b[\s\S]*?<\/a>/gi, "");
    for (const match of htmlWithoutAnchors.matchAll(emailPattern)) {
      const email = match[0];
      const before = htmlWithoutAnchors.slice(Math.max(0, match.index - 16), match.index);
      const after = htmlWithoutAnchors.slice(match.index + email.length, match.index + email.length + 16);
      if (/&lt;\s*$/.test(before) || /^\s*&gt;/.test(after) || /<\s*$/.test(before) || /^\s*>/.test(after)) {
        recordFailure(`email_angle_bracket_rendering:${fileName}:${email}`);
      }
      recordFailure(`email_visible_without_mailto:${fileName}:${email}`);
    }
  }
}

function validateOperatingGates() {
  const gateExpectations = [
    {
      file: "ops/mullusi-doctrine.md",
      terms: ["Mullusi Doctrine v1.2", "Evidence State", "AwaitingEvidence", "No claim without declared evidence state.", "release_surface", "rollback(surface_id)", "superseded_by", "PublishableWithBoundary", "STATUS:"],
    },
    {
      file: "ops/public-claim-gate.md",
      terms: ["Claim:", "Evidence:", "Surface:", "Risk:", "Status:", "Decision:", "Rollback:", "AwaitingEvidence"],
    },
    {
      file: "ops/repo-release-gate.md",
      terms: ["KeepPublic", "ArchivePublic", "MakePrivate", "DeleteIfSafe", "license=intentional", "secret_scan=pass"],
    },
    {
      file: "ops/product-release-gate.md",
      terms: ["Private", "Research", "Staged", "AwaitingEvidence", "Live", "Archived", "runtime_claim=matched_to_witness_state"],
    },
    {
      file: "ops/ip-disclosure-gate.md",
      terms: ["Disclosure Questions", "Release Decision Record", "KeepPrivate", "PublishHighLevel", "OpenRelease", "Rollback:"],
    },
    {
      file: "ops/MULLUSI_INFRASTRUCTURE_ROOT.md",
      terms: ["Authority Chain", "Post-Stabilization Public Witness", "Runtime Evidence Milestone", "HSTS Rollout", "STATUS:"],
    },
    {
      file: "ops/api-runtime-host-path.md",
      terms: ["API Runtime Host Path", "Cloudflare proxied DNS", "external managed PostgreSQL", "DNS Rule", "Rollback", "STATUS:"],
    },
    {
      file: "ops/api-production-readiness-gate.md",
      terms: ["API Production Readiness Gate", "Pre-Provision Requirements", "Pre-DNS Evidence", "DNS Activation Rule", "Post-DNS Evidence", "Rollback Rule", "STATUS:"],
    },
    {
      file: "ops/recovery-inventory-template.md",
      terms: ["Recovery Inventory Template", "Root Identity", "Account Recovery Checklist", "Emergency Access Procedure", "Rotation Cadence", "Release Block", "STATUS:"],
    },
    {
      file: "ops/recovery-completion-witness.md",
      terms: ["Recovery Completion Witness", "recovery_witness_state=", "api_provisioning_allowed=", "Public-Safe Witness Table", "Promotion Rule", "API Provisioning Block", "STATUS:"],
    },
  ];

  for (const gate of gateExpectations) {
    const content = readUtf8(gate.file);
    for (const term of gate.terms) {
      if (!content.includes(term)) {
        recordFailure(`operating_gate_term_missing:${gate.file}:${term}`);
      }
    }
    if (!content.includes("STATUS:")) {
      recordFailure(`operating_gate_status_missing:${gate.file}`);
    }
  }
}

function lineValue(content, key) {
  const match = content.match(new RegExp(`^${key}=([^\\s]+)$`, "m"));
  return match?.[1] ?? "";
}

function validateRuntimeGateState() {
  const recoveryWitness = readUtf8("ops/recovery-completion-witness.md");
  const apiGate = readUtf8("ops/api-production-readiness-gate.md");
  const runtimeHostPath = readUtf8("ops/api-runtime-host-path.md");
  const infrastructureRoot = readUtf8("ops/MULLUSI_INFRASTRUCTURE_ROOT.md");
  const recoveryState = lineValue(recoveryWitness, "recovery_witness_state");
  const apiAllowed = lineValue(recoveryWitness, "api_provisioning_allowed");

  if (!["AwaitingEvidence", "ReadyForProvisioning"].includes(recoveryState)) {
    recordFailure(`recovery_witness_state_invalid:${recoveryState}`);
  }
  if (!["false", "true"].includes(apiAllowed)) {
    recordFailure(`api_provisioning_allowed_invalid:${apiAllowed}`);
  }
  if (recoveryState === "AwaitingEvidence" && apiAllowed !== "false") {
    recordFailure("recovery_awaiting_evidence_must_block_api_provisioning");
  }
  if (recoveryState === "ReadyForProvisioning" && apiAllowed !== "true") {
    recordFailure("recovery_ready_must_allow_api_provisioning");
  }
  if (apiAllowed === "true" && recoveryWitness.includes("AwaitingEvidence")) {
    recordFailure("api_provisioning_allowed_with_unconfirmed_recovery_rows");
  }
  if (!apiGate.includes("ops/recovery-completion-witness.md") || !apiGate.includes("ReadyForProvisioning")) {
    recordFailure("api_readiness_gate_missing_recovery_witness_dependency");
  }
  if (pathExists("backend/deploy/nginx/api.mullusi.com.conf")) {
    const nginxTemplate = readUtf8("backend/deploy/nginx/api.mullusi.com.conf");
    if (!nginxTemplate.includes('Strict-Transport-Security "max-age=86400"')) {
      recordFailure("api_nginx_hsts_stage_one_missing");
    }
    if (/includeSubDomains|preload/i.test(nginxTemplate)) {
      recordFailure("api_nginx_hsts_premature_strict_mode");
    }
  } else {
    if (!runtimeHostPath.includes("Strict-Transport-Security: max-age=86400")) {
      recordFailure("api_ops_hsts_stage_one_missing");
    }
    if (!infrastructureRoot.includes("HSTS: deferred") || !infrastructureRoot.includes("Stage 1: max-age=86400, no includeSubDomains, no preload")) {
      recordFailure("api_ops_hsts_rollout_boundary_missing");
    }
  }

  const opsFiles = [
    "ops/MULLUSI_INFRASTRUCTURE_ROOT.md",
    "ops/api-runtime-host-path.md",
    "ops/api-production-readiness-gate.md",
    "ops/recovery-inventory-template.md",
    "ops/recovery-completion-witness.md",
  ];
  const highSignalSecretPatterns = [
    /g(?:ho|hp|hr|hs)_[A-Za-z0-9_]{20,}/,
    /github_pat_[A-Za-z0-9_]{20,}/,
    /-----BEGIN (?:RSA |OPENSSH |EC |)PRIVATE KEY-----/,
    /postgres(?:ql)?:\/\/[^:\s]+:[^@\s]+@/i,
    /[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{24,}/,
  ];
  for (const opsFile of opsFiles) {
    const content = readUtf8(opsFile);
    for (const pattern of highSignalSecretPatterns) {
      if (pattern.test(content)) {
        recordFailure(`ops_secret_like_value_present:${opsFile}:${pattern}`);
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
    { file: "playground/index.html", url: "https://mullusi.com/playground/" },
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
  validateCloudflarePagesControls();
  validateCloudflarePagesArtifact();
  validateWebsiteOriginWitness();
  validatePrivateSourceMigrationDoc();
  validateWwwCanonicalRedirectGate();
  validateRobots();
  validateSitemap();
  validateLocalLinks();
  validateHeadContract();
  validateProductionClaimBoundary();
  validateWebManifest();
  validateSvgAssets();
  validateProductRegistry();
  validateNewsFeed();
  validateSiteContent();
  validateI18n();
  validateIndexDesignContract();
  validateProofPageContract();
  validatePublicText();
  validateEmailRendering();
  validateOperatingGates();
  validateRuntimeGateState();

  if (failures.length > 0) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  console.log("site validation passed");
}

runValidation();
