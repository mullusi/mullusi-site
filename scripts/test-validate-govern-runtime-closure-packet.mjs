/*
Purpose: test the Mullu Govern runtime closure packet validator.
Governance scope: runtime witness closure denial, product claim blocking, registry/manifest alignment, unsupported args, and no-secret pattern rejection.
Dependencies: Node.js standard library and scripts/validate-govern-runtime-closure-packet.mjs.
Invariants: tests use public-safe repository evidence or synthetic fixtures only; they never probe endpoints, provider dashboards, DNS APIs, private recovery files, or mailboxes.
*/

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatGovernRuntimeClosurePacketReport,
  validateGovernRuntimeClosurePacket,
  validateGovernRuntimeClosurePacketEvidence,
} from "./validate-govern-runtime-closure-packet.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptsDir, "..");
const validatorScript = path.join(scriptsDir, "validate-govern-runtime-closure-packet.mjs");

function runValidator(args = []) {
  return spawnSync(process.execPath, [validatorScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function validPacket(overrides = {}) {
  const values = {
    runtime_witness_closure_allowed: "false",
    product_claims_allowed: "false",
    runtime_witness_registry_state: "AwaitingEvidence",
    ...overrides,
  };

  return [
    "# Mullu Govern Runtime Witness Closure Packet",
    "product_id=mullu-govern",
    "packet_state=AwaitingEvidence",
    "candidate_state=SelectedNotPromoted",
    "api_gateway_exposure_state=SolvedVerified",
    "product_status=limited-preview",
    "product_registry_status=awaiting-evidence",
    `runtime_witness_registry_state=${values.runtime_witness_registry_state}`,
    `runtime_witness_closure_allowed=${values.runtime_witness_closure_allowed}`,
    `product_claims_allowed=${values.product_claims_allowed}`,
    "write_route_decision=ops/mullu-govern-evaluate-write-route-decision.md",
    "public_beta_approval_packet=ops/mullu-govern-public-beta-approval-packet.md",
    "POST /v1/govern/evaluate",
    "product write route intentionally not published",
    "Raw responses, signatures, provider host data, database URLs, headers, and secrets",
    "Product manifest status | public-beta or production before public exposure | preflight Ready; current limited-preview",
    "Runtime witness proofState | SolvedVerified | AwaitingEvidence",
    "Runtime state | public-witness-ready or production-ready | private-only",
    "Public exposure | allowed | blocked",
    "Operator approval readiness | approval packet organized without approval | preflight Ready; approval NotApproved",
    "Live evidence sequence | collection order explicit without live action | preflight Ready; live evidence collection blocked",
    "Public-beta approval packet | ReadyForApproval or stronger | AwaitingEvidence in `ops/mullu-govern-public-beta-approval-packet.md`",
    "blocker=product_status_promotion_approval_missing",
    "blocker=product_evaluate_write_route_approval_missing",
    "blocker=product_api_contract_live_execution_not_published",
    "blocker=product_privacy_boundary_not_verified",
    "blocker=product_retention_boundary_not_verified",
    "blocker=dashboard_operator_readiness_evidence_missing",
    "blocker=public_claim_update_evidence_missing",
    "blocker=runtime_witness_registry_not_closed",
    "STATUS:",
  ].join("\n");
}

function validRuntimeRegistry(overrides = {}) {
  return {
    witnesses: [
      {
        productId: "mullu-govern",
        proofState: "AwaitingEvidence",
        publicExposure: { allowed: false, state: "blocked" },
        rollback: { state: "Ready" },
        runtimeState: "private-only",
        ...overrides,
      },
    ],
  };
}

function passingWriteRouteDecision(overrides = {}) {
  return {
    proofState: "Pass",
    publicWriteRouteAllowed: false,
    solverOutcome: "SolvedVerified",
    ...overrides,
  };
}

function validEvidence(overrides = {}) {
  return {
    approvalPacket: "packet_state=AwaitingEvidence\napproval_state=NotApproved\npublic_write_route_allowed=false\n",
    liveEvidenceSequence: "ready_for_live_evidence=false\n",
    manifest: {
      presentation: { registryStatus: "awaiting-evidence" },
      status: "limited-preview",
    },
    packet: validPacket(),
    privateValueScanSources: {
      approvalPacket: "packet_state=AwaitingEvidence\napproval_state=NotApproved\npublic_write_route_allowed=false\n",
      liveEvidenceSequence: "ready_for_live_evidence=false\n",
      packet: validPacket(),
    },
    runtimeRegistry: validRuntimeRegistry(),
    writeRouteDecision: passingWriteRouteDecision(),
    ...overrides,
  };
}

function testCurrentGovernRuntimeClosurePacketPasses() {
  const result = validateGovernRuntimeClosurePacket();
  const report = formatGovernRuntimeClosurePacketReport(result);

  assert.equal(result.solverOutcome, "SolvedVerified");
  assert.equal(result.proofState, "Pass");
  assert.equal(result.runtimeWitnessClosureState, "Ready");
  assert.equal(result.runtimeWitnessClosureAllowed, false);
  assert.equal(result.productClaimsAllowed, false);
  assert.equal(result.publicWriteRouteAllowed, false);
  assert.equal(result.findings.length, 0);
  assert.match(report, /provider_values=not_recorded/);
  assert.match(report, /raw_payloads=not_recorded/);
}

function testSyntheticProductClaimAllowanceFailsClosed() {
  const evidence = validEvidence({
    packet: validPacket({ product_claims_allowed: "true" }),
  });
  const result = validateGovernRuntimeClosurePacketEvidence(evidence);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.productClaimsAllowed, true);
  assert.match(result.findings.join("\n"), /required_packet_term_missing:product_claims_allowed=false/);
  assert.match(result.findings.join("\n"), /product_claims_allowed_must_remain_false:true/);
}

function testSyntheticRuntimeRegistryPromotionFailsClosed() {
  const evidence = validEvidence({
    runtimeRegistry: validRuntimeRegistry({
      proofState: "SolvedVerified",
      publicExposure: { allowed: true, state: "public" },
      runtimeState: "production-ready",
    }),
  });
  const result = validateGovernRuntimeClosurePacketEvidence(evidence);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.runtimeWitnessClosureAllowed, false);
  assert.match(result.findings.join("\n"), /runtime_registry_proof_state_must_remain_awaiting:SolvedVerified/);
  assert.match(result.findings.join("\n"), /runtime_registry_runtime_state_must_remain_private_only:production-ready/);
  assert.match(result.findings.join("\n"), /runtime_registry_public_exposure_must_remain_blocked/);
}

function testSyntheticApprovalPacketRouteExposureFailsClosed() {
  const evidence = validEvidence({
    approvalPacket: "packet_state=ReadyForApproval\napproval_state=Approved\npublic_write_route_allowed=true\n",
  });
  const result = validateGovernRuntimeClosurePacketEvidence(evidence);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.publicWriteRouteAllowed, true);
  assert.match(result.findings.join("\n"), /approval_packet_state_must_remain_awaiting:ReadyForApproval/);
  assert.match(result.findings.join("\n"), /approval_state_must_remain_not_approved:Approved/);
  assert.match(result.findings.join("\n"), /public_write_route_allowed_must_remain_false:true/);
}

