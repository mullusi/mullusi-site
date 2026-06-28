/*
Purpose: test the API production readiness reporter without infrastructure mutation.
Governance scope: fail-closed DNS readiness, manual evidence flags, product runtime witness separation, and public-safe output.
Dependencies: Node.js standard library and scripts/check-api-production-readiness.mjs.
Invariants: tests use local fixtures or current public-safe repo files only; they never read private recovery inventories or secret values.
*/

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateApiProductionReadinessEvidence,
  formatApiProductionReadinessResult,
  publicErrorCode,
  publicReadinessScalarLabel,
  readinessFlags,
  runtimeWitnessClosed,
} from "./check-api-production-readiness.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptsDir, "..");
const readinessScript = path.join(scriptsDir, "check-api-production-readiness.mjs");
const tempDir = fs.mkdtempSync(path.join(repoRoot, ".tmp-api-readiness-test-"));

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
        "rollback_path_defined=AwaitingEvidence",
      ].join("\n"),
      productionReadinessGate: [
        "no_gateway_runtime_evidence -> no_api_dns",
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

function testBlockedProductRuntimeWitnessDoesNotBlockGatewayReadiness() {
  const result = evaluateApiProductionReadinessEvidence(fixtureEvidence({ witnesses: [blockedWitness()] }));

  assert.equal(result.apiProductionReadinessState, "ReadyForDns");
  assert.equal(result.runtimeWitnessRegistry, "Pass");
  assert.equal(result.witnessCount, 1);
  assert.equal(result.closedWitnessCount, 0);
  assert.equal(result.blockedWitnessCount, 1);
  assert.equal(result.apiDnsPublicationAllowed, true);
  assert.deepEqual(result.blockers, []);
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

function testSharedPrivateValueScannerBlocksContract() {
  const evidence = fixtureEvidence();
  evidence.documents.recoveryWitness += "\nAuthorization: Bearer abcdefghijklmnopqrstuvwxyz123456";
  evidence.documents.productionReadinessGate += "\npostgres://user:password@private.example/db";
  const result = evaluateApiProductionReadinessEvidence(evidence);
  const formatted = formatApiProductionReadinessResult(result);
  const serialized = `${JSON.stringify(result)}\n${formatted}`;

  assert.equal(result.apiProductionReadinessState, "GovernanceBlocked");
  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.secretBoundary, "Fail");
  assert.ok(result.hardFindings.includes("forbidden_private_value_pattern:recoveryWitness:bearer_token"));
  assert.ok(result.hardFindings.includes("forbidden_private_value_pattern:recoveryWitness:raw_header_authorization"));
  assert.ok(result.hardFindings.includes("forbidden_private_value_pattern:productionReadinessGate:postgres_url"));
  assert.doesNotMatch(serialized, /abcdefghijklmnopqrstuvwxyz123456|postgres:\/\/user:password|private\.example/);
}

function testRuntimeWitnessClosurePredicate() {
  assert.equal(runtimeWitnessClosed(closedWitness()), true);
  assert.equal(runtimeWitnessClosed(blockedWitness()), false);
  assert.equal(runtimeWitnessClosed({}), false);
}

function testCurrentCliDefaultsAwaitEvidenceAfterRecovery() {
  const result = runCli();

  assert.equal(result.status, 0);
  assert.match(result.stdout, /^api_production_readiness_state=AwaitingEvidence$/m);
  assert.match(result.stdout, /^recovery_gate=ReadyForProvisioning$/m);
  assert.match(result.stdout, /^api_dns_publication_allowed=false$/m);
  assert.match(result.stdout, /^secret_values=not_recorded$/m);
  assert.match(result.stdout, /^private_recovery_values=not_read$/m);
}

function testCurrentCliRequireReadyFailsClosed() {
  const result = runCli(["--require-ready"]);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /^api_production_readiness_state=AwaitingEvidence$/m);
  assert.match(result.stdout, /^proof_state=Unknown$/m);
  assert.match(result.stdout, /^blocker=manual_evidence_missing:production_image_published$/m);
}

function testCurrentCliWithAllEvidenceFlagsRequiresReady() {
  const result = runCli([
    "--production-image-published",
    "--runtime-host-ready",
    "--managed-postgres-ready",
    "--schema-applied",
    "--production-secrets-stored",
    "--deploy-env-ready",
    "--release-preflight-ready",
    "--persistence-ready",
    "--host-firewall-configured",
    "--tls-certificate-ready",
    "--rollback-path-defined",
    "--private-runtime-witness-ready",
    "--dns-authority-ready",
    "--require-ready",
  ]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /^api_production_readiness_state=ReadyForDns$/m);
  assert.match(result.stdout, /^api_dns_publication_allowed=true$/m);
  assert.match(result.stdout, /^runtime_witness_closed_count=0$/m);
  assert.doesNotMatch(result.stdout, /runtime_witness_registry_has_no_closed_products/);
}

function testCurrentCliRejectsUnsupportedArgs() {
  const result = runCli(["--unsupported"]);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /^api_production_readiness_state=GovernanceBlocked$/m);
  assert.match(result.stdout, /^proof_state=Fail$/m);
  assert.match(result.stdout, /^finding=unsupported_args_count:1$/m);
  assert.doesNotMatch(result.stdout, /--unsupported/);
}

function testOutputFilePersistsReadinessJson() {
  const outputPath = path.join(tempDir, "readiness.json");
  const result = runCli(["--require-ready", `--output=${outputPath}`]);
  const payload = JSON.parse(fs.readFileSync(outputPath, "utf8"));

  assert.equal(result.status, 1);
  assert.match(result.stdout, /^api_production_readiness_state=AwaitingEvidence$/m);
  assert.equal(payload.apiProductionReadinessState, "AwaitingEvidence");
  assert.equal(payload.solverOutcome, "AwaitingEvidence");
  assert.equal(payload.apiDnsPublicationAllowed, false);
  assert.ok(payload.blockers.includes("manual_evidence_missing:production_image_published"));
}

