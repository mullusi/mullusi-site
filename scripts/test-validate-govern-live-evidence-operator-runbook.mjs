/*
Purpose: test the Mullu Govern live evidence operator runbook validator.
Governance scope: public-safe ref contract, required live approval refs, fail-closed route state, unsupported args, and no-secret pattern rejection.
Dependencies: Node.js standard library and scripts/validate-govern-live-evidence-operator-runbook.mjs.
Invariants: tests use public-safe repository evidence or synthetic fixtures only; they never inspect provider dashboards or private values.
*/

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  publicSafeEvidenceRefFamilies,
  requiredLiveEvidenceApprovalKeys,
} from "./govern-live-evidence-ref-contract.mjs";
import {
  formatGovernLiveEvidenceOperatorRunbookReport,
  validateGovernLiveEvidenceOperatorRunbook,
  validateGovernLiveEvidenceOperatorRunbookEvidence,
} from "./validate-govern-live-evidence-operator-runbook.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptsDir, "..");
const validatorScript = path.join(scriptsDir, "validate-govern-live-evidence-operator-runbook.mjs");

function runValidator(args = []) {
  return spawnSync(process.execPath, [validatorScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function validRunbook() {
  return [
    "operator_runbook_state=Ready",
    "solver_outcome=SolvedVerified",
    "proof_state=Pass",
    "ready_for_live_evidence=false",
    "public_write_route_allowed=false",
    "approval_packet=ops/mullu-govern-public-beta-approval-packet.md",
    "live_evidence_ref_intake=ops/mullu-govern-live-evidence-ref-intake-template.json",
    "live_evidence_ref_intake_command=node scripts/validate-govern-live-evidence-ref-intake.mjs",
    "sequence_preflight=ops/mullu-govern-live-evidence-sequence-preflight.md",
    "runtime_witness_packet=ops/runtime-witness/mullu-govern-closure-packet.md",
    "safe_local_command=node scripts/validate-govern-live-evidence-sequence-preflight.mjs",
    "secret_values_allowed=false",
    "raw_request_bodies_allowed=false",
    "raw_response_bodies_allowed=false",
    "provider_values_allowed=false",
    ...publicSafeEvidenceRefFamilies,
    ...requiredLiveEvidenceApprovalKeys.map((key) => `| \`${key}\` | proves something | shape | \`missing\` |`),
    "STATUS:",
  ].join("\n");
}

function validEvidence(overrides = {}) {
  return {
    approvalPacket: [
      "approval_state=NotApproved",
      "public_write_route_allowed=false",
      ...requiredLiveEvidenceApprovalKeys.map((key) => `${key}=missing`),
    ].join("\n"),
    privateValueScanSources: {
      approvalPacket: "public_write_route_allowed=false\noperator_approval_ref=missing\n",
      runbook: validRunbook(),
    },
    runbook: validRunbook(),
    sequencePreflightResult: {
      proofState: "Pass",
      readyForLiveEvidence: false,
      solverOutcome: "SolvedVerified",
    },
    ...overrides,
  };
}

function testCurrentRunbookPasses() {
  const result = validateGovernLiveEvidenceOperatorRunbook();
  const report = formatGovernLiveEvidenceOperatorRunbookReport(result);

  assert.equal(result.solverOutcome, "SolvedVerified");
  assert.equal(result.proofState, "Pass");
  assert.equal(result.operatorRunbookState, "Ready");
  assert.equal(result.readyForLiveEvidence, false);
  assert.equal(result.publicWriteRouteAllowed, false);
  assert.equal(result.missingApprovalInputCount, 8);
  assert.equal(result.findings.length, 0);
  assert.match(report, /govern_live_evidence_operator_runbook=SolvedVerified/);
  assert.match(report, /raw_payloads=not_recorded/);
}

function testSyntheticMissingApprovalKeyFailsClosed() {
  const evidence = validEvidence({
    runbook: validRunbook().replace("| `runtime_witness_ref` | proves something | shape | `missing` |", ""),
  });
  evidence.privateValueScanSources.runbook = evidence.runbook;
  const result = validateGovernLiveEvidenceOperatorRunbookEvidence(evidence);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.match(result.findings.join("\n"), /required_approval_key_missing_from_table:runtime_witness_ref/);
}

function testSyntheticApprovalPacketFilledRefFailsClosed() {
  const evidence = validEvidence({
    approvalPacket: [
      "approval_state=NotApproved",
      "public_write_route_allowed=false",
      "operator_approval_ref=approval://mullu-govern/live-evidence/2026-06-14/operator-approved",
      ...requiredLiveEvidenceApprovalKeys.filter((key) => key !== "operator_approval_ref").map((key) => `${key}=missing`),
    ].join("\n"),
  });
  const result = validateGovernLiveEvidenceOperatorRunbookEvidence(evidence);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.missingApprovalInputCount, 7);
  assert.match(result.findings.join("\n"), /approval_packet_ref_must_remain_missing:operator_approval_ref/);
}

function testSyntheticSequencePreflightFailureFailsClosed() {
  const evidence = validEvidence({
    sequencePreflightResult: {
      proofState: "Fail",
      readyForLiveEvidence: true,
      solverOutcome: "GovernanceBlocked",
    },
  });
  const result = validateGovernLiveEvidenceOperatorRunbookEvidence(evidence);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.match(result.findings.join("\n"), /sequence_preflight_not_solved:GovernanceBlocked/);
  assert.match(result.findings.join("\n"), /sequence_preflight_ready_for_live_evidence_must_remain_false/);
}

function testSyntheticSecretPatternFailsClosed() {
  const evidence = validEvidence({
    privateValueScanSources: {
      approvalPacket: "Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456",
      runbook: validRunbook(),
    },
  });
  const result = validateGovernLiveEvidenceOperatorRunbookEvidence(evidence);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.match(result.findings.join("\n"), /forbidden_private_value_pattern:approvalPacket:bearer_token/);
  assert.match(result.findings.join("\n"), /forbidden_private_value_pattern:approvalPacket:raw_header_authorization/);
}

function testCliJsonAndUnsupportedArgs() {
  const jsonResult = runValidator(["--json"]);
  const payload = JSON.parse(jsonResult.stdout);
  assert.equal(jsonResult.status, 0);
  assert.equal(payload.solverOutcome, "SolvedVerified");
  assert.equal(payload.proofState, "Pass");
  assert.equal(payload.operatorRunbookState, "Ready");

  const invalid = runValidator(["--unknown"]);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stdout, /unsupported_args:--unknown/);
  assert.match(invalid.stdout, /govern_live_evidence_operator_runbook=GovernanceBlocked/);
}

testCurrentRunbookPasses();
testSyntheticMissingApprovalKeyFailsClosed();
testSyntheticApprovalPacketFilledRefFailsClosed();
testSyntheticSequencePreflightFailureFailsClosed();
testSyntheticSecretPatternFailsClosed();
testCliJsonAndUnsupportedArgs();

console.log("govern live evidence operator runbook validator tests passed");