function testSyntheticWriteRouteAggregateFailureFailsClosed() {
  const evidence = validEvidence({
    writeRouteDecision: passingWriteRouteDecision({
      proofState: "Fail",
      publicWriteRouteAllowed: true,
      solverOutcome: "GovernanceBlocked",
    }),
  });
  const result = validateGovernRuntimeClosurePacketEvidence(evidence);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.runtimeWitnessClosureAllowed, false);
  assert.match(result.findings.join("\n"), /write_route_decision_not_solved:GovernanceBlocked/);
  assert.match(result.findings.join("\n"), /write_route_decision_proof_not_pass:Fail/);
  assert.match(result.findings.join("\n"), /write_route_decision_public_route_not_blocked/);
}

function testSyntheticSecretPatternFailsClosed() {
  const packet = `${validPacket()}\nBearer abcdefghijklmnopqrstuvwxyz123456`;
  const evidence = validEvidence({
    packet,
    privateValueScanSources: {
      approvalPacket: "packet_state=AwaitingEvidence\napproval_state=NotApproved\npublic_write_route_allowed=false\n",
      liveEvidenceSequence: "ready_for_live_evidence=false\n",
      packet,
    },
  });
  const result = validateGovernRuntimeClosurePacketEvidence(evidence);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.runtimeWitnessClosureAllowed, false);
  assert.match(result.findings.join("\n"), /forbidden_private_value_pattern:packet:bearer_token/);
}

function testCliJsonAndUnsupportedArgs() {
  const jsonResult = runValidator(["--json"]);
  const payload = JSON.parse(jsonResult.stdout);
  assert.equal(jsonResult.status, 0);
  assert.equal(payload.solverOutcome, "SolvedVerified");
  assert.equal(payload.runtimeWitnessClosureAllowed, false);
  assert.equal(payload.productClaimsAllowed, false);

  const invalid = runValidator(["--unknown"]);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stdout, /unsupported_args_count:1/);
  assert.doesNotMatch(invalid.stdout, /--unknown/);
  assert.match(invalid.stdout, /govern_runtime_closure_packet=GovernanceBlocked/);
}

function testPathBoundaryFailsClosedWithoutEcho() {
  const outsideResult = validateGovernRuntimeClosurePacket(path.join("..", "private-runtime-closure-packet.md"));
  const outsideReport = formatGovernRuntimeClosurePacketReport(outsideResult);

  assert.equal(outsideResult.solverOutcome, "GovernanceBlocked");
  assert.equal(outsideResult.proofState, "Fail");
  assert.equal(outsideResult.runtimeWitnessClosureState, "Blocked");
  assert.equal(outsideResult.publicWriteRouteAllowed, false);
  assert.deepEqual(outsideResult.findings, ["runtime_closure_packet_path_outside_repo"]);
  assert.doesNotMatch(outsideReport, /private-runtime-closure-packet/);

  const unreadableResult = validateGovernRuntimeClosurePacket(path.join("ops", "runtime-witness", "missing-private-runtime-closure-packet.md"));
  const unreadableReport = formatGovernRuntimeClosurePacketReport(unreadableResult);

  assert.equal(unreadableResult.solverOutcome, "GovernanceBlocked");
  assert.equal(unreadableResult.proofState, "Fail");
  assert.equal(unreadableResult.runtimeWitnessClosureState, "Blocked");
  assert.equal(unreadableResult.publicWriteRouteAllowed, false);
  assert.deepEqual(unreadableResult.findings, ["runtime_closure_packet_unreadable"]);
  assert.doesNotMatch(unreadableReport, /missing-private-runtime-closure-packet/);
}

testCurrentGovernRuntimeClosurePacketPasses();
testSyntheticProductClaimAllowanceFailsClosed();
testSyntheticRuntimeRegistryPromotionFailsClosed();
testSyntheticApprovalPacketRouteExposureFailsClosed();
testSyntheticWriteRouteAggregateFailureFailsClosed();
testSyntheticSecretPatternFailsClosed();
testCliJsonAndUnsupportedArgs();
testPathBoundaryFailsClosedWithoutEcho();

console.log("govern runtime closure packet validator tests passed");
