/*
Purpose: test the Mullu Govern public-claim update preflight validator.
Governance scope: generated claim blocking, proof-boundary blocking, fail-closed approval refs, unsupported args, and no-secret pattern rejection.
Dependencies: Node.js standard library and scripts/validate-govern-public-claim-update-preflight.mjs.
Invariants: tests use public-safe repository evidence or synthetic fixtures only; they never inspect provider dashboards or private values.
*/

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatGovernPublicClaimUpdatePreflightReport,
  validateGovernPublicClaimUpdatePreflight,
  validateGovernPublicClaimUpdatePreflightEvidence,
} from "./validate-govern-public-claim-update-preflight.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptsDir, "..");
const validatorScript = path.join(scriptsDir, "validate-govern-public-claim-update-preflight.mjs");

const blockedClaimIds = [
  "mullu-govern.blocked.dashboard-operator-readiness",
  "mullu-govern.blocked.production-runtime-witness-closure",
  "mullu-govern.blocked.public-proof-stamp-issuance",
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
    productStatusPreflight: {
      productStatusPreflightState: "Ready",
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

function claimBinding(claimId) {
  return {
    claimId,
    claimText: claimId.replace("mullu-govern.blocked.", ""),
    proofState: "AwaitingEvidence",
    renderDecision: "block",
    requiredWitnesses: ["runtime", "contract", "rollback", "privacy"],
    state: "blocked",
  };
}

function generatedClaim(claimId) {
  return {
    claimId,
    productId: "mullu-govern",
    publicRenderAllowed: false,
    renderDecision: "block",
    runtimeWitnessClosed: false,
  };
}

function validEvidence(overrides = {}) {
  const witness = [
    "public_claim_update_preflight_state=Ready",
    "solver_outcome=SolvedVerified",
    "proof_state=Pass",
    "product_status_current=limited-preview",
    "public_claim_update_allowed=false",
    "public_claim_update_ref=missing",
    "public_beta_claim_allowed=false",
    "renderable_claim_count=0",
    "govern_blocked_claim_count=3",
    "public_write_route_allowed=false",
    "route_publication_action=none",
    "dns_mutation=none",
    "runtime_mutation=none",
    "secret_rotation_required=false",
    "provider_values_recorded=false",
    "STATUS:",
  ].join("\n");
  return {
    approvalPacket: "public_write_route_allowed=false\npublic_claim_update_ref=missing\n",
    claimRegistry: {
      claims: blockedClaimIds.map(generatedClaim),
      renderableClaims: [],
    },
    manifest: {
      id: "mullu-govern",
      status: "limited-preview",
      proof: {
        claimsAllowed: [],
        claimsBlockedUntilVerified: [
          "production runtime witness closure",
          "public proof stamp issuance",
          "dashboard operator readiness",
        ],
      },
    },
    privateValueScanSources: {
      approvalPacket: "public_write_route_allowed=false\npublic_claim_update_ref=missing\n",
      manifest: "{}",
      proof: "{}",
      witness,
    },
    productsRegistry: {
      products: [{
        id: "mullu-govern",
        publicExposureAllowed: false,
        releaseGateState: "blocked",
        status: "limited-preview",
      }],
    },
    proof: {
      productId: "mullu-govern",
      proofState: "AwaitingEvidence",
      claimsAllowed: [],
      claimBindings: blockedClaimIds.map(claimBinding),
    },
    publicClaimGate: "no public claim ships without a status, evidence basis, exposure decision, and rollback path",
    validatorResults: solvedAggregateValidatorResults(),
    witness,
    ...overrides,
  };
}

function testCurrentPublicClaimUpdatePreflightPasses() {
  const result = validateGovernPublicClaimUpdatePreflight();
  const report = formatGovernPublicClaimUpdatePreflightReport(result);

  assert.equal(result.solverOutcome, "SolvedVerified");
  assert.equal(result.proofState, "Pass");
  assert.equal(result.publicClaimUpdatePreflightState, "Ready");
  assert.equal(result.publicWriteRouteAllowed, false);
  assert.equal(result.renderableClaimCount, 0);
  assert.equal(result.governBlockedClaimCount, 3);
  assert.equal(result.findings.length, 0);
  assert.match(report, /public_claim_update_allowed=false/);
  assert.match(report, /provider_values=not_recorded/);
}

function testSyntheticRenderableClaimFailsClosed() {
  const evidence = validEvidence({
    claimRegistry: {
      claims: blockedClaimIds.map(generatedClaim),
      renderableClaims: [{ claimId: "mullu-govern.public-beta" }],
    },
  });
  const result = validateGovernPublicClaimUpdatePreflightEvidence(evidence);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.publicClaimUpdatePreflightState, "Blocked");
  assert.match(result.findings.join("\n"), /generated_renderable_claim_count_must_remain_zero:1/);
}

function testSyntheticAllowedProofClaimFailsClosed() {
  const evidence = validEvidence({
    proof: {
      ...validEvidence().proof,
      claimsAllowed: ["public beta ready"],
    },
  });
  const result = validateGovernPublicClaimUpdatePreflightEvidence(evidence);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.match(result.findings.join("\n"), /proof_claims_allowed_must_remain_empty/);
}

function testSyntheticApprovalRefFailsClosed() {
  const evidence = validEvidence({
    approvalPacket: "public_write_route_allowed=false\npublic_claim_update_ref=ops/public-claim-ready.md\n",
  });
  const result = validateGovernPublicClaimUpdatePreflightEvidence(evidence);
  const report = formatGovernPublicClaimUpdatePreflightReport(result);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.publicWriteRouteAllowed, false);
  assert.match(result.findings.join("\n"), /approval_packet_public_claim_update_ref_must_remain_missing:redacted_value/);
  assert.doesNotMatch(report, /ops\/public-claim-ready/);
}

