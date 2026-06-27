/*
Purpose: test the Mullu Govern public-beta approval packet validator.
Governance scope: fail-closed public write-route approval state, missing evidence refs, unsupported args, and no-secret pattern rejection.
Dependencies: Node.js standard library and scripts/validate-govern-public-beta-approval-packet.mjs.
Invariants: tests use synthetic packet content only and never inspect provider dashboards or private values.
*/

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatApprovalPacketReport,
  validateApprovalPacketContent,
  validateGovernPublicBetaApprovalPacket,
} from "./validate-govern-public-beta-approval-packet.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptsDir, "..");
const validatorScript = path.join(scriptsDir, "validate-govern-public-beta-approval-packet.mjs");

function runValidator(args = []) {
  return spawnSync(process.execPath, [validatorScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function validPacketContent() {
  return `
packet_state=AwaitingEvidence
approval_state=NotApproved
public_write_route_allowed=false
current_decision=KeepBlocked
live_evidence_operator_request_command=node scripts/emit-govern-live-evidence-operator-request.mjs
last_reviewed=2026-06-27
route_publication_action=none
dns_mutation=none
runtime_mutation=none
secret_rotation_required=false
operator_approval_ref=missing
product_status_promotion_ref=missing
api_contract_test_ref=missing
privacy_activation_ref=missing
retention_activation_ref=missing
dashboard_operator_readiness_ref=missing
runtime_witness_ref=missing
rollback_witness_ref=control-plane:pull/1686:scripts/validate_govern_evaluate_route_rollback.py
support_readiness_ref=site:ops/mullu-govern-support-readiness.md
public_claim_update_ref=missing
POST /v1/govern/evaluate
STATUS:
`;
}

function testCurrentPacketPassesAsNonOperative() {
  const result = validateGovernPublicBetaApprovalPacket();
  const report = formatApprovalPacketReport(result);

  assert.equal(result.solverOutcome, "SolvedVerified");
  assert.equal(result.proofState, "Pass");
  assert.equal(result.packetState, "AwaitingEvidence");
  assert.equal(result.approvalState, "NotApproved");
  assert.equal(result.publicWriteRouteAllowed, false);
  assert.equal(result.missingApprovalInputs.length, 8);
  assert.deepEqual(result.closedApprovalInputs, ["rollback_witness_ref", "support_readiness_ref"]);
  assert.equal(result.findings.length, 0);
  assert.match(report, /missing_approval_input_count=8/);
  assert.match(report, /secret_values=not_recorded/);
}

function testOnlyRollbackEvidenceRefIsAllowed() {
  const packet = validPacketContent().replace(
    "operator_approval_ref=missing",
    "operator_approval_ref=approval://not-yet-allowed",
  );
  const result = validateApprovalPacketContent(packet);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.publicWriteRouteAllowed, false);
  assert.equal(result.missingApprovalInputs.length, 7);
  assert.match(result.findings.join("\n"), /approval_input_ref_not_allowed:operator_approval_ref/);
  assert.match(result.findings.join("\n"), /approval_inputs_must_remain_missing_except_allowed_refs:7\/10/);
}

function testAggregateDecisionAndRuntimeFailuresBlockApprovalPacket() {
  const result = validateApprovalPacketContent(validPacketContent(), {
    runtimeClosurePacket: {
      productClaimsAllowed: true,
      proofState: "Fail",
      runtimeWitnessClosureAllowed: true,
      solverOutcome: "GovernanceBlocked",
    },
    writeRouteDecision: {
      decisionState: "Approve",
      proofState: "Fail",
      publicWriteRouteAllowed: true,
      solverOutcome: "GovernanceBlocked",
    },
  });

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.publicWriteRouteAllowed, false);
  assert.match(result.findings.join("\n"), /write_route_decision_not_solved:GovernanceBlocked/);
  assert.match(result.findings.join("\n"), /write_route_decision_must_remain_keep_blocked:redacted_value/);
  assert.match(result.findings.join("\n"), /write_route_decision_public_route_not_blocked/);
  assert.match(result.findings.join("\n"), /runtime_closure_packet_not_solved:GovernanceBlocked/);
  assert.match(result.findings.join("\n"), /runtime_closure_packet_closure_not_blocked/);
  assert.match(result.findings.join("\n"), /runtime_closure_packet_product_claims_not_blocked/);
}

function testUnsafePacketAndAggregateValuesUsePublicLabels() {
  const packet = validPacketContent()
    .replace("packet_state=AwaitingEvidence", "packet_state=private-packet-state")
    .replace("approval_state=NotApproved", "approval_state=private-approval-state")
    .replace("route_publication_action=none", "route_publication_action=private-route-action")
    .replace("dns_mutation=none", "dns_mutation=private-dns-action")
    .replace("runtime_mutation=none", "runtime_mutation=private-runtime-action")
    .replace("secret_rotation_required=false", "secret_rotation_required=private-secret-action");
  const result = validateApprovalPacketContent(packet, {
    runtimeClosurePacket: {
      productClaimsAllowed: false,
      proofState: "private-runtime-proof",
      runtimeWitnessClosureAllowed: false,
      solverOutcome: "private-runtime-outcome",
    },
    writeRouteDecision: {
      decisionState: "private-decision-state",
      proofState: "private-write-proof",
      publicWriteRouteAllowed: false,
      solverOutcome: "private-write-outcome",
    },
  });
  const report = formatApprovalPacketReport(result);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.packetState, "redacted_value");
  assert.equal(result.approvalState, "redacted_value");
  assert.match(report, /packet_state_must_remain_awaiting_evidence:redacted_value/);
  assert.match(report, /write_route_decision_not_solved:redacted_value/);
  assert.match(report, /runtime_closure_packet_not_solved:redacted_value/);
  assert.doesNotMatch(report, /private-packet-state/);
  assert.doesNotMatch(report, /private-approval-state/);
  assert.doesNotMatch(report, /private-route-action/);
  assert.doesNotMatch(report, /private-write-outcome/);
  assert.doesNotMatch(report, /private-runtime-outcome/);
}

