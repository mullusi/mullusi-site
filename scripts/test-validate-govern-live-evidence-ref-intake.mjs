/*
Purpose: test the Mullu Govern live evidence ref intake validator.
Governance scope: public-safe ref intake, required-key completeness, private-value rejection, complete-mode gating, and unsupported args.
Dependencies: Node.js standard library and scripts/validate-govern-live-evidence-ref-intake.mjs.
Invariants: tests use synthetic public-safe refs only and never inspect provider dashboards or private values.
*/

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requiredLiveEvidenceApprovalKeys } from "./govern-live-evidence-ref-contract.mjs";
import {
  formatGovernLiveEvidenceRefIntakeReport,
  validateGovernLiveEvidenceRefIntake,
  validateGovernLiveEvidenceRefIntakeContent,
} from "./validate-govern-live-evidence-ref-intake.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptsDir, "..");
const validatorScript = path.join(scriptsDir, "validate-govern-live-evidence-ref-intake.mjs");

function runValidator(args = []) {
  return spawnSync(process.execPath, [validatorScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function intake(overrides = {}) {
  const approvalRefs = Object.fromEntries(requiredLiveEvidenceApprovalKeys.map((key) => [key, "missing"]));
  return JSON.stringify({
    product_id: "mullu-govern",
    ready_for_live_evidence: false,
    public_write_route_allowed: false,
    secret_values_allowed: false,
    raw_payloads_allowed: false,
    provider_values_allowed: false,
    approval_refs: approvalRefs,
    ...overrides,
  });
}

function completeIntake() {
  const refs = {
    operator_approval_ref: "approval://mullu-govern/live-evidence/2026-06-14/operator-approved",
    product_status_promotion_ref: "github:pull/101:product-status-public-beta-approval",
    privacy_activation_ref: "github:pull/102:privacy-govern-policy-activation",
    retention_activation_ref: "github:pull/103:govern-retention-activation",
    dashboard_operator_readiness_ref: "receipt://dashboard/govern/operator-readiness/2026-06-14",
    api_contract_test_ref: "github:actions/runs/27500000000:govern-evaluate-contract-live",
    public_claim_update_ref: "github:pull/104:govern-public-claim-update",
    runtime_witness_ref: "github:pull/105:runtime-witness-govern-closure",
  };
  return intake({ approval_refs: refs });
}

function testCurrentTemplatePassesAsNonOperative() {
  const result = validateGovernLiveEvidenceRefIntake();
  const report = formatGovernLiveEvidenceRefIntakeReport(result);

  assert.equal(result.solverOutcome, "SolvedVerified");
  assert.equal(result.proofState, "Pass");
  assert.equal(result.readyForLiveEvidence, false);
  assert.equal(result.missingApprovalInputCount, 8);
  assert.match(report, /secret_values=not_read/);
}

function testCompleteModeRequiresRefs() {
  const result = validateGovernLiveEvidenceRefIntakeContent(intake(), { requireComplete: true });

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.readyForLiveEvidence, false);
  assert.match(result.findings.join("\n"), /approval_ref_required:operator_approval_ref/);
}

function testSyntheticCompleteRefsPassCompleteMode() {
  const result = validateGovernLiveEvidenceRefIntakeContent(completeIntake(), { requireComplete: true });

  assert.equal(result.solverOutcome, "SolvedVerified");
  assert.equal(result.proofState, "Pass");
  assert.equal(result.readyForLiveEvidence, false);
  assert.equal(result.missingApprovalInputCount, 0);
}

function testSecretAndUnknownKeyFailClosed() {
  const result = validateGovernLiveEvidenceRefIntakeContent(intake({
    approval_refs: {
      ...Object.fromEntries(requiredLiveEvidenceApprovalKeys.map((key) => [key, "missing"])),
      unknown_ref: "approval://extra",
      operator_approval_ref: "approval://ghp_abcdefghijklmnopqrstuvwxyz123456",
    },
  }));

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.match(result.findings.join("\n"), /approval_ref_unknown_key:present/);
  assert.doesNotMatch(result.findings.join("\n"), /unknown_ref/);
  assert.match(result.findings.join("\n"), /approval_ref_invalid:operator_approval_ref:forbidden_private_value_pattern/);
}

function testUnsafeRouteFlagFailsClosed() {
  const result = validateGovernLiveEvidenceRefIntakeContent(intake({ public_write_route_allowed: true }));

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.match(result.findings.join("\n"), /public_write_route_allowed_must_remain_false:boolean:true/);
}

function testReadyForLiveEvidenceFlagFailsClosed() {
  const result = validateGovernLiveEvidenceRefIntakeContent(intake({ ready_for_live_evidence: true }));

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.readyForLiveEvidence, false);
  assert.match(result.findings.join("\n"), /ready_for_live_evidence_must_remain_false:boolean:true/);
}

function testInvalidMetadataValuesAreRedacted() {
  const sensitiveProductId = "sk_sensitiveproductidabcdefghijklmnopqrstuvwxyz";
  const result = validateGovernLiveEvidenceRefIntakeContent(intake({
    product_id: sensitiveProductId,
    secret_values_allowed: "yes",
  }));

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.match(result.findings.join("\n"), /product_id_invalid:string/);
  assert.match(result.findings.join("\n"), /secret_values_allowed_must_remain_false:string/);
  assert.doesNotMatch(result.findings.join("\n"), /sk_sensitiveproductid/);
}

function testJsonParseFindingIsRedacted() {
  const content = "{\"product_id\":\"sk_parseabcdefghijklmnopqrstuvwxyz\"";
  const result = validateGovernLiveEvidenceRefIntakeContent(content);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.match(result.findings.join("\n"), /intake_json_invalid/);
  assert.doesNotMatch(result.findings.join("\n"), /sk_parse/);
}

function testCliJsonAndUnsupportedArgs() {
  const jsonResult = runValidator(["--json"]);
  const payload = JSON.parse(jsonResult.stdout);
  assert.equal(jsonResult.status, 0);
  assert.equal(payload.solverOutcome, "SolvedVerified");
  assert.equal(payload.missingApprovalInputCount, 8);

  const invalid = runValidator(["--unknown"]);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stdout, /unsupported_args_count:1/);
  assert.doesNotMatch(invalid.stdout, /--unknown/);
  assert.match(invalid.stdout, /govern_live_evidence_ref_intake=GovernanceBlocked/);
}