function testSyntheticAggregateProductStatusFailureFailsClosed() {
  const evidence = validEvidence({
    validatorResults: solvedAggregateValidatorResults({
      productStatusPreflight: {
        productStatusPreflightState: "Blocked",
        proofState: "Fail",
        publicWriteRouteAllowed: true,
        solverOutcome: "GovernanceBlocked",
      },
    }),
  });
  const result = validateGovernPublicClaimUpdatePreflightEvidence(evidence);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.publicClaimUpdatePreflightState, "Blocked");
  assert.match(result.findings.join("\n"), /aggregate_validator_not_solved:productStatusPreflight:GovernanceBlocked/);
  assert.match(result.findings.join("\n"), /product_status_preflight_public_write_route_not_blocked/);
}

function testSyntheticUnsafePublicClaimValuesUsePublicLabels() {
  const privateClaimId = "private.product.claim";
  const evidence = validEvidence({
    claimRegistry: {
      claims: [{
        claimId: privateClaimId,
        productId: "mullu-govern",
        publicRenderAllowed: true,
        renderDecision: "private-render-decision",
        runtimeWitnessClosed: true,
      }],
      renderableClaims: [],
    },
    manifest: {
      id: "private-product-id",
      status: "private-status",
      proof: {
        claimsAllowed: [],
        claimsBlockedUntilVerified: [
          "production runtime witness closure",
          "public proof stamp issuance",
          "dashboard operator readiness",
        ],
      },
    },
    productsRegistry: {
      products: [{
        id: "mullu-govern",
        publicExposureAllowed: true,
        releaseGateState: "private-release-gate",
        status: "private-generated-status",
      }],
    },
    proof: {
      productId: "private-proof-product",
      proofState: "private-proof-state",
      claimsAllowed: [],
      claimBindings: [{
        claimId: privateClaimId,
        proofState: "private-proof-state",
        renderDecision: "private-render-decision",
        state: "private-claim-state",
      }],
    },
    validatorResults: solvedAggregateValidatorResults({
      writeRouteDecision: {
        proofState: "private-proof-state",
        publicWriteRouteAllowed: false,
        routePublicationAction: "private-route-action",
        solverOutcome: "SolvedVerified",
      },
    }),
  });
  const result = validateGovernPublicClaimUpdatePreflightEvidence(evidence);
  const report = formatGovernPublicClaimUpdatePreflightReport(result);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.match(report, /manifest_id_invalid:redacted_value/);
  assert.match(report, /proof_claim_bindings_invalid:list_length:1/);
  assert.match(report, /generated_claim_public_render_must_remain_false:redacted_value/);
  assert.match(report, /write_route_decision_route_publication_action_must_remain_none:redacted_value/);
  assert.doesNotMatch(report, /private-product-id/);
  assert.doesNotMatch(report, /private-proof-product/);
  assert.doesNotMatch(report, /private-proof-state/);
  assert.doesNotMatch(report, /private.product.claim/);
  assert.doesNotMatch(report, /private-route-action/);
}

