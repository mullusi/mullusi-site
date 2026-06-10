/*
Purpose: test the private recovery inventory checker with temporary fixtures.
Governance scope: blocked flags, ready flags, missing-file allowance, required-ready failure, and private-value rejection.
Dependencies: Node.js standard library and scripts/check-private-recovery-inventory.mjs.
Invariants: tests use temporary files only and never inspect the operator's ignored private recovery inventory.
*/

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptsDir, "..");
const checkerScript = path.join(scriptsDir, "check-private-recovery-inventory.mjs");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mullusi-recovery-test-"));
const failures = [];

const flagNames = [
  "cloudflare_recovery_saved",
  "github_recovery_saved",
  "google_workspace_recovery_confirmed",
  "namecheap_recovery_confirmed",
  "namecheap_transfer_lock_confirmed",
  "billing_renewal_path_confirmed",
  "private_inventory_complete",
];

function fixtureContent(value) {
  return [
    "# Fixture",
    "```text",
    ...flagNames.map((flag) => `${flag}=${value}`),
    "```",
  ].join("\n");
}

function writeFixture(fileName, content) {
  const filePath = path.join(tempDir, fileName);
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

function runChecker(args = []) {
  return spawnSync(process.execPath, [checkerScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    failures.push(`${label}:expected=${expected}:actual=${actual}`);
  }
}

function assertIncludes(value, expected, label) {
  if (!value.includes(expected)) {
    failures.push(`${label}:missing=${expected}`);
  }
}

function assertDeepEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(`${label}:expected=${JSON.stringify(expected)}:actual=${JSON.stringify(actual)}`);
  }
}

function testBlockedFixtureReportsMissingFlags() {
  const fixture = writeFixture("blocked.md", fixtureContent("false"));
  const result = runChecker([`--path=${fixture}`]);

  assertEqual(result.status, 0, "blocked_status");
  assertIncludes(result.stdout, "private_recovery_inventory state=Blocked", "blocked_stdout_state");
  assertIncludes(result.stdout, "cloudflare_recovery_saved", "blocked_stdout_missing");
}

function testRequireReadyFailsForBlockedFixture() {
  const fixture = writeFixture("blocked-required.md", fixtureContent("false"));
  const result = runChecker([`--path=${fixture}`, "--require-ready"]);

  assertEqual(result.status, 1, "require_ready_blocked_status");
  assertEqual(result.stdout, "", "require_ready_blocked_stdout_empty");
  assertIncludes(result.stderr, "private_recovery_inventory_not_ready", "require_ready_blocked_stderr");
}

function testReadyFixturePassesRequireReady() {
  const fixture = writeFixture("ready.md", fixtureContent("true"));
  const result = runChecker([`--path=${fixture}`, "--require-ready"]);

  assertEqual(result.status, 0, "ready_status");
  assertIncludes(result.stdout, "private_recovery_inventory state=ReadyForProvisioning", "ready_stdout_state");
  assertIncludes(result.stdout, "missing=none", "ready_stdout_missing");
}

function testMissingFileCanBeAllowed() {
  const missingPath = path.join(tempDir, "missing.md");
  const result = runChecker([`--path=${missingPath}`, "--allow-missing"]);

  assertEqual(result.status, 0, "missing_allowed_status");
  assertIncludes(result.stdout, "private_recovery_inventory state=Missing allowed=true", "missing_allowed_stdout");
  assertEqual(result.stderr, "", "missing_allowed_stderr_empty");
}

function testForbiddenPrivatePatternFails() {
  const forbidden = ["g", "ho_", "A".repeat(24)].join("");
  const fixture = writeFixture("forbidden.md", `${fixtureContent("true")}\n${forbidden}\n`);
  const result = runChecker([`--path=${fixture}`]);

  assertEqual(result.status, 1, "forbidden_status");
  assertEqual(result.stdout, "", "forbidden_stdout_empty");
  assertIncludes(result.stderr, "private_inventory_contains_forbidden_value_pattern", "forbidden_stderr");
}