function testJsonOutputFilePersistsGovernanceBlock() {
  const outputPath = path.join(tempDir, "invalid.json");
  const result = runCli(["--unsupported", "--json", `--output=${outputPath}`]);
  const stdoutPayload = JSON.parse(result.stdout);
  const filePayload = JSON.parse(fs.readFileSync(outputPath, "utf8"));

  assert.equal(result.status, 1);
  assert.equal(stdoutPayload.apiProductionReadinessState, "GovernanceBlocked");
  assert.equal(filePayload.proofState, "Fail");
  assert.deepEqual(filePayload.hardFindings, ["unsupported_args_count:1"]);
  assert.equal(JSON.stringify(filePayload).includes("--unsupported"), false);
}

function testEmptyOutputPathIsRejectedBeforeWrite() {
  const result = runCli(["--json", "--output="]);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.status, 1);
  assert.equal(payload.apiProductionReadinessState, "GovernanceBlocked");
  assert.deepEqual(payload.hardFindings, ["unsupported_args_count:1"]);
  assert.equal(JSON.stringify(payload).includes("--output="), false);
}

function testOutsideOutputPathIsRejectedBeforeWrite() {
  const outsidePath = path.join(os.tmpdir(), "private-api-readiness-output.json");
  if (fs.existsSync(outsidePath)) fs.rmSync(outsidePath, { force: true });
  const result = runCli(["--json", `--output=${outsidePath}`]);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.status, 1);
  assert.equal(payload.apiProductionReadinessState, "GovernanceBlocked");
  assert.deepEqual(payload.hardFindings, ["output_path_outside_repo"]);
  assert.equal(fs.existsSync(outsidePath), false);
  assert.equal(JSON.stringify(payload).includes(outsidePath), false);
  assert.equal(JSON.stringify(payload).includes("private-api-readiness-output"), false);
}

function testPublicErrorCodeRedactsRawExceptionValues() {
  const file = publicErrorCode(new Error("ENOENT: no such file or directory, open 'D:\\secret\\registry.json'"));
  const json = publicErrorCode(new SyntaxError("Unexpected token in private JSON"));
  const secret = publicErrorCode(new Error("postgres://user:password@private.example/db"));
  const fallback = publicErrorCode(new Error("unexpected private path C:\\secret\\readiness.txt"));

  assert.equal(file, "api_production_readiness_file_unavailable");
  assert.equal(json, "api_production_readiness_json_invalid");
  assert.equal(secret, "api_production_readiness_unavailable");
  assert.equal(fallback, "api_production_readiness_unavailable");
  assert.doesNotMatch([file, json, secret, fallback].join("\n"), /D:\\|C:\\|secret|private|postgres|password|registry\.json|readiness\.txt/i);
}

function testInvalidReadinessStateValuesAreRedacted() {
  const evidence = fixtureEvidence({
    recoveryState: "private/recovery-state",
    allowed: "postgres://user:password@private.example/db",
    witnesses: [closedWitness("private/product-repo")],
  });
  evidence.runtimeWitnessRegistry.authority = "private/authority-ref";
  evidence.runtimeWitnessRegistry.witnesses[0].rollback.path = "private/rollback-path";
  const result = evaluateApiProductionReadinessEvidence(evidence);
  const formatted = formatApiProductionReadinessResult(result);
  const serialized = `${JSON.stringify(result)}\n${formatted}`;

  assert.ok(result.hardFindings.includes("runtime_witness_authority_invalid:redacted_value"));
  assert.ok(result.hardFindings.includes("recovery_witness_state_invalid:redacted_value"));
  assert.ok(result.hardFindings.includes("api_provisioning_allowed_invalid:redacted_value"));
  assert.ok(result.hardFindings.includes("runtime_witness_rollback_path_invalid:redacted_value"));
  assert.doesNotMatch(serialized, /private\/recovery-state|postgres:\/\/user:password@private\.example\/db|private\/product-repo|private\/authority-ref|private\/rollback-path/);
}

function testPublicReadinessScalarLabelRedactsUnsafeValues() {
  assert.equal(publicReadinessScalarLabel("ReadyForProvisioning"), "ReadyForProvisioning");
  assert.equal(publicReadinessScalarLabel("private/recovery state"), "redacted_value");
  assert.equal(publicReadinessScalarLabel(""), "missing");
}

testReadyFixtureAllowsDns();
testMissingManualEvidenceAwaitsEvidence();
testRecoveryBlockDominatesReadiness();
testBlockedProductRuntimeWitnessDoesNotBlockGatewayReadiness();
testSecretLikeValueBlocksContract();
testSharedPrivateValueScannerBlocksContract();
testRuntimeWitnessClosurePredicate();
testCurrentCliDefaultsAwaitEvidenceAfterRecovery();
testCurrentCliRequireReadyFailsClosed();
testCurrentCliWithAllEvidenceFlagsRequiresReady();
testCurrentCliRejectsUnsupportedArgs();
testOutputFilePersistsReadinessJson();
testJsonOutputFilePersistsGovernanceBlock();
testEmptyOutputPathIsRejectedBeforeWrite();
testOutsideOutputPathIsRejectedBeforeWrite();
testPublicErrorCodeRedactsRawExceptionValues();
testInvalidReadinessStateValuesAreRedacted();
testPublicReadinessScalarLabelRedactsUnsafeValues();

fs.rmSync(tempDir, { recursive: true, force: true });

console.log("api production readiness tests passed");
