/*
Purpose: validate a captured live-safety witness artifact before retention or review.
Governance scope: scheduled probe artifacts, public-safe output boundaries, required probe results, and optional external regional evidence.
Dependencies: Node.js standard library and the live-safety-witness artifact directory.
Invariants: validation is deterministic, reads local artifact files only, and never requires secrets or network access.
Test contract: run node scripts/test-check-live-safety-witness.mjs.
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const defaultArtifactDirectory = "live-safety-witness";
const requiredArtifactFiles = [
  "run-metadata.txt",
  "public-visibility.txt",
  "regional-public-visibility.txt",
  "website-origin.txt",
  "security-headers.txt",
  "domain-security.txt",
  "domain-hardening-preflight.txt",
  "search-indexing-surface.txt",
  "deployment-integrity.txt",
];
const forbiddenPublicWitnessPatterns = [
  /account_id\s*=/i,
  /billing_id\s*=/i,
  new RegExp("to" + "ken\\s*=", "i"),
  /dns_target\s*=/i,
  /raw_response_header_value\s*=/i,
  new RegExp("BEGIN RSA " + "PRIVATE KEY", "i"),
  new RegExp("BEGIN OPENSSH " + "PRIVATE KEY", "i"),
  /g(?:ho|hp|hr|hs)_[A-Za-z0-9_]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
];

function readArtifactFile(artifactDirectory, fileName) {
  const filePath = path.join(artifactDirectory, fileName);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return { fileName, content: "", error: `artifact_file_missing:${fileName}` };
  }
  return {
    fileName,
    content: fs.readFileSync(filePath, "utf8"),
    error: "",
  };
}

function hasLine(content, expectedLine) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .some((line) => line === expectedLine);
}

function requireTerm(findings, fileName, content, term) {
  if (!content.includes(term)) {
    findings.push(`artifact_term_missing:${fileName}:${term}`);
  }
}

function requireLine(findings, fileName, content, line) {
  if (!hasLine(content, line)) {
    findings.push(`artifact_line_missing:${fileName}:${line}`);
  }
}

function witnessBlocksForTarget(content, targetUrl) {
  return content
    .split(/\r?\n\s*\r?\n/)
    .filter((block) => block.split(/\r?\n/).some((line) => line.trim() === `target=${targetUrl}`));
}

function lineValue(block, key) {
  const match = block.match(new RegExp(`^${key}=([^\\n]*)`, "m"));
  return match?.[1]?.trim() ?? "";
}

function requireSingleWitnessBlock(findings, fileName, content, targetUrl) {
  const blocks = witnessBlocksForTarget(content, targetUrl);
  if (blocks.length !== 1) {
    findings.push(`artifact_witness_block_count_invalid:${fileName}:${targetUrl}:${blocks.length}`);
    return "";
  }
  return blocks[0];
}

function requireWitnessValue(findings, fileName, block, targetUrl, key, expectedValue) {
  const value = lineValue(block, key);
  if (value !== expectedValue) {
    findings.push(`artifact_witness_value_invalid:${fileName}:${targetUrl}:${key}:${value || "<empty>"}`);
  }
}

function validateBoundary(findings, fileName, content) {
  for (const pattern of forbiddenPublicWitnessPatterns) {
    if (pattern.test(content)) {
      findings.push(`artifact_boundary_invalid:${fileName}:${pattern}`);
    }
  }
}

function validateRunMetadata(findings, content) {
  const fileName = "run-metadata.txt";
  for (const line of [
    "workflow=live-safety-probes",
    "raw_response_headers=not_recorded",
  ]) {
    requireLine(findings, fileName, content, line);
  }
  for (const key of ["run_id=", "run_attempt=", "commit=", "observed_at="]) {
    requireTerm(findings, fileName, content, key);
  }
  const observedAt = content.match(/^observed_at=([^\s]+)$/m)?.[1] ?? "";
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(observedAt)) {
    findings.push(`artifact_observed_at_invalid:${observedAt}`);
  }
}

function validatePublicVisibility(findings, content) {
  const fileName = "public-visibility.txt";
  for (const line of [
    "verdict=SolvedVerified",
    "proof_state=Pass",
    "public_edge_visibility=SolvedVerified",
    "global_all_users_claim=AwaitingEvidence",
    "finding=none",
  ]) {
    requireLine(findings, fileName, content, line);
  }
}

function validateRegionalPublicVisibility(findings, content) {
  const fileName = "regional-public-visibility.txt";
  const hasCompletedVisibility = content.includes("external_multi_region_visibility=");
  const hasProviderError = hasLine(content, "verdict=AwaitingEvidence") && hasLine(content, "proof_state=Unknown");
  if (!hasCompletedVisibility && !hasProviderError) {
    findings.push("regional_visibility_shape_invalid");
  }
  if (hasCompletedVisibility) {
    requireTerm(findings, fileName, content, "global_all_users_claim=AwaitingEvidence");
    requireTerm(findings, fileName, content, "external_regional_probe_floor=");
    requireTerm(findings, fileName, content, "external_probe_count=");
    requireTerm(findings, fileName, content, "external_distinct_region_passes=");
  }
}

function validateWebsiteOrigin(findings, content) {
  const fileName = "website-origin.txt";
  for (const term of [
    "verdict=CloudflareOriginCandidate",
    "proof_state=Pass",
    "target=https://mullusi.com/",
    "target=https://www.mullusi.com/",
    "target=https://www.mullusi.com/proof/?gate=www-canonical",
    "target=https://mullusi.com/.well-known/security.txt",
    "github_request=",
    "fastly_request=",
    "served_by=",
    "via=",
  ]) {
    requireTerm(findings, fileName, content, term);
  }
  const rootWwwBlock = requireSingleWitnessBlock(findings, fileName, content, "https://www.mullusi.com/");
  if (rootWwwBlock) {
    requireWitnessValue(findings, fileName, rootWwwBlock, "https://www.mullusi.com/", "final_url", "https://mullusi.com/");
    requireWitnessValue(findings, fileName, rootWwwBlock, "https://www.mullusi.com/", "redirect_count", "1");
    requireWitnessValue(findings, fileName, rootWwwBlock, "https://www.mullusi.com/", "first_redirect_status", "301");
    requireWitnessValue(findings, fileName, rootWwwBlock, "https://www.mullusi.com/", "first_redirect_url", "https://mullusi.com/");
    requireWitnessValue(findings, fileName, rootWwwBlock, "https://www.mullusi.com/", "verdict", "CloudflareOriginCandidate");
    requireWitnessValue(findings, fileName, rootWwwBlock, "https://www.mullusi.com/", "proof_state", "Pass");
  }
  const pathQueryBlock = requireSingleWitnessBlock(findings, fileName, content, "https://www.mullusi.com/proof/?gate=www-canonical");
  if (pathQueryBlock) {
    requireWitnessValue(findings, fileName, pathQueryBlock, "https://www.mullusi.com/proof/?gate=www-canonical", "final_url", "https://mullusi.com/proof/?gate=www-canonical");
    requireWitnessValue(findings, fileName, pathQueryBlock, "https://www.mullusi.com/proof/?gate=www-canonical", "redirect_count", "1");
    requireWitnessValue(findings, fileName, pathQueryBlock, "https://www.mullusi.com/proof/?gate=www-canonical", "first_redirect_status", "301");
    requireWitnessValue(findings, fileName, pathQueryBlock, "https://www.mullusi.com/proof/?gate=www-canonical", "first_redirect_url", "https://mullusi.com/proof/?gate=www-canonical");
    requireWitnessValue(findings, fileName, pathQueryBlock, "https://www.mullusi.com/proof/?gate=www-canonical", "verdict", "CloudflareOriginCandidate");
    requireWitnessValue(findings, fileName, pathQueryBlock, "https://www.mullusi.com/proof/?gate=www-canonical", "proof_state", "Pass");
  }
  if (/verdict=CanonicalRedirectPending|proof_state=Unknown/.test(content)) {
    findings.push("artifact_website_origin_redirect_pending");
  }
}

function validateSecurityHeaders(findings, content) {
  const fileName = "security-headers.txt";
  for (const line of [
    "verdict=SolvedVerified",
    "proof_state=Pass",
    "security_header_state=SolvedVerified",
    "finding=none",
    "raw_response_headers=not_recorded",
  ]) {
    requireLine(findings, fileName, content, line);
  }
  for (const term of [
    "header_content_security_policy=Pass",
    "header_strict_transport_security=Pass",
    "header_permissions_policy=Pass",
  ]) {
    requireTerm(findings, fileName, content, term);
  }
}

function validateDomainSecurity(findings, content) {
  const fileName = "domain-security.txt";
  const solved = hasLine(content, "verdict=SolvedVerified") && hasLine(content, "proof_state=Pass");
  const hardeningPending = hasLine(content, "verdict=AwaitingEvidence") && hasLine(content, "proof_state=Unknown");
  if (!solved && !hardeningPending) {
    findings.push("domain_security_state_invalid");
  }
  for (const term of [
    "domain_security_state=",
    "dnssec_ds=Pass",
    "mx_google_workspace=Pass",
    "spf_record=Pass",
    "dmarc_record=Pass",
    "raw_dns_values=not_recorded",
  ]) {
    requireTerm(findings, fileName, content, term);
  }
}

function validateDomainHardeningPreflight(findings, content) {
  const fileName = "domain-hardening-preflight.txt";
  for (const line of [
    "verdict=GovernanceBlocked",
    "proof_state=Unknown",
    "domain_hardening_preflight=GovernanceBlocked",
    "manual_caa_allowed=false",
    "dkim_publication_allowed=false",
    "spf_hardfail_allowed=false",
    "dmarc_enforcement_allowed=false",
    "mta_sts_enforce_allowed=false",
    "tls_rpt_publication_allowed=false",
    "finding=preflight_waiting_for_external_evidence",
    "raw_secret_values=not_recorded",
  ]) {
    requireLine(findings, fileName, content, line);
  }
}

function validateSearchIndexingSurface(findings, content) {
  const fileName = "search-indexing-surface.txt";
  for (const line of [
    "verdict=SolvedVerified",
    "proof_state=Pass",
    "finding=none",
  ]) {
    requireLine(findings, fileName, content, line);
  }
  for (const term of [
    "local_sitemap_loc_count=",
    "live_sitemap_loc_count=",
  ]) {
    requireTerm(findings, fileName, content, term);
  }
}

function validateDeploymentIntegrity(findings, content) {
  const fileName = "deployment-integrity.txt";
  const solved = hasLine(content, "verdict=SolvedVerified") && hasLine(content, "proof_state=Pass");
  const solvedUnverified = hasLine(content, "verdict=SolvedUnverified") && hasLine(content, "proof_state=Pass");
  const localPending = hasLine(content, "verdict=AwaitingEvidence") && hasLine(content, "proof_state=Unknown");
  const evidenceError = localPending && /^error=/m.test(content);
  if (!solved && !solvedUnverified && !localPending) {
    findings.push("deployment_integrity_state_invalid");
  }
  if (evidenceError) {
    for (const line of [
      "raw_response_bodies=not_recorded",
      "raw_response_headers=not_recorded",
    ]) {
      requireLine(findings, fileName, content, line);
    }
    return;
  }
  for (const line of [
    "live_content_hashes=Pass",
    "finding=none",
    "raw_response_bodies=not_recorded",
    "raw_response_headers=not_recorded",
  ]) {
    requireLine(findings, fileName, content, line);
  }
  for (const term of [
    "live_deployment_integrity_state=",
    "live_status_manifest=Pass",
    "local_status_manifest_match=",
    "edge_html_transform=",
    "governed_file_count=",
  ]) {
    requireTerm(findings, fileName, content, term);
  }
}

export function evaluateLiveSafetyWitnessArtifact(artifactDirectory) {
  const resolvedDirectory = path.isAbsolute(artifactDirectory)
    ? artifactDirectory
    : path.join(repoRoot, artifactDirectory);
  const findings = [];
  if (!fs.existsSync(resolvedDirectory) || !fs.statSync(resolvedDirectory).isDirectory()) {
    return {
      verdict: "GovernanceBlocked",
      proofState: "Fail",
      liveSafetyWitnessState: "GovernanceBlocked",
      artifactDirectory: resolvedDirectory,
      artifactFileCount: 0,
      findings: [`artifact_directory_missing:${artifactDirectory}`],
    };
  }

  const files = Object.fromEntries(requiredArtifactFiles.map((fileName) => {
    const record = readArtifactFile(resolvedDirectory, fileName);
    if (record.error) {
      findings.push(record.error);
    } else {
      validateBoundary(findings, fileName, record.content);
    }
    return [fileName, record.content];
  }));

  if (files["run-metadata.txt"]) validateRunMetadata(findings, files["run-metadata.txt"]);
  if (files["public-visibility.txt"]) validatePublicVisibility(findings, files["public-visibility.txt"]);
  if (files["regional-public-visibility.txt"]) validateRegionalPublicVisibility(findings, files["regional-public-visibility.txt"]);
  if (files["website-origin.txt"]) validateWebsiteOrigin(findings, files["website-origin.txt"]);
  if (files["security-headers.txt"]) validateSecurityHeaders(findings, files["security-headers.txt"]);
  if (files["domain-security.txt"]) validateDomainSecurity(findings, files["domain-security.txt"]);
  if (files["domain-hardening-preflight.txt"]) {
    validateDomainHardeningPreflight(findings, files["domain-hardening-preflight.txt"]);
  }
  if (files["search-indexing-surface.txt"]) validateSearchIndexingSurface(findings, files["search-indexing-surface.txt"]);
  if (files["deployment-integrity.txt"]) validateDeploymentIntegrity(findings, files["deployment-integrity.txt"]);

  return {
    verdict: findings.length === 0 ? "SolvedVerified" : "GovernanceBlocked",
    proofState: findings.length === 0 ? "Pass" : "Fail",
    liveSafetyWitnessState: findings.length === 0 ? "SolvedVerified" : "GovernanceBlocked",
    artifactDirectory: resolvedDirectory,
    artifactFileCount: requiredArtifactFiles.filter((fileName) => files[fileName]).length,
    findings,
  };
}

export function formatResult(result) {
  const findingLines = result.findings.length === 0
    ? ["finding=none"]
    : result.findings.map((finding) => `finding=${finding}`);
  return [
    `verdict=${result.verdict}`,
    `proof_state=${result.proofState}`,
    `live_safety_witness_state=${result.liveSafetyWitnessState}`,
    `artifact_directory=${result.artifactDirectory}`,
    `artifact_file_count=${result.artifactFileCount}`,
    ...findingLines,
  ].join("\n");
}

function unsupportedOptions(args) {
  return args.filter((arg) => arg.startsWith("--"));
}

function runCli() {
  const args = process.argv.slice(2);
  const unsupported = unsupportedOptions(args);
  if (unsupported.length > 0) {
    console.log(`verdict=GovernanceBlocked\nproof_state=Fail\nerror=unsupported_args:${unsupported.join(",")}`);
    process.exit(1);
    return;
  }
  const artifactDirectory = args[0] ?? defaultArtifactDirectory;
  const result = evaluateLiveSafetyWitnessArtifact(artifactDirectory);
  console.log(formatResult(result));
  if (result.proofState !== "Pass") {
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
