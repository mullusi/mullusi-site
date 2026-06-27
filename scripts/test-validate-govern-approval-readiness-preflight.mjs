/*
Purpose: test the Mullu Govern operator approval readiness preflight validator.
Governance scope: aggregate preflight health, missing approval refs, fail-closed public write route, unsupported args, and no-secret pattern rejection.
Dependencies: Node.js standard library and scripts/validate-govern-approval-readiness-preflight.mjs.
Invariants: tests use public-safe repository evidence or synthetic fixtures only; they never inspect provider dashboards or private values.
*/

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requiredLiveEvidenceApprovalKeys } from "./govern-live-evidence-ref-contract.mjs";
import {
  formatGovernApprovalReadinessPreflightReport,
  validateGovernApprovalReadinessPreflight,
  validateGovernApprovalReadinessPreflightEvidence,
} from "./validate-govern-approval-readiness-preflight.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptsDir, "..");
const validatorScript = path.join(scriptsDir, "validate-govern-approval-readiness-preflight.mjs");

function runValidator(args = []) {
  return spawnSync(process.execPath, [validatorScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function passingResult(extra = {}) {
  return {
    proofState: "Pass",
    solverOutcome: "SolvedVerified",
    ...extra,
  };
}

function validEvidence(overrides = {}) {
  const witness = [
    "approval_readiness_preflight_state=Ready",
    "solver_outcome=SolvedVerified",
    "proof_state=Pass",
    "packet_state=AwaitingEvidence",
    "approval_state=NotApproved",
    "operator_approval_ref=missing",
    "ready_for_approval=false",
    "public_write_route_allowed=false",
    "route_publication_action=none",
    "dns_mutation=none",
    "runtime_mutation=none",
    "dashboard_auth_mutation=none",
    "privacy_activation_allowed=false",
    "retention_activation_allowed=false",
    "product_status_promotion_allowed=false",
    "public_claim_update_allowed=false",
    "secret_rotation_required=false",
    "provider_values_recorded=false",
    "live_evidence_operator_request_command=node scripts/emit-govern-live-evidence-operator-request.mjs",
    "last_reviewed=2026-06-27",
    "STATUS:",
  ].join("\n");
  return {
    approvalPacket: [
      "packet_state=AwaitingEvidence",
      "approval_state=NotApproved",
      "public_write_route_allowed=false",
      ...requiredLiveEvidenceApprovalKeys.map((key) => `${key}=missing`),
    ].join("\n"),
    privateValueScanSources: {
      approvalPacket: "public_write_route_allowed=false\noperator_approval_ref=missing\n",
      witness,
    },
    validatorResults: {
      approvalPacket: passingResult({
        missingApprovalInputs: Array.from({ length: 8 }, (_, index) => `missing_${index}`),
        publicWriteRouteAllowed: false,
      }),
      contractPreflight: passingResult(),
      dashboardPreflight: passingResult(),
      privacyRetentionPreflight: passingResult(),
      productStatusPreflight: passingResult(),
      publicClaimPreflight: passingResult(),
      runtimeClosurePacket: passingResult(),
      supportReadiness: passingResult(),
      writeRouteDecision: passingResult(),
    },
    witness,
    ...overrides,
  };
}

function testCurrentApprovalReadinessPreflightPasses() {
  const result = validateGovernApprovalReadinessPreflight();
  const report = formatGovernApprovalReadinessPreflightReport(result);

  assert.equal(result.solverOutcome, "SolvedVerified");
  assert.equal(result.proofState, "Pass");
  assert.equal(result.approvalReadinessPreflightState, "Ready");
  assert.equal(result.readyForApproval, false);
  assert.equal(result.publicWriteRouteAllowed, false);
  assert.equal(result.missingApprovalInputCount, 8);
  assert.equal(result.findings.length, 0);
  assert.match(report, /ready_for_approval=false/);
  assert.match(report, /provider_values=not_recorded/);
}

function testSyntheticOperatorApprovalRefFailsClosed() {
  const evidence = validEvidence({
    approvalPacket: [
      "packet_state=AwaitingEvidence",
      "approval_state=NotApproved",
      "public_write_route_allowed=false",
      "operator_approval_ref=approval://operator/ready",
      ...requiredLiveEvidenceApprovalKeys.filter((key) => key !== "operator_approval_ref").map((key) => `${key}=missing`),
    ].join("\n"),
  });
  const result = validateGovernApprovalReadinessPreflightEvidence(evidence);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.readyForApproval, false);
  assert.match(result.findings.join("\n"), /approval_input_must_remain_missing:operator_approval_ref:redacted_value/);
  assert.doesNotMatch(formatGovernApprovalReadinessPreflightReport(result), /operator\/ready/);
}

function testSyntheticMissingWitnessTermUsesPublicLabel() {
  const evidence = validEvidence({
    witness: validEvidence().witness.replace("provider_values_recorded=false", ""),
  });
  evidence.privateValueScanSources.witness = evidence.witness;
  const result = validateGovernApprovalReadinessPreflightEvidence(evidence);
  const report = formatGovernApprovalReadinessPreflightReport(result);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.match(result.findings.join("\n"), /required_witness_term_missing:provider_values_recorded/);
  assert.doesNotMatch(report, /provider_values_recorded=false/);
}

function testSyntheticAggregateFailureFailsClosed() {
  const evidence = validEvidence({
    validatorResults: {
      ...validEvidence().validatorResults,
      contractPreflight: { proofState: "Fail", solverOutcome: "GovernanceBlocked" },
    },
  });
  const result = validateGovernApprovalReadinessPreflightEvidence(evidence);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.match(result.findings.join("\n"), /aggregate_validator_not_solved:contractPreflight:GovernanceBlocked/);
  assert.match(result.findings.join("\n"), /aggregate_validator_proof_not_pass:contractPreflight:Fail/);
}

function testSyntheticRouteRuntimeAggregateFailureFailsClosed() {
  const evidence = validEvidence({
    validatorResults: {
      ...validEvidence().validatorResults,
      runtimeClosurePacket: { proofState: "Fail", solverOutcome: "GovernanceBlocked" },
      writeRouteDecision: { proofState: "Fail", solverOutcome: "GovernanceBlocked" },
    },
  });
  const result = validateGovernApprovalReadinessPreflightEvidence(evidence);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.readyForApproval, false);
  assert.match(result.findings.join("\n"), /aggregate_validator_not_solved:runtimeClosurePacket:GovernanceBlocked/);
  assert.match(result.findings.join("\n"), /aggregate_validator_proof_not_pass:runtimeClosurePacket:Fail/);
  assert.match(result.findings.join("\n"), /aggregate_validator_not_solved:writeRouteDecision:GovernanceBlocked/);
  assert.match(result.findings.join("\n"), /aggregate_validator_proof_not_pass:writeRouteDecision:Fail/);
}

function testSyntheticWriteRouteOpenFailsClosed() {
  const evidence = validEvidence({
    approvalPacket: [
      "packet_state=AwaitingEvidence",
      "approval_state=NotApproved",
      "public_write_route_allowed=true",
      ...requiredLiveEvidenceApprovalKeys.map((key) => `${key}=missing`),
    ].join("\n"),
  });
  const result = validateGovernApprovalReadinessPreflightEvidence(evidence);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.publicWriteRouteAllowed, true);
  assert.match(result.findings.join("\n"), /public_write_route_allowed_must_remain_false:true/);
}