function testSecretShapedAllowedRefFailsClosed() {
  const packet = `
packet_state=AwaitingEvidence
approval_state=NotApproved
public_write_route_allowed=false
current_decision=KeepBlocked
route_publication_action=none
dns_mutation=none
runtime_mutation=none
secret_rotation_required=false
operator_approval_ref=missing
product_status_promotion_ref=missing
privacy_activation_ref=missing
retention_activation_ref=missing
dashboard_operator_readiness_ref=missing
api_contract_test_ref=missing
public_claim_update_ref=missing
runtime_witness_ref=missing
rollback_witness_ref=control-plane:pull/1686:ghp_abcdefghijklmnopqrstuvwxyz123456
support_readiness_ref=site:ops/mullu-govern-support-readiness.md
POST /v1/govern/evaluate
STATUS:
`;
  const result = validateApprovalPacketContent(packet);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.missingApprovalInputs.length, 8);
  assert.match(result.findings.join("\n"), /approval_input_ref_not_allowed:rollback_witness_ref/);
  assert.match(result.findings.join("\n"), /approval_input_ref_invalid:rollback_witness_ref:forbidden_private_value_pattern:evidence_ref:api_key_shape/);
}

function testMalformedAllowedRefFailsClosed() {
  const packet = validPacketContent().replace(
    "support_readiness_ref=site:ops/mullu-govern-support-readiness.md",
    "support_readiness_ref=ops/mullu-govern-support-readiness.md",
  );
  const result = validateApprovalPacketContent(packet);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.match(result.findings.join("\n"), /approval_input_ref_not_allowed:support_readiness_ref/);
  assert.match(result.findings.join("\n"), /approval_input_ref_invalid:support_readiness_ref:evidence_ref_family_not_allowed/);
}

function testCliJsonAndUnsupportedArgs() {
  const jsonResult = runValidator(["--json"]);
  const payload = JSON.parse(jsonResult.stdout);
  assert.equal(jsonResult.status, 0);
  assert.equal(payload.solverOutcome, "SolvedVerified");
  assert.equal(payload.proofState, "Pass");

  const invalid = runValidator(["--unknown"]);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stdout, /unsupported_args_count:1/);
  assert.doesNotMatch(invalid.stdout, /--unknown/);
  assert.match(invalid.stdout, /govern_public_beta_approval_packet=GovernanceBlocked/);
}

function testPathBoundaryFailsClosedWithoutEcho() {
  const outsidePath = path.join("..", "private-approval-packet.md");
  const outside = validateGovernPublicBetaApprovalPacket(outsidePath);

  assert.equal(outside.solverOutcome, "GovernanceBlocked");
  assert.equal(outside.proofState, "Fail");
  assert.equal(outside.packetState, "Unknown");
  assert.deepEqual(outside.findings, ["approval_packet_path_outside_repo"]);
  assert.doesNotMatch(formatApprovalPacketReport(outside), /private-approval-packet/);

  const unreadable = validateGovernPublicBetaApprovalPacket(path.join("ops", "missing-private-approval-packet.md"));
  assert.equal(unreadable.solverOutcome, "GovernanceBlocked");
  assert.equal(unreadable.proofState, "Fail");
  assert.deepEqual(unreadable.findings, ["approval_packet_unreadable"]);
  assert.doesNotMatch(formatApprovalPacketReport(unreadable), /missing-private-approval-packet/);
}

testCurrentPacketPassesAsNonOperative();
testOnlyRollbackEvidenceRefIsAllowed();
testAggregateDecisionAndRuntimeFailuresBlockApprovalPacket();
testUnsafePacketAndAggregateValuesUsePublicLabels();
testSecretShapedAllowedRefFailsClosed();
testMalformedAllowedRefFailsClosed();
testCliJsonAndUnsupportedArgs();
testPathBoundaryFailsClosedWithoutEcho();

console.log("govern public-beta approval packet validator tests passed");
