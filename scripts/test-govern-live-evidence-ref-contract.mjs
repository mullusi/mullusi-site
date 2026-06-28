/*
Purpose: test the shared public-safe evidence ref contract for Mullu Govern live evidence gates.
Governance scope: required approval keys, allowed ref families, missing-ref handling, secret/raw-payload rejection, and deterministic ref validation.
Dependencies: Node.js standard library and scripts/govern-live-evidence-ref-contract.mjs.
Invariants: tests use synthetic public-safe strings only and never inspect provider dashboards or private values.
*/

import assert from "node:assert/strict";
import {
  publicSafeEvidenceRefFamilies,
  requiredLiveEvidenceApprovalKeys,
  scanForbiddenEvidencePatterns,
  validatePublicSafeEvidenceRef,
} from "./govern-live-evidence-ref-contract.mjs";

const validRefByFamily = Object.freeze({
  "approval://": "approval://mullu-govern/live-evidence/2026-06-14/operator-approved",
  "receipt://": "receipt://dashboard/govern/operator-readiness/2026-06-14",
  "github:pull/": "github:pull/101:product-status-public-beta-approval",
  "github:actions/runs/": "github:actions/runs/27500000000:govern-evaluate-contract-live",
  "site:ops/": "site:ops/mullu-govern-live-evidence-sequence-preflight.md",
  "control-plane:pull/": "control-plane:pull/1686:scripts/validate_govern_evaluate_route_rollback.py",
  "control-plane:receipt/": "control-plane:receipt/runtime/govern/2026-06-14",
  "render:event/": "render:event/srv-d8id2tj7-deploy-2026-06-14",
  "cloudflare:audit/": "cloudflare:audit/mullusi-com-2026-06-14",
  "google-workspace:audit/": "google-workspace:audit/gmail-auth-2026-06-14",
});

function testRequiredKeysRemainStable() {
  assert.equal(requiredLiveEvidenceApprovalKeys.length, 8);
  assert.equal(requiredLiveEvidenceApprovalKeys.includes("operator_approval_ref"), true);
  assert.equal(requiredLiveEvidenceApprovalKeys.includes("runtime_witness_ref"), true);
  assert.equal(new Set(requiredLiveEvidenceApprovalKeys).size, requiredLiveEvidenceApprovalKeys.length);
}

function testAllowedFamiliesValidate() {
  assert.equal(publicSafeEvidenceRefFamilies.length, 10);
  for (const family of publicSafeEvidenceRefFamilies) {
    const result = validatePublicSafeEvidenceRef(validRefByFamily[family]);
    assert.equal(result.valid, true);
    assert.equal(result.isMissing, false);
    assert.deepEqual(result.findings, []);
  }
}

function testMissingRefHandlingIsExplicit() {
  const allowed = validatePublicSafeEvidenceRef("missing", { allowMissing: true });
  const denied = validatePublicSafeEvidenceRef("missing");

  assert.equal(allowed.valid, true);
  assert.equal(allowed.isMissing, true);
  assert.deepEqual(allowed.findings, []);
  assert.equal(denied.valid, false);
  assert.equal(denied.isMissing, true);
}

