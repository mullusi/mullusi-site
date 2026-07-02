/*
Purpose: test the Mullu Govern live evidence ref status reporter.
Governance scope: missing-ref diagnosis, local guard distinction, private-value redaction, and CLI fail-closed behavior.
Dependencies: Node.js standard library and scripts/report-govern-live-evidence-ref-status.mjs.
Invariants: tests use synthetic public-safe refs only and never inspect provider dashboards or private values.
*/

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requiredLiveEvidenceApprovalKeys } from "./govern-live-evidence-ref-contract.mjs";
import {
  analyzeGovernLiveEvidenceRefStatusContent,
  formatGovernLiveEvidenceRefStatusReport,
} from "./report-govern-live-evidence-ref-status.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptsDir, "..");
const reporterScript = path.join(scriptsDir, "report-govern-live-evidence-ref-status.mjs");

const completeRefs = Object.freeze({
  operator_approval_ref: "approval://mullu-govern/live-evidence/2026-06-27/operator-approved",
  product_status_promotion_ref: "github:pull/101:product-status-public-beta-approval",
  privacy_activation_ref: "github:pull/102:privacy-govern-policy-activation",
  retention_activation_ref: "github:pull/103:govern-retention-activation",
  dashboard_operator_readiness_ref: "receipt://dashboard/govern/operator-readiness/2026-06-27",
  api_contract_test_ref: "github:actions/runs/27500000000:govern-evaluate-contract-live",
  public_claim_update_ref: "github:pull/104:govern-public-claim-update",
  runtime_witness_ref: "github:pull/105:runtime-witness-govern-closure",
});

function intake(approvalRefs) {
  return JSON.stringify({
    approval_refs: approvalRefs,
    product_id: "mullu-govern",
    provider_values_allowed: false,
    public_write_route_allowed: false,
    raw_payloads_allowed: false,
    ready_for_live_evidence: false,
    secret_values_allowed: false,
  });
}

function guardContents(valueByKey = {}) {
  const lines = requiredLiveEvidenceApprovalKeys
    .map((key) => `${key}=${valueByKey[key] ?? "missing"}`)
    .join("\n");
  const approvalReadinessLines = [
    `live_evidence_operator_approval_ref=${valueByKey.operator_approval_ref ?? "missing"}`,
    ...requiredLiveEvidenceApprovalKeys.map((key) => `${key}=${valueByKey[key] ?? "missing"}`),
  ].join("\n");
  const publicClaimLines = [
    `bounded_public_claim_update_ref=${valueByKey.public_claim_update_ref ?? "missing"}`,
    ...requiredLiveEvidenceApprovalKeys.map((key) => `${key}=${valueByKey[key] ?? "missing"}`),
  ].join("\n");
  return {
    "ops/mullu-govern-approval-readiness-preflight.md": approvalReadinessLines,
    "ops/mullu-govern-product-status-preflight.md": lines,
    "ops/mullu-govern-privacy-retention-preflight.md": lines,
    "ops/mullu-govern-dashboard-operator-readiness-preflight.md": lines,
    "ops/mullu-govern-evaluate-contract-preflight.md": lines,
    "ops/mullu-govern-public-claim-update-preflight.md": publicClaimLines,
    "ops/runtime-witness/mullu-govern-closure-packet.md": lines,
  };
}

function runReporter(args = []) {
  return spawnSync(process.execPath, [reporterScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function testMissingTemplateRefsReportAwaitingEvidence() {
  const refs = Object.fromEntries(requiredLiveEvidenceApprovalKeys.map((key) => [key, "missing"]));
  const result = analyzeGovernLiveEvidenceRefStatusContent(intake(refs), guardContents());
  const report = formatGovernLiveEvidenceRefStatusReport(result);

  assert.equal(result.solverOutcome, "AwaitingEvidence");
  assert.equal(result.proofState, "Unknown");
  assert.equal(result.missingRefCount, 8);
  assert.match(report, /ref=operator_approval_ref status=missing/);
  assert.match(report, /accepted_example=approval:\/\/mullu-govern\/live-evidence\/2026-06-30\/operator-approved/);
  assert.match(report, /accepted_example=github:actions\/runs\/123:govern-evaluate-contract-live/);
}

function testCompleteRefsStillRequireLocalActivationGuards() {
  const result = analyzeGovernLiveEvidenceRefStatusContent(intake(completeRefs), guardContents());

  assert.equal(result.solverOutcome, "AwaitingEvidence");
  assert.equal(result.proofState, "Unknown");
  assert.equal(result.missingRefCount, 0);
  assert.equal(result.localGuardMissingCount, 8);
}

function testCompleteRefsWithLocalGuardsPass() {
  const result = analyzeGovernLiveEvidenceRefStatusContent(intake(completeRefs), guardContents(completeRefs));

  assert.equal(result.solverOutcome, "SolvedVerified");
  assert.equal(result.proofState, "Pass");
  assert.equal(result.invalidRefCount, 0);
  assert.equal(result.localGuardMissingCount, 0);
  assert.equal(result.refs[0].acceptedExample, "approval://mullu-govern/live-evidence/2026-06-30/operator-approved");
}

function testPrivatePatternIsRedacted() {
  const refs = {
    ...completeRefs,
    operator_approval_ref: "approval://ghp_abcdefghijklmnopqrstuvwxyz123456",
  };
  const result = analyzeGovernLiveEvidenceRefStatusContent(intake(refs), guardContents(completeRefs));
  const report = formatGovernLiveEvidenceRefStatusReport(result);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.match(report, /current=redacted/);
  assert.doesNotMatch(report, /ghp_abcdefghijklmnopqrstuvwxyz123456/);
}

function testInvalidNonSecretRefTextIsRedacted() {
  const refs = {
    ...completeRefs,
    public_claim_update_ref: "ops/private.local.json",
  };
  const guards = {
    ...completeRefs,
    public_claim_update_ref: "local/private-approval-note",
  };
  const result = analyzeGovernLiveEvidenceRefStatusContent(intake(refs), guardContents(guards));
  const report = formatGovernLiveEvidenceRefStatusReport(result);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.match(report, /ref=public_claim_update_ref status=invalid current=redacted local_guard=redacted/);
  assert.doesNotMatch(report, /ops\/private\.local\.json/);
  assert.doesNotMatch(report, /local\/private-approval-note/);
}

function testCliCurrentTemplateAndUnsupportedArgs() {
  const current = runReporter([]);
  assert.equal(current.status, 0);
  assert.match(current.stdout, /govern_live_evidence_ref_status=AwaitingEvidence/);
  assert.match(current.stdout, /missing_ref_count=8/);

  const invalid = runReporter(["--unknown"]);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stdout, /unsupported_args_count:1/);
  assert.doesNotMatch(invalid.stdout, /--unknown/);
}

testMissingTemplateRefsReportAwaitingEvidence();
testCompleteRefsStillRequireLocalActivationGuards();
testCompleteRefsWithLocalGuardsPass();
testPrivatePatternIsRedacted();
testInvalidNonSecretRefTextIsRedacted();
testCliCurrentTemplateAndUnsupportedArgs();

console.log("govern live evidence ref status reporter tests passed");
