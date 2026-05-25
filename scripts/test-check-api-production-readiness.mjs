/*
Purpose: test the API production readiness reporter without infrastructure mutation.
Governance scope: fail-closed DNS readiness, manual evidence flags, runtime witness registry closure, and public-safe output.
Dependencies: Node.js standard library and scripts/check-api-production-readiness.mjs.
Invariants: tests use local fixtures or current public-safe repo files only; they never read private recovery inventories or secret values.
*/

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateApiProductionReadinessEvidence,
  formatApiProductionReadinessResult,
  readinessFlags,
  runtimeWitnessClosed,
} from "./check-api-production-readiness.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptsDir, "..");
const readinessScript = path.join(scriptsDir, "check-api-production-readiness.mjs");

function readyFlagMap(overrides = {}) {
  return Object.fromEntries(readinessFlags.map(({ key }) => [key, overrides[key] ?? true]));
}

function recoveryWitness(state = "ReadyForProvisioning", allowed = "true") {
  return [
    `recovery_witness_state=${state}`,
    `api_provisioning_allowed=${allowed}`,
  ].join("\n");
}

function closedWitness(productId = "mullu-govern") {
  return {
    productId,
    productManifest: `products/${productId}/product.manifest.json`,
    service: "mullusi-govern-cloud",
    proofState: "SolvedVerified",
    runtimeState: "public-witness-ready",
    controlPlane: { required: true, bypassAllowed: false },
    health: {
      evidenceState: "pass",
      requiredEndpoints: ["/health", "/gateway/witness", "/runtime/conformance"],
      observations: [
        { endpoint: "/health", state: "Pass", observedAt: "2026-05-24T00:00:00Z", evidence: "fixture" },
        { endpoint: "/gateway/witness", state: "Pass", observedAt: "2026-05-24T00:00:00Z", evidence: "fixture" },
        { endpoint: "/runtime/conformance", state: "Pass", observedAt: "2026-05-24T00:00:00Z", evidence: "fixture" },
      ],
    },
    preflight: { mode: "fail-closed", decision: "allow", reason: "fixture" },
    publicExposure: { allowed: true, state: "allowed", reason: "fixture" },
    rollback: { state: "Ready", path: "ops/api-production-readiness-gate.md" },
    lineage: { source: "ops/runtime-witness/registry.json", updatedAt: "2026-05-24T00:00:00Z" },
  };
}

function blockedWitness(productId = "mullu-govern") {
  return {
    ...closedWitness(productId),
    proofState: "AwaitingEvidence",
    runtimeState: "private-only",
    health: { evidenceState: "not-collected", requiredEndpoints: ["/health", "/gateway/witness", "/runtime/conformance"], observations: [] },
    preflight: { mode: "fail-closed", decision: "block", reason: "fixture blocked" },
    publicExposure: { allowed: false, state: "blocked", reason: "fixture blocked" },
    rollback: { state: "AwaitingEvidence", path: "ops/api-production-readiness-gate.md" },
  };
}

function fixtureEvidence({ recoveryState = "ReadyForProvisioning", allowed = "true", flags = readyFlagMap(), witnesses = [closedWitness()] } = {}) {
  return {
    documents: {
      runtimeHostPath: [
        "api.mullusi.com",
        "external managed PostgreSQL",
        "Strict-Transport-Security: max-age=86400",
        "rollback_path_defined=true",
      ].join("\n"),
      productionReadinessGate: [
        "no_runtime_witness -> no_api_dns",
        "python scripts/check_deploy_env.py",
        "python scripts/preflight_release.py",
        "python scripts/apply_schema.py",
        "python scripts/check_persistence.py",
        "curl https://api.mullusi.com/health",
        "curl https://api.mullusi.com/gateway/witness",
        "curl https://api.mullusi.com/runtime/conformance",
      ].join("\n"),
      recoveryWitness: recoveryWitness(recoveryState, allowed),
      runtimeWitnessReadme: "controlPlane.required\ncontrolPlane.bypassAllowed\nruntimeWitnessClosed\n",
    },
    runtimeWitnessRegistry: {
      schemaVersion: "1.0.0",
      authority: "mullusi-runtime-witness-authority",
      witnesses,
    },
    readinessFlags: flags,
  };
}