function testSyntheticUnsafeApprovalPacketValuesAreRedacted() {
  const evidence = validEvidence({
    approvalPacket: [
      "packet_state=https://private.example.internal",
      "approval_state=private-approved-state",
      "public_write_route_allowed=private-route-open",
      "operator_approval_ref=ghp_abcdefghijklmnopqrstuvwxyz123456",
      ...requiredLiveEvidenceApprovalKeys.filter((key) => key !== "operator_approval_ref").map((key) => `${key}=missing`),
    ].join("\n"),
  });
  const result = validateGovernApprovalReadinessPreflightEvidence(evidence);
  const report = formatGovernApprovalReadinessPreflightReport(result);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.match(result.findings.join("\n"), /approval_input_must_remain_missing:operator_approval_ref:redacted_value/);
  assert.match(result.findings.join("\n"), /approval_packet_state_must_remain_awaiting:redacted_value/);
  assert.match(result.findings.join("\n"), /approval_state_must_remain_not_approved:redacted_value/);
  assert.match(result.findings.join("\n"), /public_write_route_allowed_must_remain_false:redacted_value/);
  assert.doesNotMatch(report, /ghp_/);
  assert.doesNotMatch(report, /private-approved-state/);
  assert.doesNotMatch(report, /private-route-open/);
  assert.doesNotMatch(report, /private\.example\.internal/);
}