function testSyntheticSecretPatternFailsClosed() {
  const evidence = validEvidence({
    privateValueScanSources: {
      approvalPacket: "{}",
      manifest: "Bearer abcdefghijklmnopqrstuvwxyz123456",
      proof: "{}",
      witness: "public_claim_update_preflight_state=Ready",
    },
  });
  const result = validateGovernPublicClaimUpdatePreflightEvidence(evidence);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.match(result.findings.join("\n"), /forbidden_private_value_pattern:manifest:bearer_token/);
}

function testCliJsonAndUnsupportedArgs() {
  const jsonResult = runValidator(["--json"]);
  const payload = JSON.parse(jsonResult.stdout);
  assert.equal(jsonResult.status, 0);
  assert.equal(payload.solverOutcome, "SolvedVerified");
  assert.equal(payload.proofState, "Pass");
  assert.equal(payload.publicClaimUpdatePreflightState, "Ready");

  const invalid = runValidator(["--unknown"]);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stdout, /unsupported_args_count:1/);
  assert.doesNotMatch(invalid.stdout, /--unknown/);
  assert.match(invalid.stdout, /govern_public_claim_update_preflight=GovernanceBlocked/);
}

function testPathBoundaryFailsClosedWithoutEcho() {
  const outsideResult = validateGovernPublicClaimUpdatePreflight(path.join("..", "private-public-claim-preflight.md"));
  const outsideReport = formatGovernPublicClaimUpdatePreflightReport(outsideResult);

  assert.equal(outsideResult.solverOutcome, "GovernanceBlocked");
  assert.equal(outsideResult.proofState, "Fail");
  assert.equal(outsideResult.publicClaimUpdatePreflightState, "Blocked");
  assert.equal(outsideResult.publicWriteRouteAllowed, false);
  assert.deepEqual(outsideResult.findings, ["public_claim_update_preflight_path_outside_repo"]);
  assert.doesNotMatch(outsideReport, /private-public-claim-preflight/);

  const unreadableResult = validateGovernPublicClaimUpdatePreflight(path.join("ops", "missing-private-public-claim-preflight.md"));
  const unreadableReport = formatGovernPublicClaimUpdatePreflightReport(unreadableResult);

  assert.equal(unreadableResult.solverOutcome, "GovernanceBlocked");
  assert.equal(unreadableResult.proofState, "Fail");
  assert.equal(unreadableResult.publicClaimUpdatePreflightState, "Blocked");
  assert.equal(unreadableResult.publicWriteRouteAllowed, false);
  assert.deepEqual(unreadableResult.findings, ["public_claim_update_preflight_unreadable"]);
  assert.doesNotMatch(unreadableReport, /missing-private-public-claim-preflight/);
}

testCurrentPublicClaimUpdatePreflightPasses();
testSyntheticRenderableClaimFailsClosed();
testSyntheticAllowedProofClaimFailsClosed();
testSyntheticApprovalRefFailsClosed();
testSyntheticAggregateProductStatusFailureFailsClosed();
testSyntheticUnsafePublicClaimValuesUsePublicLabels();
testSyntheticSecretPatternFailsClosed();
testCliJsonAndUnsupportedArgs();
testPathBoundaryFailsClosedWithoutEcho();

console.log("govern public-claim update preflight validator tests passed");
