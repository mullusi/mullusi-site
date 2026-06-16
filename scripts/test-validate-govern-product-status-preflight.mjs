/*
Purpose: test the Mullu Govern product-status preflight validator.
Governance scope: limited-preview preservation, promotion-path validation, fail-closed approval refs, unsupported args, and no-secret pattern rejection.
Dependencies: Node.js standard library and scripts/validate-govern-product-status-preflight.mjs.
Invariants: tests use public-safe repository evidence or synthetic fixtures only; they never inspect provider dashboards or private values.
*/

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatGovernProductStatusPreflightReport,
  validateGovernProductStatusPreflight,
  validateGovernProductStatusPreflightEvidence,
} from "./validate-govern-product-status-preflight.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptsDir, "..");
const validatorScript = path.join(scriptsDir, "validate-govern-product-status-preflight.mjs");

const promotionPath = [
  "private-incubation",
  "internal-alpha",
  "limited-preview",
  "public-beta",
  "production",
];

const releaseGates = [
  "route",
  "docs",
  "api_contract",
  "privacy",
  "runtime_witness",
  "rollback",
  "support",
  "status",
];

function runValidator(args = []) {
  return spawnSync(process.execPath, [validatorScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function solvedAggregateValidatorResults(overrides = {}) {
  return {
    approvalPacket: {
      missingApprovalInputs: Array.from({ length: 8 }, (_, index) => `missing_${index + 1}`),
      proofState: "Pass",
      publicWriteRouteAllowed: false,
      solverOutcome: "SolvedVerified",
    },
    runtimeClosurePacket: {
      productClaimsAllowed: false,
      proofState: "Pass",
      publicWriteRouteAllowed: false,
      runtimeWitnessClosureAllowed: false,
      solverOutcome: "SolvedVerified",
    },
    writeRouteDecision: {
      proofState: "Pass",
      publicWriteRouteAllowed: false,
      routePublicationAction: "none",
      solverOutcome: "SolvedVerified",
    },
    ...overrides,
  };
}

function validEvidence(overrides = {}) {
  const witness = [
    "product_status_preflight_state=Ready",
    "solver_outcome=SolvedVerified",
    "proof_state=Pass",
    "product_status_current=limited-preview",
    "product_status_target=public-beta",
    "product_status_promotion_allowed=false",
    "product_status_promotion_ref=missing",
    "public_write_route_allowed=false",
    "route_publication_action=none",
    "dns_mutation=none",
    "runtime_mutation=none",
    "secret_rotation_required=false",
    "public_beta_claim_allowed=false",
    "STATUS:",
  ].join("\n");
  return {
    approvalPacket: [
      "public_write_route_allowed=false",
      "product_status_current=limited-preview",
      "product_status_target=public-beta",
      "product_status_promotion_ref=missing",
    ].join("\n"),
    manifest: {
      id: "mullu-govern",
      status: "limited-preview",
      api: {
        exposure: "planned",
        routes: [{ method: "POST", path: "/v1/govern/evaluate" }],
      },
      releaseGate: {
        promotionPath: [...promotionPath],
        required: [...releaseGates],
      },
    },
    privateValueScanSources: {
      approvalPacket: "public_write_route_allowed=false\nproduct_status_promotion_ref=missing\n",
      manifest: JSON.stringify({ status: "limited-preview" }),
      witness,
    },
    validatorResults: solvedAggregateValidatorResults(),
    witness,
    ...overrides,
  };
}

function testCurrentProductStatusPreflightPasses() {
  const result = validateGovernProductStatusPreflight();
  const report = formatGovernProductStatusPreflightReport(result);

  assert.equal(result.solverOutcome, "SolvedVerified");
  assert.equal(result.proofState, "Pass");
  assert.equal(result.productStatusPreflightState, "Ready");
  assert.equal(result.manifestStatus, "limited-preview");
  assert.equal(result.publicWriteRouteAllowed, false);
  assert.equal(result.findings.length, 0);
  assert.match(report, /product_status_promotion_allowed=false/);
  assert.match(report, /secret_values=not_recorded/);
}

function testSyntheticPromotionFailsClosed() {
  const evidence = validEvidence({
    manifest: {
      ...validEvidence().manifest,
      status: "public-beta",
    },
  });
  const result = validateGovernProductStatusPreflightEvidence(evidence);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.productStatusPreflightState, "Blocked");
  assert.equal(result.manifestStatus, "public-beta");
  assert.match(result.findings.join("\n"), /manifest_status_must_remain_limited_preview:public-beta/);
}

function testSyntheticApprovalRefFailsClosed() {
  const evidence = validEvidence({
    approvalPacket: [
      "public_write_route_allowed=false",
      "product_status_current=limited-preview",
      "product_status_target=public-beta",
      "product_status_promotion_ref=ops/product-status-approved.md",
    ].join("\n"),
  });
  const result = validateGovernProductStatusPreflightEvidence(evidence);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.publicWriteRouteAllowed, false);
  assert.match(result.findings.join("\n"), /approval_packet_product_status_promotion_ref_must_remain_missing/);
}

function testSyntheticInvalidPromotionPathFailsClosed() {
  const evidence = validEvidence({
    manifest: {
      ...validEvidence().manifest,
      releaseGate: {
        promotionPath: ["limited-preview", "production"],
        required: [...releaseGates],
      },
    },
  });
  const result = validateGovernProductStatusPreflightEvidence(evidence);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.productStatusPreflightState, "Blocked");
  assert.match(result.findings.join("\n"), /manifest_promotion_path_invalid:limited-preview>production/);
}

