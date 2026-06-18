/*
Purpose: test the Mullusi operational gate checker.
Governance scope: blocked recovery state, explicit ready requirement, and unsupported mode failure.
Dependencies: Node.js standard library and scripts/check-ops-gates.mjs.
Invariants: tests are read-only and never inspect private recovery inventories.
*/

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const gateScript = path.join(scriptsDir, "check-ops-gates.mjs");
const failures = [];

function runGate(args = []) {
  return spawnSync(process.execPath, [gateScript, ...args], {
    cwd: path.resolve(scriptsDir, ".."),
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

function testDefaultCheckReportsReadyForProvisioning() {
  const result = runGate();
  assertEqual(result.status, 0, "default_status");
  assertIncludes(result.stdout, "ops_gate state=ReadyForProvisioning", "default_stdout_state");
  assertIncludes(result.stdout, "api_provisioning_allowed=true", "default_stdout_api_allowed");
}

function testExpectBlockedFailsAfterRecoveryPromotion() {
  const result = runGate(["--expect-blocked"]);
  assertEqual(result.status, 1, "expect_blocked_status");
  assertEqual(result.stdout, "", "expect_blocked_stdout_empty");
  assertIncludes(result.stderr, "api_provisioning_not_blocked", "expect_blocked_stderr");
}

function testRequireReadyPassesAfterRecoveryPromotion() {
  const result = runGate(["--require-ready"]);
  assertEqual(result.status, 0, "require_ready_status");
  assertIncludes(result.stdout, "ops_gate state=ReadyForProvisioning", "require_ready_stdout_state");
}

function testUnsupportedModeFails() {
  const result = runGate(["--invalid-mode"]);
  assertEqual(result.status, 1, "invalid_mode_status");
  assertEqual(result.stdout, "", "invalid_mode_stdout_empty");
  assertIncludes(result.stderr, "unsupported_mode_count:1", "invalid_mode_stderr");
}

function testUnsupportedModeDoesNotEchoRawInput() {
  const rawMode = "D:\\private\\unsupported-mode";
  const result = runGate([rawMode]);
  assertEqual(result.status, 1, "raw_mode_status");
  assertEqual(result.stdout, "", "raw_mode_stdout_empty");
  assertIncludes(result.stderr, "unsupported_mode_count:1", "raw_mode_stderr_code");
  if (/private|D:\\|unsupported-mode/.test(result.stderr)) {
    failures.push(`raw_mode_stderr_leaked=${result.stderr}`);
  }
}

function runTests() {
  testDefaultCheckReportsReadyForProvisioning();
  testExpectBlockedFailsAfterRecoveryPromotion();
  testRequireReadyPassesAfterRecoveryPromotion();
  testUnsupportedModeFails();
  testUnsupportedModeDoesNotEchoRawInput();

  if (failures.length > 0) {
    console.error(failures.join("\n"));
    process.exit(1);
  }

  console.log("ops gate tests passed");
}

runTests();
