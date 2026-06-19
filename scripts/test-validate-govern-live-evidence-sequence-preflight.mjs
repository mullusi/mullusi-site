/*
Purpose: test the Mullu Govern live evidence sequence preflight validator.
Governance scope: approval-bound sequencing, missing refs, runtime blockers, aggregate validator health, unsupported args, and no-secret pattern rejection.
Dependencies: Node.js standard library and scripts/validate-govern-live-evidence-sequence-preflight.mjs.
Invariants: tests use public-safe repository evidence or synthetic fixtures only; they never inspect provider dashboards or private values.
*/

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requiredLiveEvidenceApprovalKeys } from "./govern-live-evidence-ref-contract.mjs";
import {
  formatGovernLiveEvidenceSequencePreflightReport,
  validateGovernLiveEvidenceSequencePreflight,
  validateGovernLiveEvidenceSequencePreflightEvidence,
} from "./validate-govern-live-evidence-sequence-preflight.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptsDir, "..");
const validatorScript = path.join(scriptsDir, "validate-govern-live-evidence-sequence-preflight.mjs");

const expectedRuntimeBlockers = [
  "blocker=product_status_promotion_approval_missing",
  "blocker=product_evaluate_write_route_approval_missing",
  "blocker=product_api_contract_live_execution_not_published",
  "blocker=product_privacy_boundary_not_verified",
  "blocker=product_retention_boundary_not_verified",
  "blocker=dashboard_operator_readiness_evidence_missing",
  "blocker=public_claim_update_evidence_missing",
  "blocker=runtime_witness_registry_not_closed",
];

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
    "live_evidence_sequence_preflight_state=Ready",
    "solver_outcome=SolvedVerified",
    "proof_state=Pass",
    "packet_state=AwaitingEvidence",
    "approval_state=NotApproved",
    "ready_for_live_evidence=false",
    "public_write_route_allowed=false",
    "route_publication_action=none",
    "dns_mutation=none",
    "runtime_mutation=none",
    "dashboard_auth_mutation=none",
    "privacy_activation_allowed=false",
    "retention_activation_allowed=false",
    "product_status_promotion_allowed=false",
    "public_claim_update_allowed=false",
    "runtime_witness_update_allowed=false",
    "provider_values_recorded=false",
    "live_evidence_ref_intake=ops/mullu-govern-live-evidence-ref-intake-template.json",
    "live_evidence_ref_intake_command=node scripts/validate-govern-live-evidence-ref-intake.mjs",
    ...requiredLiveEvidenceApprovalKeys.map((key) => `${key}=missing`),
    "STATUS:",
  ].join("\n");

  return {
    approvalPacket: [
      "packet_state=AwaitingEvidence",
      "approval_state=NotApproved",
      "public_write_route_allowed=false",
      "route_publication_action=none",
      "dns_mutation=none",
      "runtime_mutation=none",
      ...requiredLiveEvidenceApprovalKeys.map((key) => `${key}=missing`),
    ].join("\n"),
    privateValueScanSources: {
      approvalPacket: "public_write_route_allowed=false\noperator_approval_ref=missing\n",
      runtimeClosurePacket: expectedRuntimeBlockers.join("\n"),
      witness,
    },
    runtimeClosurePacket: expectedRuntimeBlockers.join("\n"),
    validatorResults: {
      approvalPacket: passingResult({
        missingApprovalInputs: Array.from({ length: 8 }, (_, index) => `missing_${index}`),
        publicWriteRouteAllowed: false,
      }),
      approvalReadinessPreflight: passingResult(),
      contractPreflight: passingResult(),
      dashboardPreflight: passingResult(),
      liveEvidenceRefIntake: passingResult(),
      privacyRetentionPreflight: passingResult(),
      productStatusPreflight: passingResult(),
      publicClaimPreflight: passingResult(),
      runtimeClosurePacket: passingResult(),
      supportReadiness: passingResult(),
    },
    witness,
    ...overrides,
  };
}

function testCurrentSequencePreflightPasses() {
  const result = validateGovernLiveEvidenceSequencePreflight();
  const report = formatGovernLiveEvidenceSequencePreflightReport(result);

  assert.equal(result.solverOutcome, "SolvedVerified");
  assert.equal(result.proofState, "Pass");
  assert.equal(result.liveEvidenceSequencePreflightState, "Ready");
  assert.equal(result.readyForLiveEvidence, false);
  assert.equal(result.publicWriteRouteAllowed, false);
  assert.equal(result.missingApprovalInputCount, 8);
  assert.equal(result.findings.length, 0);
  assert.match(report, /govern_live_evidence_sequence_preflight=SolvedVerified/);
  assert.match(report, /provider_values=not_recorded/);
}

