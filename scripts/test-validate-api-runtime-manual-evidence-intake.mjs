/*
Purpose: test the API runtime manual evidence intake validator without infrastructure mutation.
Governance scope: JSON intake completeness, public-safe refs, DNS denial, and private-value redaction.
Dependencies: Node.js standard library and scripts/validate-api-runtime-manual-evidence-intake.mjs.
Invariants: tests use local fixtures and current public-safe repo files only; no provider dashboards or secret stores are read.
*/

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateApiRuntimeManualEvidenceIntakeContent,
} from "./validate-api-runtime-manual-evidence-intake.mjs";
import { expectedEvidenceKeys } from "./validate-api-runtime-manual-evidence-checklist.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptsDir, "..");
const validatorScript = path.join(scriptsDir, "validate-api-runtime-manual-evidence-intake.mjs");

function intakeFixture(refFactory = () => "missing", overrides = {}) {
  return JSON.stringify({
    purpose: "fixture",
    governance_scope: "fixture",
    surface_id: "api.mullusi.com",
    ready_for_dns: false,
    api_dns_publication_allowed: false,
    secret_values_allowed: false,
    raw_payloads_allowed: false,
    provider_values_allowed: false,
    host_addresses_allowed: false,
    database_urls_allowed: false,
    dns_targets_allowed: false,
    evidence_refs: Object.fromEntries(expectedEvidenceKeys.map((key) => [key, refFactory(key)])),
    status: {
      solver_outcome: "AwaitingEvidence",
      proof_state: "Unknown",
      next_action: "fixture",
    },
    ...overrides,
  }, null, 2);
}

function runCli(args = []) {
  return spawnSync(process.execPath, [validatorScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function testCurrentTemplateIsValidButIncomplete() {
  const result = runCli();

  assert.equal(result.status, 0);
  assert.match(result.stdout, /^api_runtime_manual_evidence_intake=SolvedVerified$/m);
  assert.match(result.stdout, /^ready_for_dns=false$/m);
  assert.match(result.stdout, /^intake_complete=false$/m);
  assert.match(result.stdout, /^missing_evidence_ref_count=11$/m);
  assert.match(result.stdout, /^secret_values=not_read$/m);
}

function testRequireCompleteFailsOnMissingRefs() {
  const result = runCli(["--require-complete"]);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /^api_runtime_manual_evidence_intake=GovernanceBlocked$/m);
  assert.match(result.stdout, /^missing_evidence_ref_count=11$/m);
  assert.match(result.stdout, /^finding=evidence_ref_required:managed_postgres_ready$/m);
}

function testCompleteFixturePasses() {
  const result = validateApiRuntimeManualEvidenceIntakeContent(intakeFixture(
    (key) => `receipt://api-runtime-intake/${key.replaceAll("_", "-")}/2026-06-28`,
  ), { requireComplete: true });

  assert.equal(result.apiRuntimeManualEvidenceIntake, "SolvedVerified");
  assert.equal(result.proofState, "Pass");
  assert.equal(result.missingEvidenceRefCount, 0);
  assert.equal(result.readyForDns, false);
  assert.equal(result.intakeComplete, true);
}

function testMissingKeyBlocks() {
  const parsed = JSON.parse(intakeFixture());
  delete parsed.evidence_refs.managed_postgres_ready;
  const result = validateApiRuntimeManualEvidenceIntakeContent(JSON.stringify(parsed, null, 2));

  assert.equal(result.apiRuntimeManualEvidenceIntake, "GovernanceBlocked");
  assert.ok(result.findings.includes("evidence_ref_missing_key:managed_postgres_ready"));
  assert.equal(result.proofState, "Fail");
  assert.equal(result.readyForDns, false);
}

function testDnsPublicationMustRemainFalse() {
  const result = validateApiRuntimeManualEvidenceIntakeContent(intakeFixture(() => "missing", {
    ready_for_dns: true,
    api_dns_publication_allowed: true,
  }));

  assert.ok(result.findings.includes("ready_for_dns_must_remain_false:boolean:true"));
  assert.ok(result.findings.includes("api_dns_publication_allowed_must_remain_false:boolean:true"));
  assert.equal(result.apiRuntimeManualEvidenceIntake, "GovernanceBlocked");
  assert.equal(result.readyForDns, false);
}

function testPrivateValuePatternsBlockWithoutEchoingValues() {
  const content = `${intakeFixture()}\nhost_address=203.0.113.10\ndatabase_url=postgres://user:password@private.example/db`;
  const result = validateApiRuntimeManualEvidenceIntakeContent(content);
  const serialized = JSON.stringify(result);

  assert.ok(result.findings.includes("forbidden_private_value_pattern:apiRuntimeManualEvidenceIntake:host_address_assignment"));
  assert.ok(result.findings.includes("forbidden_private_value_pattern:apiRuntimeManualEvidenceIntake:postgres_url"));
  assert.equal(result.apiRuntimeManualEvidenceIntake, "GovernanceBlocked");
  assert.doesNotMatch(serialized, /203\.0\.113\.10|postgres:\/\/user:password|private\.example/);
}

function testUnsupportedArgsDoNotEchoRawArg() {
  const result = runCli(["--private-token"]);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /^api_runtime_manual_evidence_intake=GovernanceBlocked$/m);
  assert.match(result.stdout, /^finding=unsupported_args_count:1$/m);
  assert.doesNotMatch(result.stdout, /private-token/);
}

function testJsonOutputIsPublicSafe() {
  const result = runCli(["--json"]);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.status, 0);
  assert.equal(payload.apiRuntimeManualEvidenceIntake, "SolvedVerified");
  assert.equal(payload.readyForDns, false);
  assert.equal(payload.missingEvidenceRefCount, 11);
  assert.doesNotMatch(result.stdout, /postgres:\/\/|Authorization:|Bearer\s+[A-Za-z0-9]/);
}

testCurrentTemplateIsValidButIncomplete();
testRequireCompleteFailsOnMissingRefs();
testCompleteFixturePasses();
testMissingKeyBlocks();
testDnsPublicationMustRemainFalse();
testPrivateValuePatternsBlockWithoutEchoingValues();
testUnsupportedArgsDoNotEchoRawArg();
testJsonOutputIsPublicSafe();

console.log("api runtime manual evidence intake tests passed");
