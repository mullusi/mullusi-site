/*
Purpose: test the API runtime manual evidence next-ref reporter without infrastructure mutation.
Governance scope: pre-DNS evidence ordering, public-safe ref guidance, private-value redaction, and DNS denial.
Dependencies: Node.js standard library and scripts/report-api-runtime-manual-evidence-next.mjs.
Invariants: tests use local fixtures and current public-safe repo files only; no provider dashboards or secret stores are read.
*/

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateApiRuntimeManualEvidenceNext,
  formatApiRuntimeManualEvidenceNextReport,
} from "./report-api-runtime-manual-evidence-next.mjs";
import { expectedEvidenceKeys } from "./validate-api-runtime-manual-evidence-checklist.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptsDir, "..");
const reporterScript = path.join(scriptsDir, "report-api-runtime-manual-evidence-next.mjs");

function intakeContent(refMap = {}) {
  return JSON.stringify({
    surface_id: "api.mullusi.com",
    ready_for_dns: false,
    api_dns_publication_allowed: false,
    evidence_refs: Object.fromEntries(expectedEvidenceKeys.map((key) => [key, refMap[key] ?? "missing"])),
  }, null, 2);
}

function runCli(args = []) {
  return spawnSync(process.execPath, [reporterScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function testCurrentTemplateReportsTlsNext() {
  const result = runCli();

  assert.equal(result.status, 0);
  assert.match(result.stdout, /^api_runtime_manual_evidence_next=AwaitingEvidence$/m);
  assert.match(result.stdout, /^next_evidence_key=tls_certificate_ready$/m);
  assert.match(result.stdout, /^next_private_action=issue_tls_without_premature_dns_publication$/m);
  assert.match(result.stdout, /^missing_evidence_ref_count=4$/m);
  assert.match(result.stdout, /^ready_for_dns=false$/m);
}

function testReporterAdvancesToNextMissingKey() {
  const result = evaluateApiRuntimeManualEvidenceNext(intakeContent({
    production_image_published: "github:actions/runs/123456:api-image-published",
  }));
  const formatted = formatApiRuntimeManualEvidenceNextReport(result);

  assert.equal(result.apiRuntimeManualEvidenceNext, "AwaitingEvidence");
  assert.equal(result.nextEvidenceKey, "runtime_host_ready");
  assert.equal(result.nextPrivateAction, "provision_private_linux_runtime_host");
  assert.equal(result.missingEvidenceRefCount, 12);
  assert.match(formatted, /^accepted_ref_examples=render:event\/host-ready-YYYY-MM-DD,receipt:\/\/api-runtime\/host-ready\/YYYY-MM-DD$/m);
}

function testCompleteIntakeReportsNone() {
  const refs = Object.fromEntries(expectedEvidenceKeys.map((key) => [
    key,
    `receipt://api-runtime-next/${key.replaceAll("_", "-")}/2026-06-28`,
  ]));
  const result = evaluateApiRuntimeManualEvidenceNext(intakeContent(refs));

  assert.equal(result.solverOutcome, "SolvedVerified");
  assert.equal(result.proofState, "Pass");
  assert.equal(result.nextEvidenceKey, "none");
  assert.equal(result.nextPrivateAction, "none");
  assert.equal(result.missingEvidenceRefCount, 0);
  assert.equal(result.readyForDns, false);
}

function testInvalidRefBlocksWithoutEcho() {
  const result = evaluateApiRuntimeManualEvidenceNext(intakeContent({
    production_image_published: "https://private.example/raw/ref",
  }));
  const serialized = JSON.stringify(result);

  assert.equal(result.apiRuntimeManualEvidenceNext, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.ok(result.findings.includes("evidence_ref_invalid:production_image_published:evidence_ref_family_not_allowed:present"));
  assert.doesNotMatch(serialized, /private\.example|raw\/ref/);
}

function testUnsupportedArgsDoNotEchoRawArg() {
  const result = runCli(["--private-token"]);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /^api_runtime_manual_evidence_next=GovernanceBlocked$/m);
  assert.match(result.stdout, /^finding=unsupported_args_count:1$/m);
  assert.doesNotMatch(result.stdout, /private-token/);
}

function testJsonOutputIsPublicSafe() {
  const result = runCli(["--json"]);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.status, 0);
  assert.equal(payload.nextEvidenceKey, "tls_certificate_ready");
  assert.equal(payload.readyForDns, false);
  assert.equal(payload.missingEvidenceRefCount, 4);
  assert.doesNotMatch(result.stdout, /postgres:\/\/|Authorization:|Bearer\s+[A-Za-z0-9]/);
}

testCurrentTemplateReportsTlsNext();
testReporterAdvancesToNextMissingKey();
testCompleteIntakeReportsNone();
testInvalidRefBlocksWithoutEcho();
testUnsupportedArgsDoNotEchoRawArg();
testJsonOutputIsPublicSafe();

console.log("api runtime manual evidence next reporter tests passed");