function testSyntheticSecretPatternFailsClosed() {
  const evidence = validEvidence({
    privateValueScanSources: {
      approvalPacket: "Bearer abcdefghijklmnopqrstuvwxyz123456",
      witness: "approval_readiness_preflight_state=Ready",
    },
  });
  const result = validateGovernApprovalReadinessPreflightEvidence(evidence);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.match(result.findings.join("\n"), /forbidden_private_value_pattern:approvalPacket:bearer_token/);
}

function testCliJsonAndUnsupportedArgs() {
  const jsonResult = runValidator(["--json"]);
  const payload = JSON.parse(jsonResult.stdout);
  assert.equal(jsonResult.status, 0);
  assert.equal(payload.solverOutcome, "SolvedVerified");
  assert.equal(payload.proofState, "Pass");
  assert.equal(payload.approvalReadinessPreflightState, "Ready");

  const invalid = runValidator(["--unknown"]);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stdout, /unsupported_args_count:1/);
  assert.doesNotMatch(invalid.stdout, /--unknown/);
  assert.match(invalid.stdout, /govern_approval_readiness_preflight=GovernanceBlocked/);
}

function testPathBoundaryFailsClosedWithoutEcho() {
  const outsidePath = path.join("..", "private-approval-readiness.md");
  const outside = validateGovernApprovalReadinessPreflight(outsidePath);

  assert.equal(outside.solverOutcome, "GovernanceBlocked");
  assert.equal(outside.proofState, "Fail");
  assert.equal(outside.approvalReadinessPreflightState, "Blocked");
  assert.deepEqual(outside.findings, ["approval_readiness_preflight_path_outside_repo"]);
  assert.doesNotMatch(formatGovernApprovalReadinessPreflightReport(outside), /private-approval-readiness/);

  const unreadable = validateGovernApprovalReadinessPreflight(path.join("ops", "missing-private-approval-readiness.md"));
  assert.equal(unreadable.solverOutcome, "GovernanceBlocked");
  assert.equal(unreadable.proofState, "Fail");
  assert.deepEqual(unreadable.findings, ["approval_readiness_preflight_unreadable"]);
  assert.doesNotMatch(formatGovernApprovalReadinessPreflightReport(unreadable), /missing-private-approval-readiness/);
}

testCurrentApprovalReadinessPreflightPasses();
testSyntheticOperatorApprovalRefFailsClosed();
testSyntheticMissingWitnessTermUsesPublicLabel();
testSyntheticAggregateFailureFailsClosed();
testSyntheticRouteRuntimeAggregateFailureFailsClosed();
testSyntheticWriteRouteOpenFailsClosed();
testSyntheticUnsafeApprovalPacketValuesAreRedacted();
testSyntheticSecretPatternFailsClosed();
testCliJsonAndUnsupportedArgs();
testPathBoundaryFailsClosedWithoutEcho();

console.log("govern approval-readiness preflight validator tests passed");