function testSyntheticApprovalRefFailsClosed() {
  const evidence = validEvidence({
    approvalPacket: [
      "packet_state=AwaitingEvidence",
      "approval_state=NotApproved",
      "public_write_route_allowed=false",
      "route_publication_action=none",
      "dns_mutation=none",
      "runtime_mutation=none",
      "api_contract_test_ref=approval://api-contract/ready",
      ...requiredLiveEvidenceApprovalKeys.filter((key) => key !== "api_contract_test_ref").map((key) => `${key}=missing`),
    ].join("\n"),
  });
  const result = validateGovernLiveEvidenceSequencePreflightEvidence(evidence);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.readyForLiveEvidence, false);
  assert.match(result.findings.join("\n"), /approval_input_must_remain_missing:api_contract_test_ref:redacted_value/);
  assert.doesNotMatch(formatGovernLiveEvidenceSequencePreflightReport(result), /api-contract\/ready/);
}

function testSyntheticWitnessRefFailsClosedWithoutEcho() {
  const evidence = validEvidence({
    witness: validEvidence().witness.replace("runtime_witness_ref=missing", "runtime_witness_ref=approval://runtime/private-ready"),
  });
  evidence.privateValueScanSources.witness = evidence.witness;
  const result = validateGovernLiveEvidenceSequencePreflightEvidence(evidence);
  const report = formatGovernLiveEvidenceSequencePreflightReport(result);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.match(result.findings.join("\n"), /witness_sequence_ref_must_remain_missing:runtime_witness_ref:redacted_value/);
  assert.doesNotMatch(report, /runtime\/private-ready/);
}

function testSyntheticMissingWitnessTermUsesPublicLabel() {
  const evidence = validEvidence({
    witness: validEvidence().witness.replace(
      "live_evidence_ref_intake_command=node scripts/validate-govern-live-evidence-ref-intake.mjs",
      "",
    ),
  });
  evidence.privateValueScanSources.witness = evidence.witness;
  const result = validateGovernLiveEvidenceSequencePreflightEvidence(evidence);
  const report = formatGovernLiveEvidenceSequencePreflightReport(result);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.match(result.findings.join("\n"), /required_witness_term_missing:live_evidence_ref_intake_command/);
  assert.doesNotMatch(report, /validate-govern-live-evidence-ref-intake/);
}

function testSyntheticRuntimeBlockerMissingFailsClosed() {
  const evidence = validEvidence({
    runtimeClosurePacket: expectedRuntimeBlockers
      .filter((blocker) => blocker !== "blocker=runtime_witness_registry_not_closed")
      .join("\n"),
  });
  const result = validateGovernLiveEvidenceSequencePreflightEvidence(evidence);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.match(result.findings.join("\n"), /runtime_blocker_missing:blocker=runtime_witness_registry_not_closed/);
}

function testSyntheticAggregateFailureFailsClosed() {
  const evidence = validEvidence({
    validatorResults: {
      ...validEvidence().validatorResults,
      dashboardPreflight: { proofState: "Fail", solverOutcome: "GovernanceBlocked" },
    },
  });
  const result = validateGovernLiveEvidenceSequencePreflightEvidence(evidence);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.match(result.findings.join("\n"), /aggregate_validator_not_solved:dashboardPreflight:GovernanceBlocked/);
  assert.match(result.findings.join("\n"), /aggregate_validator_proof_not_pass:dashboardPreflight:Fail/);
}

