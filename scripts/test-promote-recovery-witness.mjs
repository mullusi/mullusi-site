/*
Purpose: test safe promotion behavior for the Mullusi recovery witness script.
Governance scope: required confirmation flags, dry-run default, no-write guarantee, and unsupported flag rejection.
Dependencies: Node.js standard library and scripts/promote-recovery-witness.mjs.
Invariants: tests do not promote the real recovery witness and do not inspect private recovery inventories.
*/

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptsDir, "..");
const promoteScript = path.join(scriptsDir, "promote-recovery-witness.mjs");
const witnessPath = path.join(repoRoot, "ops", "recovery-completion-witness.md");
const failures = [];

const requiredFlags = [
  "--cloudflare-recovery",
  "--github-recovery",
  "--google-workspace-recovery",
  "--namecheap-recovery",
  "--namecheap-transfer-lock",
  "--billing-renewal",
  "--private-inventory",
];

function runPromote(args = []) {
  return spawnSync(process.execPath, [promoteScript, ...args], {
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

function testMissingConfirmationsFail() {
  const result = runPromote(["--date=2026-05-22"]);
  assertEqual(result.status, 1, "missing_confirmations_status");
  assertIncludes(result.stderr, "missing_confirmation:--cloudflare-recovery", "missing_confirmations_stderr");
  assertIncludes(result.stderr, "Default behavior is dry-run", "missing_confirmations_usage");
}

function testDryRunDoesNotModifyWitness() {
  const before = fs.readFileSync(witnessPath, "utf8");
  const result = runPromote([...requiredFlags, "--date=2026-05-22"]);
  const after = fs.readFileSync(witnessPath, "utf8");

  assertEqual(result.status, 0, "dry_run_status");
  assertIncludes(result.stdout, "recovery_witness_promotable=true", "dry_run_stdout_promotable");
  assertIncludes(result.stdout, "write=false", "dry_run_stdout_write");
  assertEqual(after, before, "dry_run_no_write");
}

function testUnsupportedFlagFails() {
  const result = runPromote([...requiredFlags, "--unsafe", "--date=2026-05-22"]);
  assertEqual(result.status, 1, "unsupported_flag_status");
  assertEqual(result.stdout, "", "unsupported_flag_stdout_empty");
  assertIncludes(result.stderr, "unsupported_flag:--unsafe", "unsupported_flag_stderr");
}

function testInvalidDateFails() {
  const result = runPromote([...requiredFlags, "--date=05-22-2026"]);
  assertEqual(result.status, 1, "invalid_date_status");
  assertEqual(result.stdout, "", "invalid_date_stdout_empty");
  assertIncludes(result.stderr, "invalid_review_date:05-22-2026", "invalid_date_stderr");
}

function runTests() {
  testMissingConfirmationsFail();
  testDryRunDoesNotModifyWitness();
  testUnsupportedFlagFails();
  testInvalidDateFails();

  if (failures.length > 0) {
    console.error(failures.join("\n"));
    process.exit(1);
  }

  console.log("recovery witness promotion tests passed");
}

runTests();
