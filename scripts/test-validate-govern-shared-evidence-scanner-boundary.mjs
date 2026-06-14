/*
Purpose: test the Mullu Govern shared evidence scanner boundary validator.
Governance scope: regression coverage for shared scanner use across Govern preflight validators.
Dependencies: Node.js standard library and scripts/validate-govern-shared-evidence-scanner-boundary.mjs.
Invariants: tests use synthetic source strings or public repository source only; they never read private values.
*/

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatGovernSharedEvidenceScannerBoundaryReport,
  validateGovernSharedEvidenceScannerBoundary,
  validateGovernSharedEvidenceScannerBoundaryForSources,
} from "./validate-govern-shared-evidence-scanner-boundary.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptsDir, "..");
const validatorScript = path.join(scriptsDir, "validate-govern-shared-evidence-scanner-boundary.mjs");

function runValidator(args = []) {
  return spawnSync(process.execPath, [validatorScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function testCurrentBoundaryPasses() {
  const result = validateGovernSharedEvidenceScannerBoundary();
  const report = formatGovernSharedEvidenceScannerBoundaryReport(result);

  assert.equal(result.solverOutcome, "SolvedVerified");
  assert.equal(result.proofState, "Pass");
  assert.equal(result.findingCount, 0);
  assert.equal(result.scannedFileCount > 0, true);
  assert.match(report, /secret_values=not_read/);
}

function testSyntheticLocalScannerFailsClosed() {
  const result = validateGovernSharedEvidenceScannerBoundaryForSources({
    "validate-govern-example.mjs": "const forbiddenEvidencePatterns = [];",
    "validate-govern-other.mjs": "import { scanForbiddenEvidencePatterns } from './govern-live-evidence-ref-contract.mjs';",
  });

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.findingCount, 1);
  assert.match(result.findings.join("\n"), /local_forbidden_evidence_scanner_must_use_shared_contract:validate-govern-example\.mjs/);
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
  assert.match(invalid.stdout, /govern_shared_evidence_scanner_boundary=GovernanceBlocked/);
}

testCurrentBoundaryPasses();
testSyntheticLocalScannerFailsClosed();
testCliJsonAndUnsupportedArgs();

console.log("govern shared evidence scanner boundary tests passed");
