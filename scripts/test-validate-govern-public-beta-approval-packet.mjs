/*
Purpose: test the Mullu Govern public-beta approval packet validator.
Governance scope: fail-closed public write-route approval state, missing evidence refs, unsupported args, and no-secret pattern rejection.
Dependencies: Node.js standard library and scripts/validate-govern-public-beta-approval-packet.mjs.
Invariants: tests use synthetic packet content only and never inspect provider dashboards or private values.
*/

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatApprovalPacketReport,
  validateGovernPublicBetaApprovalPacket,
} from "./validate-govern-public-beta-approval-packet.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptsDir, "..");
const validatorScript = path.join(scriptsDir, "validate-govern-public-beta-approval-packet.mjs");

function runValidator(args = []) {
  return spawnSync(process.execPath, [validatorScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function testCurrentPacketPassesAsNonOperative() {
  const result = validateGovernPublicBetaApprovalPacket();
  const report = formatApprovalPacketReport(result);

  assert.equal(result.solverOutcome, "SolvedVerified");
  assert.equal(result.proofState, "Pass");
  assert.equal(result.packetState, "AwaitingEvidence");
  assert.equal(result.approvalState, "NotApproved");
  assert.equal(result.publicWriteRouteAllowed, false);
  assert.equal(result.missingApprovalInputs.length, 9);
  assert.equal(result.findings.length, 0);
  assert.match(report, /secret_values=not_recorded/);
}

function testCliJsonAndUnsupportedArgs() {
  const jsonResult = runValidator(["--json"]);
  const payload = JSON.parse(jsonResult.stdout);
  assert.equal(jsonResult.status, 0);
  assert.equal(payload.solverOutcome, "SolvedVerified");
  assert.equal(payload.proofState, "Pass");

  const invalid = runValidator(["--unknown"]);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stdout, /unsupported_args:--unknown/);
  assert.match(invalid.stdout, /govern_public_beta_approval_packet=GovernanceBlocked/);
}

testCurrentPacketPassesAsNonOperative();
testCliJsonAndUnsupportedArgs();

console.log("govern public-beta approval packet validator tests passed");
