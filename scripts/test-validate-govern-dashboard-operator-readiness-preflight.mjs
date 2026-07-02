/*
Purpose: test the Mullu Govern dashboard operator readiness preflight validator.
Governance scope: dashboard route reservation, blocked readiness claim, fail-closed approval refs, unsupported args, and no-secret pattern rejection.
Dependencies: Node.js standard library and scripts/validate-govern-dashboard-operator-readiness-preflight.mjs.
Invariants: tests use public-safe repository evidence or synthetic fixtures only; they never inspect provider dashboards or private values.
*/

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatGovernDashboardOperatorReadinessPreflightReport,
  validateGovernDashboardOperatorReadinessPreflight,
  validateGovernDashboardOperatorReadinessPreflightEvidence,
} from "./validate-govern-dashboard-operator-readiness-preflight.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptsDir, "..");
const validatorScript = path.join(scriptsDir, "validate-govern-dashboard-operator-readiness-preflight.mjs");
const dashboardRoute = "https://dashboard.mullusi.com/govern";

function runValidator(args = []) {
  return spawnSync(process.execPath, [validatorScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function validEvidence(overrides = {}) {
  const witness = [
    "dashboard_operator_readiness_preflight_state=Ready",
    "solver_outcome=SolvedVerified",
    "proof_state=Pass",
    `dashboard_route=${dashboardRoute}`,
    "dashboard_route_reserved=true",
    "dashboard_live_claim_allowed=false",
    "dashboard_operator_readiness_ref=missing",
    "public_write_route_allowed=false",
    "route_publication_action=none",
    "dns_mutation=none",
    "runtime_mutation=none",
    "dashboard_auth_mutation=none",
    "secret_rotation_required=false",
    "provider_dashboard_values_recorded=false",
    "last_reviewed=2026-07-02",
    "## 2026-07-02 Public Probe Update",
    "command=curl status-only probes for https://dashboard.mullusi.com",
    "dashboard_root_status=200",
    "dashboard_govern_route_status=404",
    "reserved product operator path still lacks",
    "STATUS:",
  ].join("\n");
  return {
    approvalPacket: "public_write_route_allowed=false\ndashboard_operator_readiness_ref=missing\n",
    manifest: {
      id: "mullu-govern",
      api: { exposure: "planned" },
      proof: { claimsBlockedUntilVerified: ["dashboard operator readiness"] },
      surfaces: { dashboardRoute },
    },
    privateValueScanSources: {
      approvalPacket: "public_write_route_allowed=false\ndashboard_operator_readiness_ref=missing\n",
      manifest: JSON.stringify({ dashboardRoute }),
      witness,
    },
    witness,
    ...overrides,
  };
}

function testCurrentDashboardOperatorReadinessPreflightPasses() {
  const result = validateGovernDashboardOperatorReadinessPreflight();
  const report = formatGovernDashboardOperatorReadinessPreflightReport(result);

  assert.equal(result.solverOutcome, "SolvedVerified");
  assert.equal(result.proofState, "Pass");
  assert.equal(result.dashboardOperatorReadinessPreflightState, "Ready");
  assert.equal(result.dashboardRoute, dashboardRoute);
  assert.equal(result.publicWriteRouteAllowed, false);
  assert.equal(result.findings.length, 0);
  assert.match(report, /dashboard_live_claim_allowed=false/);
  assert.match(report, /provider_dashboard_values=not_recorded/);
}

function testSyntheticDashboardRouteMismatchFailsClosed() {
  const evidence = validEvidence({
    manifest: {
      ...validEvidence().manifest,
      surfaces: { dashboardRoute: "https://private.example.internal/govern" },
    },
  });
  const result = validateGovernDashboardOperatorReadinessPreflightEvidence(evidence);
  const report = formatGovernDashboardOperatorReadinessPreflightReport(result);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.dashboardOperatorReadinessPreflightState, "Blocked");
  assert.equal(result.dashboardRoute, "redacted_value");
  assert.match(result.findings.join("\n"), /manifest_dashboard_route_invalid:redacted_value/);
  assert.doesNotMatch(report, /private\.example\.internal/);
}

function testSyntheticUnblockedDashboardClaimFailsClosed() {
  const evidence = validEvidence({
    manifest: {
      ...validEvidence().manifest,
      proof: { claimsBlockedUntilVerified: ["production runtime witness closure"] },
    },
  });
  const result = validateGovernDashboardOperatorReadinessPreflightEvidence(evidence);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.publicWriteRouteAllowed, false);
  assert.match(result.findings.join("\n"), /manifest_dashboard_operator_readiness_claim_not_blocked/);
}

function testSyntheticApprovalRefFailsClosed() {
  const evidence = validEvidence({
    approvalPacket: "public_write_route_allowed=false\ndashboard_operator_readiness_ref=ops/dashboard-ready.md\n",
  });
  const result = validateGovernDashboardOperatorReadinessPreflightEvidence(evidence);
  const report = formatGovernDashboardOperatorReadinessPreflightReport(result);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.match(result.findings.join("\n"), /approval_packet_dashboard_operator_readiness_ref_must_remain_missing:redacted_value/);
  assert.doesNotMatch(report, /dashboard-ready/);
}

function testSyntheticMissingWitnessTermUsesPublicLabel() {
  const evidence = validEvidence({
    witness: validEvidence().witness.replace("provider_dashboard_values_recorded=false", ""),
  });
  evidence.privateValueScanSources.witness = evidence.witness;
  const result = validateGovernDashboardOperatorReadinessPreflightEvidence(evidence);
  const report = formatGovernDashboardOperatorReadinessPreflightReport(result);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.match(result.findings.join("\n"), /required_witness_term_missing:provider_dashboard_values_recorded/);
  assert.doesNotMatch(report, /provider_dashboard_values_recorded=false/);
}

function testSyntheticUnsafeManifestValuesAreRedacted() {
  const evidence = validEvidence({
    manifest: {
      ...validEvidence().manifest,
      id: "private-product-id",
      api: { exposure: "private-exposure" },
      surfaces: { dashboardRoute: "https://private.example.internal/govern" },
    },
  });
  const result = validateGovernDashboardOperatorReadinessPreflightEvidence(evidence);
  const report = formatGovernDashboardOperatorReadinessPreflightReport(result);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.match(result.findings.join("\n"), /manifest_id_invalid:redacted_value/);
  assert.match(result.findings.join("\n"), /manifest_api_exposure_must_remain_planned:redacted_value/);
  assert.match(result.findings.join("\n"), /manifest_dashboard_route_invalid:redacted_value/);
  assert.doesNotMatch(report, /private-product-id/);
  assert.doesNotMatch(report, /private-exposure/);
  assert.doesNotMatch(report, /private\.example\.internal/);
}

function testSyntheticSecretPatternFailsClosed() {
  const evidence = validEvidence({
    privateValueScanSources: {
      approvalPacket: "{}",
      manifest: "Bearer abcdefghijklmnopqrstuvwxyz123456",
      witness: "dashboard_operator_readiness_preflight_state=Ready",
    },
  });
  const result = validateGovernDashboardOperatorReadinessPreflightEvidence(evidence);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.match(result.findings.join("\n"), /forbidden_private_value_pattern:manifest:bearer_token/);
}

function testCliJsonAndUnsupportedArgs() {
  const jsonResult = runValidator(["--json"]);
  const payload = JSON.parse(jsonResult.stdout);
  assert.equal(jsonResult.status, 0);
  assert.equal(payload.solverOutcome, "SolvedVerified");
  assert.equal(payload.proofState, "Pass");
  assert.equal(payload.dashboardOperatorReadinessPreflightState, "Ready");

  const invalid = runValidator(["--unknown"]);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stdout, /unsupported_args_count:1/);
  assert.doesNotMatch(invalid.stdout, /--unknown/);
  assert.match(invalid.stdout, /govern_dashboard_operator_readiness_preflight=GovernanceBlocked/);
}

