/*
Purpose: test public-safe Mullu Govern live evidence operator request packet generation.
Governance scope: missing-ref request generation, local output confinement, unsupported args, and no-secret reporting.
Dependencies: Node.js standard library and scripts/emit-govern-live-evidence-operator-request.mjs.
Invariants: tests use synthetic public-safe packets and write only ignored .tmp files.
*/

import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildGovernLiveEvidenceOperatorRequest,
  emitGovernLiveEvidenceOperatorRequest,
  formatGovernLiveEvidenceOperatorRequest,
  resolveGovernLiveEvidenceOperatorRequestIntakePath,
} from "./emit-govern-live-evidence-operator-request.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptsDir, "..");
const emitterScript = path.join(scriptsDir, "emit-govern-live-evidence-operator-request.mjs");
const outputPath = ".tmp/test-govern-live-evidence-operator-request.local.json";
const outputAbsolutePath = path.join(repoRoot, outputPath);

function cleanup() {
  fs.rmSync(outputAbsolutePath, { force: true });
}

function statusResult(refs) {
  return {
    refs,
  };
}

function runEmitter(args = []) {
  return spawnSync(process.execPath, [emitterScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function testBuildsMissingRefRequests() {
  const packet = buildGovernLiveEvidenceOperatorRequest(statusResult([
    { key: "operator_approval_ref", status: "missing" },
    { key: "api_contract_test_ref", status: "missing" },
  ]), {
    generatedAtUtc: "2026-06-27T00:00:00Z",
    intakePath: "ops/example.local.json",
  });
  const report = formatGovernLiveEvidenceOperatorRequest(packet);

  assert.equal(packet.solver_outcome, "AwaitingEvidence");
  assert.equal(packet.proof_state, "Unknown");
  assert.equal(packet.public_write_route_allowed, false);
  assert.equal(packet.intake_path, "local_intake");
  assert.equal(packet.missing_ref_count, 2);
  assert.equal(packet.requests.length, 2);
  assert.equal(packet.requests[0].accepted_example, "approval://mullu-govern/live-evidence/2026-06-27/operator-approved");
  assert.equal(packet.requests[1].accepted_example, "github:actions/runs/123:govern-evaluate-contract-live");
  assert.match(report, /request=operator_approval_ref/);
  assert.match(report, /^intake_path=local_intake$/m);
  assert.doesNotMatch(report, /ops\/example\.local\.json/);
  assert.match(report, /accepted_shape=approval:\/\/mullu-govern\/live-evidence\/YYYY-MM-DD\/operator-approved/);
  assert.match(report, /accepted_example=approval:\/\/mullu-govern\/live-evidence\/2026-06-27\/operator-approved/);
  assert.match(report, /secret_values=not_read/);
}

function testCompleteStatusRequestsValidation() {
  const packet = buildGovernLiveEvidenceOperatorRequest(statusResult([
    { key: "operator_approval_ref", status: "candidate" },
  ]), {
    generatedAtUtc: "2026-06-27T00:00:00Z",
  });

  assert.equal(packet.solver_outcome, "SolvedVerified");
  assert.equal(packet.proof_state, "Pass");
  assert.equal(packet.next_action, "run_complete_mode_validation");
  assert.equal(packet.requests.length, 0);
}

function testMissingLocalIntakeFallsBackToCommittedTemplate() {
  const resolvedPath = resolveGovernLiveEvidenceOperatorRequestIntakePath(
    "ops/nonexistent-govern-live-evidence-ref-intake.local.json",
    "ops/mullu-govern-live-evidence-ref-intake-template.json",
  );

  assert.equal(resolvedPath, "ops/mullu-govern-live-evidence-ref-intake-template.json");
  assert.equal(resolvedPath.endsWith(".local.json"), false);
  assert.equal(fs.existsSync(path.join(repoRoot, resolvedPath)), true);
}

function testTemplateIntakePathIsLabeled() {
  const packet = buildGovernLiveEvidenceOperatorRequest(statusResult([]), {
    generatedAtUtc: "2026-06-27T00:00:00Z",
    intakePath: "ops/mullu-govern-live-evidence-ref-intake-template.json",
  });
  const report = formatGovernLiveEvidenceOperatorRequest(packet);

  assert.equal(packet.intake_path, "template_intake");
  assert.match(report, /^intake_path=template_intake$/m);
  assert.doesNotMatch(report, /mullu-govern-live-evidence-ref-intake-template/);
}

function testUnsafeIntakePathIsRedactedInPacket() {
  const packet = buildGovernLiveEvidenceOperatorRequest(statusResult([]), {
    generatedAtUtc: "2026-06-27T00:00:00Z",
    intakePath: "../private-live-evidence.local.json",
  });
  const report = formatGovernLiveEvidenceOperatorRequest(packet);

  assert.equal(packet.intake_path, "redacted_path");
  assert.match(report, /^intake_path=redacted_path$/m);
  assert.doesNotMatch(JSON.stringify(packet), /private-live-evidence/);
  assert.doesNotMatch(report, /private-live-evidence/);
}

function testOutputIsConfined() {
  cleanup();
  const result = emitGovernLiveEvidenceOperatorRequest({
    generatedAtUtc: "2026-06-27T00:00:00Z",
    intakePath: "ops/mullu-govern-live-evidence-ref-intake.local.json",
    outputPath,
  });
  const unsafe = emitGovernLiveEvidenceOperatorRequest({
    outputPath: "ops/tracked-request.json",
  });

  assert.equal(result.writeFinding, "");
  assert.equal(fs.existsSync(outputAbsolutePath), true);
  assert.equal(unsafe.packet.solver_outcome, "GovernanceBlocked");
  assert.equal(unsafe.writeFinding, "output_path_must_be_tmp_or_local_json");
  cleanup();
}

function testCliAndUnsupportedArgs() {
  cleanup();
  const emitted = runEmitter([`--output=${outputPath}`]);
  assert.equal(emitted.status, 0);
  assert.match(emitted.stdout, /govern_live_evidence_operator_request=AwaitingEvidence/);
  assert.equal(fs.existsSync(outputAbsolutePath), true);

  const invalid = runEmitter(["--unknown"]);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stdout, /unsupported_args_count:1/);
  assert.doesNotMatch(invalid.stdout, /--unknown/);
  cleanup();
}

testBuildsMissingRefRequests();
testCompleteStatusRequestsValidation();
testMissingLocalIntakeFallsBackToCommittedTemplate();
testTemplateIntakePathIsLabeled();
testUnsafeIntakePathIsRedactedInPacket();
testOutputIsConfined();
testCliAndUnsupportedArgs();

console.log("govern live evidence operator request tests passed");