function runCli(args = []) {
  return spawnSync(process.execPath, [readinessScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function testReadyFixtureAllowsDns() {
  const result = evaluateApiProductionReadinessEvidence(fixtureEvidence());
  const formatted = formatApiProductionReadinessResult(result);

  assert.equal(result.apiProductionReadinessState, "ReadyForDns");
  assert.equal(result.solverOutcome, "SolvedVerified");
  assert.equal(result.proofState, "Pass");
  assert.equal(result.apiDnsPublicationAllowed, true);
  assert.equal(result.manualEvidenceMissing.length, 0);
  assert.equal(result.closedWitnessCount, 1);
  assert.match(formatted, /^api_dns_publication_allowed=true$/m);
}

function testMissingManualEvidenceAwaitsEvidence() {
  const result = evaluateApiProductionReadinessEvidence(fixtureEvidence({
    flags: readyFlagMap({ managed_postgres_ready: false, tls_certificate_ready: false }),
  }));

  assert.equal(result.apiProductionReadinessState, "AwaitingEvidence");
  assert.equal(result.proofState, "Unknown");
  assert.equal(result.apiDnsPublicationAllowed, false);
  assert.deepEqual(result.manualEvidenceMissing, ["managed_postgres_ready", "tls_certificate_ready"]);
  assert.ok(result.blockers.includes("manual_evidence_missing:managed_postgres_ready"));
  assert.ok(result.blockers.includes("manual_evidence_missing:tls_certificate_ready"));
}

function testRecoveryBlockDominatesReadiness() {
  const result = evaluateApiProductionReadinessEvidence(fixtureEvidence({
    recoveryState: "AwaitingEvidence",
    allowed: "false",
  }));

  assert.equal(result.apiProductionReadinessState, "Blocked");
  assert.equal(result.solverOutcome, "AwaitingEvidence");
  assert.equal(result.recoveryGate, "Blocked");
  assert.equal(result.apiProvisioningAllowed, false);
  assert.ok(result.blockers.includes("recovery_witness_not_ready"));
  assert.equal(result.apiDnsPublicationAllowed, false);
}

function testBlockedRuntimeWitnessAwaitsEvidenceAfterRecovery() {
  const result = evaluateApiProductionReadinessEvidence(fixtureEvidence({ witnesses: [blockedWitness()] }));

  assert.equal(result.apiProductionReadinessState, "AwaitingEvidence");
  assert.equal(result.runtimeWitnessRegistry, "Pass");
  assert.equal(result.witnessCount, 1);
  assert.equal(result.closedWitnessCount, 0);
  assert.equal(result.blockedWitnessCount, 1);
  assert.ok(result.blockers.includes("runtime_witness_registry_has_no_closed_products"));
}

function testSecretLikeValueBlocksContract() {
  const evidence = fixtureEvidence();
  evidence.documents.runtimeHostPath += "\npostgres://user:password@example.com/db\n";
  const result = evaluateApiProductionReadinessEvidence(evidence);

  assert.equal(result.apiProductionReadinessState, "GovernanceBlocked");
  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.secretBoundary, "Fail");
  assert.equal(result.apiDnsPublicationAllowed, false);
  assert.ok(result.hardFindings.includes("secret_like_value_present:runtimeHostPath"));
}

function testRuntimeWitnessClosurePredicate() {
  assert.equal(runtimeWitnessClosed(closedWitness()), true);
  assert.equal(runtimeWitnessClosed(blockedWitness()), false);
  assert.equal(runtimeWitnessClosed({}), false);
}

function testCurrentCliDefaultsBlockedPublicSafely() {
  const result = runCli();

  assert.equal(result.status, 0);
  assert.match(result.stdout, /^api_production_readiness_state=Blocked$/m);
  assert.match(result.stdout, /^api_dns_publication_allowed=false$/m);
  assert.match(result.stdout, /^secret_values=not_recorded$/m);
  assert.match(result.stdout, /^private_recovery_values=not_read$/m);
}

function testCurrentCliRequireReadyFailsClosed() {
  const result = runCli(["--require-ready"]);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /^api_production_readiness_state=Blocked$/m);
  assert.match(result.stdout, /^proof_state=Unknown$/m);
  assert.match(result.stdout, /^blocker=recovery_witness_not_ready$/m);
}

function testCurrentCliRejectsUnsupportedArgs() {
  const result = runCli(["--unsupported"]);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /^api_production_readiness_state=GovernanceBlocked$/m);
  assert.match(result.stdout, /^proof_state=Fail$/m);
  assert.match(result.stdout, /^finding=unsupported_args:--unsupported$/m);
}

testReadyFixtureAllowsDns();
testMissingManualEvidenceAwaitsEvidence();
testRecoveryBlockDominatesReadiness();
testBlockedRuntimeWitnessAwaitsEvidenceAfterRecovery();
testSecretLikeValueBlocksContract();
testRuntimeWitnessClosurePredicate();
testCurrentCliDefaultsBlockedPublicSafely();
testCurrentCliRequireReadyFailsClosed();
testCurrentCliRejectsUnsupportedArgs();

console.log("api production readiness tests passed");