function testPathBoundaryFailsClosedWithoutEcho() {
  const outsideResult = validateGovernDashboardOperatorReadinessPreflight(path.join("..", "private-dashboard-readiness.md"));
  const outsideReport = formatGovernDashboardOperatorReadinessPreflightReport(outsideResult);

  assert.equal(outsideResult.solverOutcome, "GovernanceBlocked");
  assert.equal(outsideResult.proofState, "Fail");
  assert.equal(outsideResult.dashboardOperatorReadinessPreflightState, "Blocked");
  assert.equal(outsideResult.publicWriteRouteAllowed, false);
  assert.deepEqual(outsideResult.findings, ["dashboard_operator_readiness_preflight_path_outside_repo"]);
  assert.doesNotMatch(outsideReport, /private-dashboard-readiness/);

  const unreadableResult = validateGovernDashboardOperatorReadinessPreflight(path.join("ops", "missing-private-dashboard-readiness.md"));
  const unreadableReport = formatGovernDashboardOperatorReadinessPreflightReport(unreadableResult);

  assert.equal(unreadableResult.solverOutcome, "GovernanceBlocked");
  assert.equal(unreadableResult.proofState, "Fail");
  assert.equal(unreadableResult.dashboardOperatorReadinessPreflightState, "Blocked");
  assert.equal(unreadableResult.publicWriteRouteAllowed, false);
  assert.deepEqual(unreadableResult.findings, ["dashboard_operator_readiness_preflight_unreadable"]);
  assert.doesNotMatch(unreadableReport, /missing-private-dashboard-readiness/);
}

testCurrentDashboardOperatorReadinessPreflightPasses();
testSyntheticDashboardRouteMismatchFailsClosed();
testSyntheticUnblockedDashboardClaimFailsClosed();
testSyntheticApprovalRefFailsClosed();
testSyntheticMissingWitnessTermUsesPublicLabel();
testSyntheticUnsafeManifestValuesAreRedacted();
testSyntheticSecretPatternFailsClosed();
testCliJsonAndUnsupportedArgs();
testPathBoundaryFailsClosedWithoutEcho();

console.log("govern dashboard operator-readiness preflight validator tests passed");