function testSyntheticWriteRouteOpenFailsClosed() {
  const evidence = validEvidence({
    approvalPacket: [
      "packet_state=AwaitingEvidence",
      "approval_state=NotApproved",
      "public_write_route_allowed=true",
      "route_publication_action=none",
      "dns_mutation=none",
      "runtime_mutation=none",
      ...requiredLiveEvidenceApprovalKeys.map((key) => `${key}=missing`),
    ].join("\n"),
  });
  const result = validateGovernLiveEvidenceSequencePreflightEvidence(evidence);

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
      "route_publication_action=publish-private-route",
      "dns_mutation=private-dns-change",
      "runtime_mutation=private-runtime-change",
      "operator_approval_ref=ghp_abcdefghijklmnopqrstuvwxyz123456",
      ...requiredLiveEvidenceApprovalKeys.filter((key) => key !== "operator_approval_ref").map((key) => `${key}=missing`),
    ].join("\n"),
  });
  const result = validateGovernLiveEvidenceSequencePreflightEvidence(evidence);
  const report = formatGovernLiveEvidenceSequencePreflightReport(result);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.match(result.findings.join("\n"), /approval_input_must_remain_missing:operator_approval_ref:redacted_value/);
  assert.match(result.findings.join("\n"), /approval_packet_state_must_remain_awaiting:redacted_value/);
  assert.match(result.findings.join("\n"), /approval_state_must_remain_not_approved:redacted_value/);
  assert.match(result.findings.join("\n"), /public_write_route_allowed_must_remain_false:redacted_value/);
  assert.match(result.findings.join("\n"), /route_publication_action_must_remain_none:redacted_value/);
  assert.match(result.findings.join("\n"), /dns_mutation_must_remain_none:redacted_value/);
  assert.match(result.findings.join("\n"), /runtime_mutation_must_remain_none:redacted_value/);
  assert.doesNotMatch(report, /ghp_/);
  assert.doesNotMatch(report, /private-approved-state/);
  assert.doesNotMatch(report, /private-route-open/);
  assert.doesNotMatch(report, /publish-private-route/);
  assert.doesNotMatch(report, /private-dns-change/);
  assert.doesNotMatch(report, /private-runtime-change/);
  assert.doesNotMatch(report, /private\.example\.internal/);
}

function testSyntheticSecretPatternFailsClosed() {
  const evidence = validEvidence({
    privateValueScanSources: {
      approvalPacket: "Bearer abcdefghijklmnopqrstuvwxyz123456",
      runtimeClosurePacket: expectedRuntimeBlockers.join("\n"),
      witness: "live_evidence_sequence_preflight_state=Ready",
    },
  });
  const result = validateGovernLiveEvidenceSequencePreflightEvidence(evidence);

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
  assert.equal(payload.liveEvidenceSequencePreflightState, "Ready");

  const invalid = runValidator(["--unknown"]);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stdout, /unsupported_args_count:1/);
  assert.doesNotMatch(invalid.stdout, /--unknown/);
  assert.match(invalid.stdout, /govern_live_evidence_sequence_preflight=GovernanceBlocked/);
}

function testPathBoundaryFailsClosedWithoutEcho() {
  const outsidePath = path.join("..", "private-sequence-preflight.md");
  const outside = validateGovernLiveEvidenceSequencePreflight(outsidePath);

  assert.equal(outside.solverOutcome, "GovernanceBlocked");
  assert.equal(outside.proofState, "Fail");
  assert.equal(outside.liveEvidenceSequencePreflightState, "Blocked");
  assert.deepEqual(outside.findings, ["live_evidence_sequence_preflight_path_outside_repo"]);
  assert.doesNotMatch(formatGovernLiveEvidenceSequencePreflightReport(outside), /private-sequence-preflight/);

  const unreadable = validateGovernLiveEvidenceSequencePreflight(path.join("ops", "missing-private-sequence-preflight.md"));
  assert.equal(unreadable.solverOutcome, "GovernanceBlocked");
  assert.equal(unreadable.proofState, "Fail");
  assert.deepEqual(unreadable.findings, ["live_evidence_sequence_preflight_unreadable"]);
  assert.doesNotMatch(formatGovernLiveEvidenceSequencePreflightReport(unreadable), /missing-private-sequence-preflight/);
}

testCurrentSequencePreflightPasses();
testSyntheticApprovalRefFailsClosed();
testSyntheticWitnessRefFailsClosedWithoutEcho();
testSyntheticMissingWitnessTermUsesPublicLabel();
testSyntheticRuntimeBlockerMissingFailsClosed();
testSyntheticAggregateFailureFailsClosed();
testSyntheticWriteRouteOpenFailsClosed();
testSyntheticUnsafeApprovalPacketValuesAreRedacted();
testSyntheticSecretPatternFailsClosed();
testCliJsonAndUnsupportedArgs();
testPathBoundaryFailsClosedWithoutEcho();

console.log("govern live evidence sequence preflight validator tests passed");
