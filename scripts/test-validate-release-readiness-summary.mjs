/*
Purpose: test the release readiness summary validator.
Governance scope: release status mirroring, product runtime claim denial, unsupported args, and no-secret pattern rejection.
Dependencies: Node.js standard library and scripts/validate-release-readiness-summary.mjs.
Invariants: tests use public-safe repository evidence or synthetic fixtures only; they never contact live endpoints, provider dashboards, DNS APIs, private recovery files, or mailboxes.
*/

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatReleaseReadinessSummaryReport,
  validateReleaseReadinessSummary,
  validateReleaseReadinessSummaryEvidence,
} from "./validate-release-readiness-summary.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptsDir, "..");
const validatorScript = path.join(scriptsDir, "validate-release-readiness-summary.mjs");

function runValidator(args = []) {
  return spawnSync(process.execPath, [validatorScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function validSummary(overrides = {}) {
  const values = {
    website_static_deployment_integrity: "SolvedVerified",
    live_status_manifest: "Pass",
    local_status_manifest_match: "Pass",
    api_exposure_state: "AwaitingEvidence",
    api_dns_publication_allowed: "false",
    api_production_readiness_state: "AwaitingEvidence",
    product_runtime_release_witness: "AwaitingEvidence",
    product_runtime_claims_allowed: "false",
    public_product_release_allowed: "false",
    recovery_witness_state: "ReadyForProvisioning",
    api_provisioning_allowed: "true",
    domain_security_state: "SolvedVerified",
    domain_hardening_preflight: "SolvedVerified",
    raw_secret_values: "not_recorded",
    private_recovery_values: "not_read",
    static_website_public: "true",
    static_website_integrity: "SolvedVerified",
    product_runtime_release: "false",
    api_dns_publication_allowed_rule: "false",
    api_gateway_public: "false",
    runtime_claims_allowed: "false",
    domain_hardening_mutation_allowed: "true",
    ...overrides,
  };

  return [
    "# Release Readiness Summary",
    "```text",
    `website_static_deployment_integrity=${values.website_static_deployment_integrity}`,
    `live_status_manifest=${values.live_status_manifest}`,
    `local_status_manifest_match=${values.local_status_manifest_match}`,
    `api_exposure_state=${values.api_exposure_state}`,
    `api_dns_publication_allowed=${values.api_dns_publication_allowed}`,
    `api_production_readiness_state=${values.api_production_readiness_state}`,
    `product_runtime_release_witness=${values.product_runtime_release_witness}`,
    `product_runtime_claims_allowed=${values.product_runtime_claims_allowed}`,
    `public_product_release_allowed=${values.public_product_release_allowed}`,
    `recovery_witness_state=${values.recovery_witness_state}`,
    `api_provisioning_allowed=${values.api_provisioning_allowed}`,
    `domain_security_state=${values.domain_security_state}`,
    `domain_hardening_preflight=${values.domain_hardening_preflight}`,
    `raw_secret_values=${values.raw_secret_values}`,
    `private_recovery_values=${values.private_recovery_values}`,
    "```",
    "```text",
    `static_website_public=${values.static_website_public}`,
    `static_website_integrity=${values.static_website_integrity}`,
    `product_runtime_release=${values.product_runtime_release}`,
    `api_dns_publication_allowed=${values.api_dns_publication_allowed_rule}`,
    `api_gateway_public=${values.api_gateway_public}`,
    `runtime_claims_allowed=${values.runtime_claims_allowed}`,
    `product_runtime_claims_allowed=${values.product_runtime_claims_allowed}`,
    `public_product_release_allowed=${values.public_product_release_allowed}`,
    `domain_hardening_mutation_allowed=${values.domain_hardening_mutation_allowed}`,
    "```",
    "STATUS:",
  ].join("\n");
}

function validOpsNextReport(overrides = {}) {
  const values = {
    api_exposure_state: "AwaitingEvidence",
    api_dns_publication_allowed: "false",
    api_production_readiness_state: "AwaitingEvidence",
    product_runtime_claims_allowed: "false",
    public_product_release_allowed: "false",
    recovery_witness_state: "ReadyForProvisioning",
    api_provisioning_allowed: "true",
    domain_hardening_preflight: "SolvedVerified",
    ...overrides,
  };
  return Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n");
}

function validEvidence(overrides = {}) {
  return {
    opsNextReport: validOpsNextReport(),
    summary: validSummary(),
    ...overrides,
  };
}

function testCurrentReleaseReadinessSummaryPasses() {
  const result = validateReleaseReadinessSummary();
  const report = formatReleaseReadinessSummaryReport(result);

  assert.equal(result.solverOutcome, "SolvedVerified");
  assert.equal(result.proofState, "Pass");
  assert.equal(result.releaseReadinessState, "Ready");
  assert.equal(result.productRuntimeClaimsAllowed, false);
  assert.equal(result.publicProductReleaseAllowed, false);
  assert.equal(result.findings.length, 0);
  assert.match(report, /release_readiness_summary=SolvedVerified/);
  assert.match(report, /private_recovery_values=not_read/);
}

function testSyntheticMissingProductClaimDenialFailsClosed() {
  const evidence = validEvidence({
    summary: validSummary({ product_runtime_claims_allowed: "true" }),
  });
  const result = validateReleaseReadinessSummaryEvidence(evidence);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.productRuntimeClaimsAllowed, true);
  assert.match(result.findings.join("\n"), /required_summary_term_missing:product_runtime_claims_allowed/);
  assert.match(result.findings.join("\n"), /ops_report_mirror_mismatch:product_runtime_claims_allowed:true:false/);
}

function testSyntheticOpsReportMismatchFailsClosed() {
  const evidence = validEvidence({
    opsNextReport: validOpsNextReport({ api_production_readiness_state: "ReadyForDns" }),
  });
  const result = validateReleaseReadinessSummaryEvidence(evidence);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.publicProductReleaseAllowed, false);
  assert.match(result.findings.join("\n"), /ops_report_mirror_mismatch:api_production_readiness_state:AwaitingEvidence:ReadyForDns/);
}

function testSyntheticUnsafeMirrorValuesUsePublicLabels() {
  const evidence = validEvidence({
    opsNextReport: validOpsNextReport({ api_production_readiness_state: "private-reporter-state" }),
    summary: validSummary({ api_production_readiness_state: "private-summary-state" }),
  });
  const result = validateReleaseReadinessSummaryEvidence(evidence);
  const report = formatReleaseReadinessSummaryReport(result);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.match(result.findings.join("\n"), /required_summary_term_missing:api_production_readiness_state/);
  assert.match(result.findings.join("\n"), /ops_report_mirror_mismatch:api_production_readiness_state:redacted_value:redacted_value/);
  assert.doesNotMatch(report, /private-summary-state/);
  assert.doesNotMatch(report, /private-reporter-state/);
}

function testSyntheticSecretPatternFailsClosed() {
  const evidence = validEvidence({
    summary: `${validSummary()}\nBearer abcdefghijklmnopqrstuvwxyz123456`,
  });
  const result = validateReleaseReadinessSummaryEvidence(evidence);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.publicProductReleaseAllowed, false);
  assert.match(result.findings.join("\n"), /forbidden_private_value_pattern:releaseReadinessSummary:bearer_token/);
}

