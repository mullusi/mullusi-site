/*
Purpose: test safe promotion behavior for the Mullusi recovery witness script.
Governance scope: required confirmation flags, dry-run default, no-write guarantee, and unsupported flag rejection.
Dependencies: Node.js standard library and scripts/promote-recovery-witness.mjs.
Invariants: tests do not promote the real recovery witness and do not inspect private recovery inventories.
*/

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promotedWitnessContent } from "./promote-recovery-witness.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptsDir, "..");
const promoteScript = path.join(scriptsDir, "promote-recovery-witness.mjs");
const witnessPath = path.join(repoRoot, "ops", "recovery-completion-witness.md");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mullusi-promote-test-"));
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

const privateFlagNames = [
  "cloudflare_recovery_saved",
  "github_recovery_saved",
  "google_workspace_recovery_confirmed",
  "namecheap_recovery_confirmed",
  "namecheap_transfer_lock_confirmed",
  "billing_renewal_path_confirmed",
  "private_inventory_complete",
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

function assertNotIncludes(value, expected, label) {
  if (value.includes(expected)) {
    failures.push(`${label}:unexpected=${expected}`);
  }
}

function writePrivateInventoryFixture(fileName, value) {
  const filePath = path.join(tempDir, fileName);
  fs.writeFileSync(
    filePath,
    [
      "# Fixture",
      "```text",
      ...privateFlagNames.map((flag) => `${flag}=${value}`),
      "```",
    ].join("\n"),
    "utf8"
  );
  return filePath;
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

function testPromotionTransformIsPublicSafeAndDeterministic() {
  const original = fs.readFileSync(witnessPath, "utf8");
  const promoted = promotedWitnessContent(original, "2026-06-12");

  assertIncludes(promoted, "recovery_witness_state=ReadyForProvisioning", "transform_ready_state");
  assertIncludes(promoted, "api_provisioning_allowed=true", "transform_api_allowed");
  assertIncludes(promoted, "last_reviewed=2026-06-12", "transform_review_date");
  assertIncludes(promoted, "| Private inventory | Non-secret locations recorded outside Git | Confirmed |", "transform_confirmed_private_inventory");
  assertIncludes(promoted, "command=node scripts/check-private-recovery-inventory.mjs --require-ready --json", "transform_ready_command");
  assertIncludes(promoted, "recoveryInventoryState=ReadyForProvisioning", "transform_private_inventory_ready");
  assertIncludes(promoted, "missingFlags=none", "transform_no_missing_flags");
  assertIncludes(promoted, "The ready state is a public-safe provisioning allowance.", "transform_ready_explanation");
  assertIncludes(promoted, "provision_private_runtime_host", "transform_next_host");
  assertIncludes(promoted, "keep_api_dns_absent_until_pre_dns_evidence_passes", "transform_dns_block");
  assertIncludes(promoted, "Never write these into this file:", "transform_forbidden_section_kept");
  assertNotIncludes(promoted, "recovery_witness_state=AwaitingEvidence", "transform_no_awaiting_state");
  assertNotIncludes(promoted, "api_provisioning_allowed=false", "transform_no_api_block");
}

function testWriteRequiresReadyPrivateInventory() {
  const blockedInventory = writePrivateInventoryFixture("blocked.md", "false");
  const before = fs.readFileSync(witnessPath, "utf8");
  const result = runPromote([...requiredFlags, `--inventory-path=${blockedInventory}`, "--date=2026-05-22", "--write"]);
  const after = fs.readFileSync(witnessPath, "utf8");

  assertEqual(result.status, 1, "write_blocked_inventory_status");
  assertIncludes(result.stderr, "private_recovery_inventory_not_ready", "write_blocked_inventory_stderr");
  assertEqual(after, before, "write_blocked_inventory_no_write");
}

function testUnsupportedFlagFails() {
  const result = runPromote([...requiredFlags, "--unsafe", "--date=2026-05-22"]);
  assertEqual(result.status, 1, "unsupported_flag_status");
  assertEqual(result.stdout, "", "unsupported_flag_stdout_empty");
  assertIncludes(result.stderr, "unsupported_flag_count:1", "unsupported_flag_stderr");
  assertEqual(result.stderr.includes("--unsafe"), false, "unsupported_flag_redacted");
}

function testInvalidDateFails() {
  const result = runPromote([...requiredFlags, "--date=05-22-2026"]);
  assertEqual(result.status, 1, "invalid_date_status");
  assertEqual(result.stdout, "", "invalid_date_stdout_empty");
  assertIncludes(result.stderr, "invalid_review_date", "invalid_date_stderr");
  assertEqual(result.stderr.includes("05-22-2026"), false, "invalid_date_redacted");
}

function testInvalidDateDoesNotEchoPathShapedInput() {
  const rawDate = "D:\\private\\date";
  const result = runPromote([...requiredFlags, `--date=${rawDate}`]);
  assertEqual(result.status, 1, "invalid_path_date_status");
  assertEqual(result.stdout, "", "invalid_path_date_stdout_empty");
  assertIncludes(result.stderr, "invalid_review_date", "invalid_path_date_stderr");
  assertEqual(/D:\\/.test(result.stderr), false, "invalid_path_date_redacted");
}

function runTests() {
  testMissingConfirmationsFail();
  testDryRunDoesNotModifyWitness();
  testPromotionTransformIsPublicSafeAndDeterministic();
  testWriteRequiresReadyPrivateInventory();
  testUnsupportedFlagFails();
  testInvalidDateFails();
  testInvalidDateDoesNotEchoPathShapedInput();

  if (failures.length > 0) {
    console.error(failures.join("\n"));
    process.exit(1);
  }

  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log("recovery witness promotion tests passed");
}

runTests();
