/*
Purpose: test the API runtime manual evidence checklist validator without mutating infrastructure.
Governance scope: manual evidence row completeness, public-safe refs, DNS denial while evidence is missing, and private-value redaction.
Dependencies: Node.js standard library and scripts/validate-api-runtime-manual-evidence-checklist.mjs.
Invariants: tests use local fixtures and current public-safe repo files only; no secret values or provider-private values are read.
*/

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateApiRuntimeManualEvidenceChecklist,
  expectedEvidenceKeys,
  formatApiRuntimeManualEvidenceChecklistResult,
} from "./validate-api-runtime-manual-evidence-checklist.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptsDir, "..");
const validatorScript = path.join(scriptsDir, "validate-api-runtime-manual-evidence-checklist.mjs");

function checklistContent({ state = "AwaitingEvidence", ref = "missing", omit = "", extra = "", storage = "outside_git" } = {}) {
  const rows = expectedEvidenceKeys
    .filter((key) => key !== omit)
    .map((key) => `evidence_item=${key} state=${state} public_safe_ref=${ref === "per-key" ? `receipt://api-runtime-evidence/${key.replaceAll("_", "-")}/2026-06-28` : ref} private_value_storage=${storage}`);
  return [
    "api_runtime_manual_evidence_checklist=AwaitingEvidence",
    "manual_evidence_item_count=13",
    "manual_evidence_missing_count=13",
    "api_dns_publication_allowed=false",
    "secret_values=not_recorded",
    "host_addresses=not_recorded",
    "database_urls=not_recorded",
    "provider_values=not_recorded",
    "raw_headers=not_recorded",
    "raw_payloads=not_recorded",
    "```text",
    ...rows,
    "```",
    extra,
  ].join("\n");
}

function runCli(args = []) {
  return spawnSync(process.execPath, [validatorScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function testCurrentChecklistAwaitsEvidence() {
  const result = runCli();

  assert.equal(result.status, 0);
  assert.match(result.stdout, /^api_runtime_manual_evidence_checklist=AwaitingEvidence$/m);
  assert.match(result.stdout, /^manual_evidence_item_count=13$/m);
  assert.match(result.stdout, /^manual_evidence_missing_count=10$/m);
  assert.match(result.stdout, /^api_dns_publication_allowed=false$/m);
  assert.match(result.stdout, /^secret_values=not_recorded$/m);
  assert.match(result.stdout, /^provider_values=not_recorded$/m);
}

function testCurrentChecklistRequireReadyFailsClosed() {
  const result = runCli(["--require-ready"]);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /^api_runtime_manual_evidence_checklist=AwaitingEvidence$/m);
  assert.match(result.stdout, /^blocker=manual_evidence_missing:schema_applied$/m);
  assert.match(result.stdout, /^blocker=manual_evidence_missing:dns_authority_ready$/m);
}

function testAllPassFixtureAllowsDnsReadiness() {
  const result = evaluateApiRuntimeManualEvidenceChecklist(checklistContent({ state: "Pass", ref: "per-key" }));
  const formatted = formatApiRuntimeManualEvidenceChecklistResult(result);

  assert.equal(result.apiRuntimeManualEvidenceChecklist, "SolvedVerified");
  assert.equal(result.solverOutcome, "SolvedVerified");
  assert.equal(result.proofState, "Pass");
  assert.equal(result.apiDnsPublicationAllowed, true);
  assert.equal(result.manualEvidenceMissing.length, 0);
  assert.equal(result.checklistContract, "Pass");
  assert.match(formatted, /^blocker=none$/m);
}

function testMissingEvidenceRowBlocksContract() {
  const result = evaluateApiRuntimeManualEvidenceChecklist(checklistContent({ omit: "managed_postgres_ready" }));

  assert.equal(result.apiRuntimeManualEvidenceChecklist, "AwaitingEvidence");
  assert.equal(result.apiDnsPublicationAllowed, false);
  assert.equal(result.checklistContract, "Fail");
  assert.ok(result.hardFindings.includes("manual_evidence_missing_row:managed_postgres_ready"));
  assert.ok(result.manualEvidenceMissing.includes("managed_postgres_ready"));
}

function testPassWithoutRefBlocksContract() {
  const result = evaluateApiRuntimeManualEvidenceChecklist(checklistContent({ state: "Pass", ref: "missing" }));

  assert.equal(result.apiRuntimeManualEvidenceChecklist, "AwaitingEvidence");
  assert.equal(result.checklistContract, "Fail");
  assert.equal(result.apiDnsPublicationAllowed, false);
  assert.ok(result.hardFindings.includes("manual_evidence_pass_ref_missing:production_image_published"));
  assert.ok(result.hardFindings.includes("manual_evidence_pass_ref_missing:dns_authority_ready"));
}

function testPrivateValuePatternsBlockWithoutEchoingValues() {
  const privateContent = checklistContent({
    extra: [
      "database_url=postgres://user:password@private.example/db",
      "host_address=203.0.113.10",
      "Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456",
    ].join("\n"),
  });
  const result = evaluateApiRuntimeManualEvidenceChecklist(privateContent);
  const formatted = formatApiRuntimeManualEvidenceChecklistResult(result);
  const serialized = `${JSON.stringify(result)}\n${formatted}`;

  assert.equal(result.checklistContract, "Fail");
  assert.equal(result.secretBoundary, "Fail");
  assert.equal(result.apiDnsPublicationAllowed, false);
  assert.ok(result.hardFindings.includes("forbidden_private_value_pattern:apiRuntimeManualEvidenceChecklist:postgres_url"));
  assert.ok(result.hardFindings.includes("forbidden_private_value_pattern:apiRuntimeManualEvidenceChecklist:raw_header_authorization"));
  assert.ok(result.hardFindings.includes("forbidden_private_value_pattern:apiRuntimeManualEvidenceChecklist:host_address_assignment"));
  assert.doesNotMatch(serialized, /postgres:\/\/user:password|private\.example|203\.0\.113\.10|abcdefghijklmnopqrstuvwxyz123456/);
}

function testInvalidRefShapeBlocksContract() {
  const result = evaluateApiRuntimeManualEvidenceChecklist(checklistContent({ state: "Pass", ref: "https://provider.example/private/ref" }));

  assert.equal(result.checklistContract, "Fail");
  assert.equal(result.apiDnsPublicationAllowed, false);
  assert.ok(result.hardFindings.includes("manual_evidence_ref_invalid:production_image_published:evidence_ref_family_not_allowed:present"));
  assert.ok(result.hardFindings.includes("manual_evidence_ref_invalid:dns_authority_ready:evidence_ref_family_not_allowed:present"));
}

function testUnsupportedCliArgsDoNotEchoRawArg() {
  const result = runCli(["--private-provider-token"]);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /^api_runtime_manual_evidence_checklist=GovernanceBlocked$/m);
  assert.match(result.stdout, /^finding=unsupported_args_count:1$/m);
  assert.doesNotMatch(result.stdout, /private-provider-token/);
}

function testJsonOutputIsPublicSafe() {
  const result = runCli(["--json"]);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.status, 0);
  assert.equal(payload.apiRuntimeManualEvidenceChecklist, "AwaitingEvidence");
  assert.equal(payload.apiDnsPublicationAllowed, false);
  assert.equal(payload.manualEvidenceMissing.length, 10);
  assert.equal(JSON.stringify(payload).includes("secret"), true);
  assert.doesNotMatch(result.stdout, /postgres:\/\/|Authorization:|Bearer\s+[A-Za-z0-9]/);
}

testCurrentChecklistAwaitsEvidence();
testCurrentChecklistRequireReadyFailsClosed();
testAllPassFixtureAllowsDnsReadiness();
testMissingEvidenceRowBlocksContract();
testPassWithoutRefBlocksContract();
testPrivateValuePatternsBlockWithoutEchoingValues();
testInvalidRefShapeBlocksContract();
testUnsupportedCliArgsDoNotEchoRawArg();
testJsonOutputIsPublicSafe();

fs.rmSync(path.join(repoRoot, ".tmp-api-runtime-manual-evidence-test"), { recursive: true, force: true });

console.log("api runtime manual evidence checklist tests passed");
