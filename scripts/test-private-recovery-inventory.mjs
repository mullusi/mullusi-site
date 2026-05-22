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

function runTests() {
  testBlockedFixtureReportsMissingFlags();
  testRequireReadyFailsForBlockedFixture();
  testReadyFixturePassesRequireReady();
  testMissingFileCanBeAllowed();
  testForbiddenPrivatePatternFails();

  fs.rmSync(tempDir, { recursive: true, force: true });

  if (failures.length > 0) {
    console.error(failures.join("\n"));
    process.exit(1);
  }

  console.log("private recovery inventory tests passed");
}

runTests();
