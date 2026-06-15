/*
Purpose: test the Mullu Govern live evidence ref collection checklist validator.
Governance scope: checklist completeness, required approval rows, stop conditions, no-secret scanning, unsupported args, and non-operative readiness state.
Dependencies: Node.js standard library and scripts/validate-govern-live-evidence-ref-collection-checklist.mjs.
Invariants: tests use public-safe synthetic text only; they never inspect provider dashboards, secret stores, or private values.
*/

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requiredLiveEvidenceApprovalKeys } from "./govern-live-evidence-ref-contract.mjs";
import {
  formatGovernLiveEvidenceRefCollectionChecklistReport,
  validateGovernLiveEvidenceRefCollectionChecklist,
  validateGovernLiveEvidenceRefCollectionChecklistContent,
} from "./validate-govern-live-evidence-ref-collection-checklist.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptsDir, "..");
const validatorScript = path.join(scriptsDir, "validate-govern-live-evidence-ref-collection-checklist.mjs");

function runValidator(args = []) {
  return spawnSync(process.execPath, [validatorScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function validChecklist() {
  return [
    "collection_checklist_state=Ready",
    "solver_outcome=SolvedVerified",
    "proof_state=Pass",
    "ready_for_live_evidence=false",
    "public_write_route_allowed=false",
    "intake_template=ops/mullu-govern-live-evidence-ref-intake-template.json",
    "intake_validator=node scripts/validate-govern-live-evidence-ref-intake.mjs --require-complete",
    "secret_values_allowed=false",
    "raw_payloads_allowed=false",
    "provider_values_allowed=false",
    "| Approval ref | Accepted shape | Evidence source | Must not include | Current state |",
    ...requiredLiveEvidenceApprovalKeys.map((key) => `| \`${key}\` | \`github:pull/101:bounded-ref\` | reviewed public-safe evidence | secret, token, raw payload, authorization headers, account ids, provider host values, database URLs | \`missing\` |`),
    "private_value_must_not_enter_public_ref",
    "raw_payload_must_not_enter_public_ref",
    "ref_grammar_invalid",
    "approval_packet_not_ready",
    "STATUS:",
  ].join("\n");
}

function testCurrentChecklistPasses() {
  const result = validateGovernLiveEvidenceRefCollectionChecklist();
  const report = formatGovernLiveEvidenceRefCollectionChecklistReport(result);

  assert.equal(result.solverOutcome, "SolvedVerified");
  assert.equal(result.proofState, "Pass");
  assert.equal(result.checklistState, "Ready");
  assert.equal(result.readyForLiveEvidence, false);
  assert.equal(result.findings.length, 0);
  assert.match(report, /govern_live_evidence_ref_collection_checklist=SolvedVerified/);
  assert.match(report, /secret_values=not_recorded/);
}

function testSyntheticMissingApprovalRowFailsClosed() {
  const checklist = validChecklist().replace("| `runtime_witness_ref` | `github:pull/101:bounded-ref` | reviewed public-safe evidence | secret, token, raw payload, authorization headers, account ids, provider host values, database URLs | `missing` |", "");
  const result = validateGovernLiveEvidenceRefCollectionChecklistContent(checklist);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.checklistState, "Blocked");
  assert.match(result.findings.join("\n"), /required_approval_key_missing_from_table:runtime_witness_ref/);
}

function testSyntheticMissingStopConditionFailsClosed() {
  const checklist = validChecklist().replace("approval_packet_not_ready", "");
  const result = validateGovernLiveEvidenceRefCollectionChecklistContent(checklist);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.match(result.findings.join("\n"), /required_stop_condition_missing:approval_packet_not_ready/);
}

function testSyntheticSecretPatternFailsClosed() {
  const checklist = `${validChecklist()}\nAuthorization: Bearer abcdefghijklmnopqrstuvwxyz123456`;
  const result = validateGovernLiveEvidenceRefCollectionChecklistContent(checklist);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.match(result.findings.join("\n"), /forbidden_private_value_pattern:collectionChecklist:bearer_token/);
  assert.match(result.findings.join("\n"), /forbidden_private_value_pattern:collectionChecklist:raw_header_authorization/);
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
  assert.match(invalid.stdout, /govern_live_evidence_ref_collection_checklist=GovernanceBlocked/);
}

function testPathBoundaryFailsClosedWithoutEcho() {
  const outsidePath = path.join("..", "private-checklist.md");
  const result = validateGovernLiveEvidenceRefCollectionChecklist(outsidePath);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.checklistState, "Blocked");
  assert.deepEqual(result.findings, ["collection_checklist_path_outside_repo"]);
  assert.doesNotMatch(formatGovernLiveEvidenceRefCollectionChecklistReport(result), /private-checklist/);

  const unreadable = validateGovernLiveEvidenceRefCollectionChecklist(path.join("ops", "missing-private-checklist.md"));
  assert.equal(unreadable.solverOutcome, "GovernanceBlocked");
  assert.equal(unreadable.proofState, "Fail");
  assert.deepEqual(unreadable.findings, ["collection_checklist_unreadable"]);
  assert.doesNotMatch(formatGovernLiveEvidenceRefCollectionChecklistReport(unreadable), /missing-private-checklist/);
}

testCurrentChecklistPasses();
testSyntheticMissingApprovalRowFailsClosed();
testSyntheticMissingStopConditionFailsClosed();
testSyntheticSecretPatternFailsClosed();
testCliJsonAndUnsupportedArgs();
testPathBoundaryFailsClosedWithoutEcho();

console.log("govern live evidence ref collection checklist validator tests passed");