function testCliJsonAndUnsupportedArgs() {
  const jsonResult = runValidator(["--json"]);
  const payload = JSON.parse(jsonResult.stdout);
  assert.equal(jsonResult.status, 0);
  assert.equal(payload.solverOutcome, "SolvedVerified");
  assert.equal(payload.proofState, "Pass");
  assert.equal(payload.publicProductReleaseAllowed, false);

  const invalid = runValidator(["--unknown"]);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stdout, /unsupported_args_count:1/);
  assert.doesNotMatch(invalid.stdout, /--unknown/);
  assert.match(invalid.stdout, /release_readiness_summary=GovernanceBlocked/);
}

function testPathBoundaryFailsClosedWithoutEcho() {
  const outsidePath = path.join("..", "private-release-readiness-summary.md");
  const outside = validateReleaseReadinessSummary(outsidePath);

  assert.equal(outside.solverOutcome, "GovernanceBlocked");
  assert.equal(outside.proofState, "Fail");
  assert.equal(outside.releaseReadinessState, "Blocked");
  assert.deepEqual(outside.findings, ["release_readiness_summary_path_outside_repo"]);
  assert.doesNotMatch(formatReleaseReadinessSummaryReport(outside), /private-release-readiness-summary/);

  const unreadable = validateReleaseReadinessSummary(path.join("ops", "missing-private-release-summary.md"));
  assert.equal(unreadable.solverOutcome, "GovernanceBlocked");
  assert.equal(unreadable.proofState, "Fail");
  assert.deepEqual(unreadable.findings, ["release_readiness_summary_unreadable"]);
  assert.doesNotMatch(formatReleaseReadinessSummaryReport(unreadable), /missing-private-release-summary/);
}

testCurrentReleaseReadinessSummaryPasses();
testSyntheticMissingProductClaimDenialFailsClosed();
testSyntheticOpsReportMismatchFailsClosed();
testSyntheticUnsafeMirrorValuesUsePublicLabels();
testSyntheticSecretPatternFailsClosed();
testCliJsonAndUnsupportedArgs();
testPathBoundaryFailsClosedWithoutEcho();

console.log("release readiness summary validator tests passed");
