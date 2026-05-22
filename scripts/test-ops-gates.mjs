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

function testDefaultCheckReportsBlocked() {
  const result = runGate();
  assertEqual(result.status, 0, "default_status");
  assertIncludes(result.stdout, "ops_gate state=Blocked", "default_stdout_state");
  assertIncludes(result.stdout, "api_provisioning_allowed=false", "default_stdout_api_block");
}

function testExpectBlockedPasses() {
  const result = runGate(["--expect-blocked"]);
  assertEqual(result.status, 0, "expect_blocked_status");
  assertIncludes(result.stdout, "ops_gate state=Blocked", "expect_blocked_stdout_state");
  assertIncludes(result.stdout, "recovery_awaiting_evidence", "expect_blocked_stdout_reason");
}

function testRequireReadyFailsWhileRecoveryIsBlocked() {
  const result = runGate(["--require-ready"]);
  assertEqual(result.status, 1, "require_ready_status");
  assertEqual(result.stdout, "", "require_ready_stdout_empty");
  assertIncludes(result.stderr, "api_provisioning_not_ready", "require_ready_stderr");
}

function testUnsupportedModeFails() {
  const result = runGate(["--invalid-mode"]);
  assertEqual(result.status, 1, "invalid_mode_status");
  assertEqual(result.stdout, "", "invalid_mode_stdout_empty");
  assertIncludes(result.stderr, "unsupported_mode:--invalid-mode", "invalid_mode_stderr");
}

function runTests() {
  testDefaultCheckReportsBlocked();
  testExpectBlockedPasses();
  testRequireReadyFailsWhileRecoveryIsBlocked();
  testUnsupportedModeFails();

  if (failures.length > 0) {
    console.error(failures.join("\n"));
    process.exit(1);
  }

  console.log("ops gate tests passed");
}

runTests();
