/*
Purpose: test the local Mullu Govern live evidence ref intake initializer.
Governance scope: local-only write boundary, overwrite protection, path confinement, and no-secret output.
Dependencies: Node.js standard library and scripts/init-govern-live-evidence-local-intake.mjs.
Invariants: tests write only ignored .tmp/*.local.json files and remove them after execution.
*/

import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatGovernLiveEvidenceLocalIntakeInitReport,
  initializeGovernLiveEvidenceLocalIntake,
} from "./init-govern-live-evidence-local-intake.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptsDir, "..");
const initializerScript = path.join(scriptsDir, "init-govern-live-evidence-local-intake.mjs");
const fixturePath = path.join(".tmp", "test-govern-live-evidence-ref-intake.local.json");
const fixtureAbsolutePath = path.join(repoRoot, fixturePath);

function cleanup() {
  fs.rmSync(fixtureAbsolutePath, { force: true });
}

function runInitializer(args = []) {
  return spawnSync(process.execPath, [initializerScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function testInitializesIgnoredLocalFile() {
  cleanup();
  const result = initializeGovernLiveEvidenceLocalIntake({ targetPath: fixturePath });
  const report = formatGovernLiveEvidenceLocalIntakeInitReport(result);

  assert.equal(result.solverOutcome, "SolvedVerified");
  assert.equal(result.proofState, "Pass");
  assert.equal(result.initialized, true);
  assert.equal(result.missingApprovalInputCount, 8);
  assert.equal(fs.existsSync(fixtureAbsolutePath), true);
  assert.match(report, /secret_values=not_read/);
  assert.doesNotMatch(report, /postgres:\/\//i);
  cleanup();
}

function testExistingTargetRequiresForce() {
  cleanup();
  fs.mkdirSync(path.dirname(fixtureAbsolutePath), { recursive: true });
  fs.writeFileSync(fixtureAbsolutePath, "{}\n", "utf8");

  const blocked = initializeGovernLiveEvidenceLocalIntake({ targetPath: fixturePath });
  assert.equal(blocked.solverOutcome, "GovernanceBlocked");
  assert.equal(blocked.proofState, "Fail");
  assert.deepEqual(blocked.findings, ["target_exists_requires_force"]);

  const forced = initializeGovernLiveEvidenceLocalIntake({ force: true, targetPath: fixturePath });
  assert.equal(forced.solverOutcome, "SolvedVerified");
  assert.equal(forced.initialized, true);
  cleanup();
}

function testPathBoundaryFailsClosed() {
  const outside = initializeGovernLiveEvidenceLocalIntake({ targetPath: "../secret.local.json" });
  const tracked = initializeGovernLiveEvidenceLocalIntake({ targetPath: "ops/not-local.json" });

  assert.equal(outside.solverOutcome, "GovernanceBlocked");
  assert.deepEqual(outside.findings, ["target_path_outside_repo"]);
  assert.equal(tracked.solverOutcome, "GovernanceBlocked");
  assert.deepEqual(tracked.findings, ["target_must_end_with_local_json"]);
}

function testCliOutputAndUnsupportedArgs() {
  cleanup();
  const created = runInitializer([`--target=${fixturePath}`]);
  assert.equal(created.status, 0);
  assert.match(created.stdout, /govern_live_evidence_local_intake_init=SolvedVerified/);
  assert.match(created.stdout, /missing_approval_input_count=8/);

  const blocked = runInitializer([`--target=${fixturePath}`]);
  assert.equal(blocked.status, 1);
  assert.match(blocked.stdout, /target_exists_requires_force/);

  const invalid = runInitializer(["--unknown"]);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stdout, /unsupported_args_count:1/);
  assert.doesNotMatch(invalid.stdout, /--unknown/);
  cleanup();
}

testInitializesIgnoredLocalFile();
testExistingTargetRequiresForce();
testPathBoundaryFailsClosed();
testCliOutputAndUnsupportedArgs();

console.log("govern live evidence local intake initializer tests passed");
