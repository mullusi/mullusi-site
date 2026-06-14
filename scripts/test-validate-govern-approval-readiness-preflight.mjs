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
  assert.match(result.findings.join("\n"), /approval_input_must_remain_missing:operator_approval_ref/);
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
  assert.match(invalid.stdout, /unsupported_args:--unknown/);
  assert.match(invalid.stdout, /govern_approval_readiness_preflight=GovernanceBlocked/);
}

testCurrentApprovalReadinessPreflightPasses();
testSyntheticOperatorApprovalRefFailsClosed();
testSyntheticAggregateFailureFailsClosed();
testSyntheticRouteRuntimeAggregateFailureFailsClosed();
testSyntheticWriteRouteOpenFailsClosed();
testSyntheticSecretPatternFailsClosed();
testCliJsonAndUnsupportedArgs();

console.log("govern approval-readiness preflight validator tests passed");
