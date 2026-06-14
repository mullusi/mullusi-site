/*
Purpose: verify live-safety witness artifact validation without network access.
Governance scope: artifact completeness, probe result checks, optional external-region failures, and public-safe boundary rejection.
Dependencies: Node.js standard library and scripts/check-live-safety-witness.mjs.
Invariants: tests create local temporary fixtures only and never call public networks.
*/

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  evaluateLiveSafetyWitnessArtifact,
  formatResult,
} from "./check-live-safety-witness.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptsDir, "..");
const checkerScript = path.join(scriptsDir, "check-live-safety-witness.mjs");

function createFixture(files = {}) {
  const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "mullusi-live-safety-"));
  const defaultFiles = {
    "run-metadata.txt": [
      "workflow=live-safety-probes",
      "run_id=123",
      "run_attempt=1",
      "commit=abc123",
      "observed_at=2026-05-24T12:00:00Z",
      "raw_response_headers=not_recorded",
    ].join("\n"),
    "public-visibility.txt": [
      "verdict=SolvedVerified",
      "proof_state=Pass",
      "public_edge_visibility=SolvedVerified",
      "global_all_users_claim=AwaitingEvidence",
      "finding=none",
    ].join("\n"),
    "regional-public-visibility.txt": [
      "verdict=SolvedVerified",
      "proof_state=Pass",
      "external_multi_region_visibility=SolvedVerified",
      "global_all_users_claim=AwaitingEvidence",
      "external_regional_probe_floor=2",
      "external_probe_count=6",
      "external_distinct_region_passes=5",
      "external_finding=none",
    ].join("\n"),
    "website-origin.txt": [
      "verdict=CloudflareOriginCandidate",
      "proof_state=Pass",
      "target=https://mullusi.com/",
      "final_url=https://mullusi.com/",
      "status=200",
      "redirect_count=0",
      "first_redirect_status=",
      "first_redirect_url=",
      "server=cloudflare",
      "github_request=",
      "fastly_request=",
      "served_by=",
      "via=",
      "",
      "target=https://www.mullusi.com/",
      "final_url=https://mullusi.com/",
      "status=200",
      "redirect_count=1",
      "first_redirect_status=301",
      "first_redirect_url=https://mullusi.com/",
      "server=cloudflare",
      "verdict=CloudflareOriginCandidate",
      "proof_state=Pass",
      "github_request=",
      "fastly_request=",
      "served_by=",
      "via=",
      "",
      "target=https://www.mullusi.com/proof/?gate=www-canonical",
      "final_url=https://mullusi.com/proof/?gate=www-canonical",
      "status=200",
      "redirect_count=1",
      "first_redirect_status=301",
      "first_redirect_url=https://mullusi.com/proof/?gate=www-canonical",
      "server=cloudflare",
      "verdict=CloudflareOriginCandidate",
      "proof_state=Pass",
      "github_request=",
      "fastly_request=",
      "served_by=",
      "via=",
      "",
      "target=https://mullusi.com/.well-known/security.txt",
      "final_url=https://mullusi.com/.well-known/security.txt",
      "status=200",
      "redirect_count=0",
      "first_redirect_status=",
      "first_redirect_url=",
      "server=cloudflare",
      "verdict=CloudflareOriginCandidate",
      "proof_state=Pass",
      "github_request=",
      "fastly_request=",
      "served_by=",
      "via=",
    ].join("\n"),
    "security-headers.txt": [
      "verdict=SolvedVerified",
      "proof_state=Pass",
      "security_header_state=SolvedVerified",
      "finding=none",
      "header_content_security_policy=Pass",
      "header_strict_transport_security=Pass",
      "header_permissions_policy=Pass",
      "raw_response_headers=not_recorded",
    ].join("\n"),
    "security-txt.txt": [
      "verdict=SolvedVerified",
      "proof_state=Pass",
      "security_txt_state=SolvedVerified",
      "observed_at=2026-05-27",
      "expires_at=2027-05-16T00:00:00.000Z",
      "expires_days_remaining=354",
      "minimum_validity_days=30",
      "maximum_validity_days=366",
      "contact_count=2",
      "policy_count=1",
      "canonical_count=1",
      "preferred_language_count=2",
      "finding=none",
      "raw_secret_values=not_read",
    ].join("\n"),
    "domain-security.txt": [
      "verdict=AwaitingEvidence",
      "proof_state=Unknown",
      "domain_security_state=AwaitingEvidence",
      "dnssec_ds=Pass",
      "caa_policy=AwaitingEvidence",
      "mx_google_workspace=Pass",
      "spf_record=Pass",
      "spf_enforcement=AwaitingEvidence",
      "dmarc_record=Pass",
      "dmarc_policy=none",
      "dmarc_enforcement=AwaitingEvidence",
      "finding=spf_not_hardfail",
      "raw_dns_values=not_recorded",
    ].join("\n"),
    "domain-hardening-preflight.txt": [
      "verdict=SolvedVerified",
      "proof_state=Pass",
      "domain_hardening_preflight=SolvedVerified",
      "manual_caa_allowed=true",
      "dkim_publication_allowed=true",
      "spf_hardfail_allowed=true",
      "dmarc_enforcement_allowed=true",
      "mta_sts_enforce_allowed=true",
      "tls_rpt_publication_allowed=true",
      "finding=none",
      "raw_secret_values=not_recorded",
    ].join("\n"),
    "search-indexing-surface.txt": [
      "verdict=SolvedVerified",
      "proof_state=Pass",
      "local_sitemap_loc_count=13",
      "live_sitemap_loc_count=13",
      "finding=none",
    ].join("\n"),
    "deployment-integrity.txt": [
      "verdict=SolvedVerified",
      "proof_state=Pass",
      "live_deployment_integrity_state=SolvedVerified",
      "live_status_manifest=Pass",
      "live_content_hashes=Pass",
      "local_status_manifest_match=Pass",
      "edge_html_transform=Pass",
      "governed_file_count=7",
      "finding=none",
      "local_finding=none",
      "accepted_finding=none",
      "raw_response_bodies=not_recorded",
      "raw_response_headers=not_recorded",
    ].join("\n"),
    ...files,
  };
  for (const [fileName, content] of Object.entries(defaultFiles)) {
    fs.writeFileSync(path.join(fixtureDirectory, fileName), content, "utf8");
  }
  return fixtureDirectory;
}