function testJsonModeReportsPublicSafeAggregateOnly() {
  const fixture = writeFixture("blocked-json.md", fixtureContent("false"));
  const result = runChecker([`--path=${fixture}`, "--json"]);
  const payload = JSON.parse(result.stdout);

  assertEqual(result.status, 0, "json_blocked_status");
  assertEqual(payload.recoveryInventoryState, "Blocked", "json_blocked_state");
  assertEqual(payload.solverOutcome, "AwaitingEvidence", "json_blocked_solver");
  assertEqual(payload.proofState, "Unknown", "json_blocked_proof_state");
  assertIncludes(payload.missingFlags.join(","), "cloudflare_recovery_saved", "json_blocked_missing");
  assertEqual(payload.privateValueScan, "Pass", "json_blocked_private_scan");
  assertEqual(result.stderr, "", "json_blocked_stderr_empty");
}

function testJsonOutputFilePersistsRequireReadyFailure() {
  const fixture = writeFixture("blocked-output.md", fixtureContent("false"));
  const outputPath = path.join(tempDir, "blocked-output.json");
  const result = runChecker([`--path=${fixture}`, `--output=${outputPath}`, "--require-ready"]);
  const payload = JSON.parse(fs.readFileSync(outputPath, "utf8"));

  assertEqual(result.status, 1, "json_output_require_ready_status");
  assertEqual(result.stdout, "", "json_output_require_ready_stdout_empty");
  assertEqual(payload.recoveryInventoryState, "Blocked", "json_output_require_ready_state");
  assertEqual(payload.solverOutcome, "AwaitingEvidence", "json_output_require_ready_solver");
  assertDeepEqual(
    payload.failures,
    [`private_recovery_inventory_not_ready:${flagNames.join(",")}`],
    "json_output_require_ready_failures",
  );
}

function testJsonModeFailureDoesNotEmitTextDiagnostics() {
  const missingPath = path.join(tempDir, "missing-json.md");
  const result = runChecker([`--path=${missingPath}`, "--json"]);
  const payload = JSON.parse(result.stdout);

  assertEqual(result.status, 1, "json_missing_status");
  assertEqual(payload.recoveryInventoryState, "Blocked", "json_missing_state");
  assertEqual(payload.failures[0], "private_recovery_inventory_missing", "json_missing_failure");
  assertEqual(result.stderr, "", "json_missing_stderr_empty");
}

function testEmptyOutputPathIsRejectedBeforeWrite() {
  const fixture = writeFixture("blocked-empty-output.md", fixtureContent("false"));
  const result = runChecker([`--path=${fixture}`, "--json", "--output="]);
  const payload = JSON.parse(result.stdout);

  assertEqual(result.status, 1, "empty_output_status");
  assertEqual(payload.recoveryInventoryState, "GovernanceBlocked", "empty_output_state");
  assertEqual(payload.failures[0], "invalid_output_path", "empty_output_failure");
  assertEqual(result.stderr, "", "empty_output_stderr_empty");
}

function runTests() {
  testBlockedFixtureReportsMissingFlags();
  testRequireReadyFailsForBlockedFixture();
  testReadyFixturePassesRequireReady();
  testMissingFileCanBeAllowed();
  testForbiddenPrivatePatternFails();
  testJsonModeReportsPublicSafeAggregateOnly();
  testJsonOutputFilePersistsRequireReadyFailure();
  testJsonModeFailureDoesNotEmitTextDiagnostics();
  testEmptyOutputPathIsRejectedBeforeWrite();

  fs.rmSync(tempDir, { recursive: true, force: true });

  if (failures.length > 0) {
    console.error(failures.join("\n"));
    process.exit(1);
  }

  console.log("private recovery inventory tests passed");
}

runTests();