function testMalformedRefsFailClosed() {
  const empty = validatePublicSafeEvidenceRef("");
  const unknownFamily = validatePublicSafeEvidenceRef("https://example.com/evidence");
  const whitespace = validatePublicSafeEvidenceRef("github:pull/12 bad");
  const malformedGithubPull = validatePublicSafeEvidenceRef("github:pull/not-a-number");
  const malformedApproval = validatePublicSafeEvidenceRef("approval://operator/ready");

  assert.equal(empty.valid, false);
  assert.match(empty.findings.join("\n"), /evidence_ref_empty/);
  assert.equal(unknownFamily.valid, false);
  assert.match(unknownFamily.findings.join("\n"), /evidence_ref_family_not_allowed/);
  assert.doesNotMatch(unknownFamily.findings.join("\n"), /https:\/\/example\.com\/evidence/);
  assert.match(unknownFamily.findings.join("\n"), /evidence_ref_family_not_allowed:present/);
  assert.equal(whitespace.valid, false);
  assert.match(whitespace.findings.join("\n"), /evidence_ref_must_not_contain_whitespace/);
  assert.equal(malformedGithubPull.valid, false);
  assert.match(malformedGithubPull.findings.join("\n"), /evidence_ref_shape_invalid:github:pull\//);
  assert.equal(malformedApproval.valid, false);
  assert.match(malformedApproval.findings.join("\n"), /evidence_ref_shape_invalid:approval:\/\//);
}

function testPathTraversalSegmentsFailClosed() {
  const siteOpsTraversal = validatePublicSafeEvidenceRef("site:ops/public/../private-witness.md");
  const controlPlaneTraversal = validatePublicSafeEvidenceRef("control-plane:receipt/runtime/./private-receipt");

  assert.equal(siteOpsTraversal.valid, false);
  assert.match(siteOpsTraversal.findings.join("\n"), /evidence_ref_must_not_contain_path_traversal_segments/);
  assert.equal(controlPlaneTraversal.valid, false);
  assert.match(controlPlaneTraversal.findings.join("\n"), /evidence_ref_must_not_contain_path_traversal_segments/);
}

function testSecretAndRawPayloadPatternsFailClosed() {
  const bearerFindings = scanForbiddenEvidencePatterns("fixture", "Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456");
  const payloadFindings = scanForbiddenEvidencePatterns("fixture", "{\"prompt\":\"raw user payload\"}");
  const tokenRef = validatePublicSafeEvidenceRef("approval://ghp_abcdefghijklmnopqrstuvwxyz123456");

  assert.match(bearerFindings.join("\n"), /forbidden_private_value_pattern:fixture:bearer_token/);
  assert.match(bearerFindings.join("\n"), /forbidden_private_value_pattern:fixture:raw_header_authorization/);
  assert.match(payloadFindings.join("\n"), /forbidden_private_value_pattern:fixture:raw_json_payload/);
  assert.equal(tokenRef.valid, false);
  assert.match(tokenRef.findings.join("\n"), /forbidden_private_value_pattern:evidence_ref:api_key_shape/);
}

function testDeploymentIdentifierPatternsFailClosed() {
  const content = [
    "command=npx.cmd --yes wrangler@latest pages deployment list --project-name mullusi-company-site",
    "deployment_url=https://314efdaf.mullusi-company-site.pages.dev",
    "deployment_id=d029563d-95a9-4c84-b2ba-d8f149706373",
    "deployment_source=9a7f36a",
    "private_deploy_pr=mullusi-company-site#117",
    "private_deploy_merge_commit=c223fffe6e35993dc9e190d56b7ef57facf28c12",
  ].join("\n");
  const findings = scanForbiddenEvidencePatterns("fixture", content);

  assert.match(findings.join("\n"), /forbidden_private_value_pattern:fixture:private_deploy_source_repo/);
  assert.match(findings.join("\n"), /forbidden_private_value_pattern:fixture:cloudflare_pages_preview_url/);
  assert.match(findings.join("\n"), /forbidden_private_value_pattern:fixture:raw_deployment_id/);
  assert.match(findings.join("\n"), /forbidden_private_value_pattern:fixture:raw_deployment_source/);
  assert.match(findings.join("\n"), /forbidden_private_value_pattern:fixture:raw_private_deploy_ref/);
}

testRequiredKeysRemainStable();
testAllowedFamiliesValidate();
testMissingRefHandlingIsExplicit();
testMalformedRefsFailClosed();
testPathTraversalSegmentsFailClosed();
testSecretAndRawPayloadPatternsFailClosed();
testDeploymentIdentifierPatternsFailClosed();

console.log("govern live evidence ref contract tests passed");