function runChecker(args) {
  return spawnSync(process.execPath, [checkerScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function testPassingArtifactValidates() {
  const fixtureDirectory = createFixture();
  const result = evaluateLiveSafetyWitnessArtifact(fixtureDirectory);
  const formatted = formatResult(result);

  assert.equal(result.verdict, "SolvedVerified");
  assert.equal(result.proofState, "Pass");
  assert.equal(result.liveSafetyWitnessState, "SolvedVerified");
  assert.equal(result.artifactFileCount, 10);
  assert.match(formatted, /finding=none/);
}

function testExternalProviderErrorIsAllowedForRegionalProbe() {
  const fixtureDirectory = createFixture({
    "regional-public-visibility.txt": [
      "verdict=AwaitingEvidence",
      "proof_state=Unknown",
      "error=request_timeout:https://api.globalping.io/v1/measurements",
    ].join("\n"),
  });
  const result = evaluateLiveSafetyWitnessArtifact(fixtureDirectory);

  assert.equal(result.verdict, "SolvedVerified");
  assert.equal(result.proofState, "Pass");
  assert.deepEqual(result.findings, []);
}

function testDeploymentIntegrityEvidenceErrorIsAllowed() {
  const fixtureDirectory = createFixture({
    "deployment-integrity.txt": [
      "verdict=AwaitingEvidence",
      "proof_state=Unknown",
      "error=request_timeout:https://mullusi.com/status.json",
      "raw_response_bodies=not_recorded",
      "raw_response_headers=not_recorded",
    ].join("\n"),
  });
  const result = evaluateLiveSafetyWitnessArtifact(fixtureDirectory);

  assert.equal(result.verdict, "SolvedVerified");
  assert.equal(result.proofState, "Pass");
  assert.deepEqual(result.findings, []);
}

function testMissingArtifactFileBlocks() {
  const fixtureDirectory = createFixture();
  fs.unlinkSync(path.join(fixtureDirectory, "security-headers.txt"));
  const result = evaluateLiveSafetyWitnessArtifact(fixtureDirectory);

  assert.equal(result.verdict, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.ok(result.findings.includes("artifact_file_missing:security-headers.txt"));
}

function testFailedProbeBlocks() {
  const fixtureDirectory = createFixture({
    "domain-security.txt": [
      "verdict=GovernanceBlocked",
      "proof_state=Fail",
      "domain_security_state=GovernanceBlocked",
      "dnssec_ds=Fail",
      "raw_dns_values=not_recorded",
    ].join("\n"),
  });
  const result = evaluateLiveSafetyWitnessArtifact(fixtureDirectory);

  assert.equal(result.verdict, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.ok(result.findings.includes("domain_security_state_invalid"));
  assert.ok(result.findings.includes("artifact_term_missing:domain-security.txt:dnssec_ds=Pass"));
}

function testBoundaryViolationBlocks() {
  const fixtureDirectory = createFixture({
    "website-origin.txt": [
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
      "billing_id=secret",
    ].join("\n"),
  });
  const result = evaluateLiveSafetyWitnessArtifact(fixtureDirectory);

  assert.equal(result.verdict, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.ok(result.findings.some((finding) => finding.startsWith("artifact_boundary_invalid:website-origin.txt")));
}

function testWebsiteOriginMissingPathQueryRedirectBlocks() {
  const fixtureDirectory = createFixture({
    "website-origin.txt": [
      "verdict=CloudflareOriginCandidate",
      "proof_state=Pass",
      "target=https://mullusi.com/",
      "target=https://www.mullusi.com/",
      "final_url=https://mullusi.com/",
      "status=200",
      "redirect_count=1",
      "first_redirect_status=301",
      "first_redirect_url=https://mullusi.com/",
      "target=https://mullusi.com/.well-known/security.txt",
      "github_request=",
      "fastly_request=",
      "served_by=",
      "via=",
    ].join("\n"),
  });
  const result = evaluateLiveSafetyWitnessArtifact(fixtureDirectory);

  assert.equal(result.verdict, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.ok(result.findings.includes("artifact_term_missing:website-origin.txt:target=https://www.mullusi.com/proof/?gate=www-canonical"));
  assert.ok(result.findings.includes("artifact_witness_block_count_invalid:website-origin.txt:https://www.mullusi.com/proof/?gate=www-canonical:0"));
}

function testWebsiteOriginPendingWwwRedirectBlocks() {
  const fixtureDirectory = createFixture({
    "website-origin.txt": [
      "verdict=CloudflareOriginCandidate",
      "proof_state=Pass",
      "target=https://mullusi.com/",
      "target=https://www.mullusi.com/",
      "final_url=https://www.mullusi.com/",
      "status=200",
      "redirect_count=0",
      "first_redirect_status=",
      "first_redirect_url=",
      "verdict=CanonicalRedirectPending",
      "proof_state=Unknown",
      "",
      "target=https://www.mullusi.com/proof/?gate=www-canonical",
      "final_url=https://mullusi.com/proof/?gate=www-canonical",
      "status=200",
      "redirect_count=1",
      "first_redirect_status=301",
      "first_redirect_url=https://mullusi.com/proof/?gate=www-canonical",
      "verdict=CloudflareOriginCandidate",
      "proof_state=Pass",
      "target=https://mullusi.com/.well-known/security.txt",
      "github_request=",
      "fastly_request=",
      "served_by=",
      "via=",
    ].join("\n"),
  });
  const result = evaluateLiveSafetyWitnessArtifact(fixtureDirectory);

  assert.equal(result.verdict, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.ok(result.findings.includes("artifact_witness_value_invalid:website-origin.txt:https://www.mullusi.com/:final_url:https://www.mullusi.com/"));
  assert.ok(result.findings.includes("artifact_witness_value_invalid:website-origin.txt:https://www.mullusi.com/:redirect_count:0"));
  assert.ok(result.findings.includes("artifact_website_origin_redirect_pending"));
}

function testCliRejectsUnsupportedArgument() {
  const result = runChecker(["--unexpected"]);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /verdict=GovernanceBlocked/);
  assert.match(result.stdout, /error=unsupported_args:--unexpected/);
}

testPassingArtifactValidates();
testExternalProviderErrorIsAllowedForRegionalProbe();
testDeploymentIntegrityEvidenceErrorIsAllowed();
testMissingArtifactFileBlocks();
testFailedProbeBlocks();
testBoundaryViolationBlocks();
testWebsiteOriginMissingPathQueryRedirectBlocks();
testWebsiteOriginPendingWwwRedirectBlocks();
testCliRejectsUnsupportedArgument();
console.log("live safety witness artifact tests passed");