function testSyntheticAggregateValidatorFailureFailsClosed() {
  const evidence = validEvidence({
    validatorResults: solvedAggregateValidatorResults({
      runtimeClosurePacket: {
        productClaimsAllowed: true,
        proofState: "Fail",
        publicWriteRouteAllowed: false,
        runtimeWitnessClosureAllowed: true,
        solverOutcome: "GovernanceBlocked",
      },
    }),
  });
  const result = validateGovernProductStatusPreflightEvidence(evidence);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.productStatusPreflightState, "Blocked");
  assert.match(result.findings.join("\n"), /aggregate_validator_not_solved:runtimeClosurePacket:GovernanceBlocked/);
  assert.match(result.findings.join("\n"), /runtime_closure_packet_must_not_allow_runtime_closure/);
}

function testSyntheticSecretPatternFailsClosed() {
  const evidence = validEvidence({
    privateValueScanSources: {
      approvalPacket: "Bearer abcdefghijklmnopqrstuvwxyz123456",
      manifest: "{}",
      witness: "product_status_preflight_state=Ready",
    },
  });
  const result = validateGovernProductStatusPreflightEvidence(evidence);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.productStatusPreflightState, "Blocked");
  assert.match(result.findings.join("\n"), /forbidden_private_value_pattern:approvalPacket:bearer_token/);
}

function testCliJsonAndUnsupportedArgs() {
  const jsonResult = runValidator(["--json"]);
  const payload = JSON.parse(jsonResult.stdout);
  assert.equal(jsonResult.status, 0);
  assert.equal(payload.solverOutcome, "SolvedVerified");
  assert.equal(payload.proofState, "Pass");
  assert.equal(payload.productStatusPreflightState, "Ready");

  const invalid = runValidator(["--unknown"]);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stdout, /unsupported_args_count:1/);
  assert.doesNotMatch(invalid.stdout, /--unknown/);
  assert.match(invalid.stdout, /govern_product_status_preflight=GovernanceBlocked/);
}

function testPathBoundaryFailsClosedWithoutEcho() {
  const outsideResult = validateGovernProductStatusPreflight(path.join("..", "private-product-status-preflight.md"));
  const outsideReport = formatGovernProductStatusPreflightReport(outsideResult);

  assert.equal(outsideResult.solverOutcome, "GovernanceBlocked");
  assert.equal(outsideResult.proofState, "Fail");
  assert.equal(outsideResult.productStatusPreflightState, "Blocked");
  assert.equal(outsideResult.publicWriteRouteAllowed, false);
  assert.deepEqual(outsideResult.findings, ["product_status_preflight_path_outside_repo"]);
  assert.doesNotMatch(outsideReport, /private-product-status-preflight/);

  const unreadableResult = validateGovernProductStatusPreflight(path.join("ops", "missing-private-product-status-preflight.md"));
  const unreadableReport = formatGovernProductStatusPreflightReport(unreadableResult);

  assert.equal(unreadableResult.solverOutcome, "GovernanceBlocked");
  assert.equal(unreadableResult.proofState, "Fail");
  assert.equal(unreadableResult.productStatusPreflightState, "Blocked");
  assert.equal(unreadableResult.publicWriteRouteAllowed, false);
  assert.deepEqual(unreadableResult.findings, ["product_status_preflight_unreadable"]);
  assert.doesNotMatch(unreadableReport, /missing-private-product-status-preflight/);
}

testCurrentProductStatusPreflightPasses();
testSyntheticPromotionFailsClosed();
testSyntheticApprovalRefFailsClosed();
testSyntheticInvalidPromotionPathFailsClosed();
testSyntheticAggregateValidatorFailureFailsClosed();
testSyntheticSecretPatternFailsClosed();
testCliJsonAndUnsupportedArgs();
testPathBoundaryFailsClosedWithoutEcho();

console.log("govern product-status preflight validator tests passed");