function testPathBoundaryFailsClosedWithoutEcho() {
  const outsidePath = path.join("..", "private-secret-intake.json");
  const outside = runValidator([`--path=${outsidePath}`]);
  assert.equal(outside.status, 1);
  assert.match(outside.stdout, /intake_file_path_outside_repo/);
  assert.doesNotMatch(outside.stdout, /private-secret-intake/);

  const unreadablePath = path.join("ops", "missing-secret-intake.json");
  const unreadable = runValidator([`--path=${unreadablePath}`]);
  assert.equal(unreadable.status, 1);
  assert.match(unreadable.stdout, /intake_file_unreadable/);
  assert.doesNotMatch(unreadable.stdout, /missing-secret-intake/);

  const directResult = validateGovernLiveEvidenceRefIntake(outsidePath);
  assert.equal(directResult.solverOutcome, "GovernanceBlocked");
  assert.equal(directResult.proofState, "Fail");
  assert.deepEqual(directResult.findings, ["intake_file_path_outside_repo"]);
}

testCurrentTemplatePassesAsNonOperative();
testCompleteModeRequiresRefs();
testSyntheticCompleteRefsPassCompleteMode();
testSecretAndUnknownKeyFailClosed();
testUnsafeRouteFlagFailsClosed();
testReadyForLiveEvidenceFlagFailsClosed();
testInvalidMetadataValuesAreRedacted();
testJsonParseFindingIsRedacted();
testCliJsonAndUnsupportedArgs();
testPathBoundaryFailsClosedWithoutEcho();

console.log("govern live evidence ref intake validator tests passed");
