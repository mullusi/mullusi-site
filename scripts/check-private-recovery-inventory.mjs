/*
Purpose: check the ignored Mullusi private recovery inventory without printing private details.
Governance scope: recovery confirmation flags, provisioning readiness, and private-file safety.
Dependencies: Node.js standard library and an ignored recovery inventory file.
Invariants: this script prints or writes only aggregate state and missing flag names; it never prints or writes recovery locations, credentials, codes, or notes.
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const args = process.argv.slice(2);
const failures = [];

const requiredFlags = [
  "cloudflare_recovery_saved",
  "github_recovery_saved",
  "google_workspace_recovery_confirmed",
  "namecheap_recovery_confirmed",
  "namecheap_transfer_lock_confirmed",
  "billing_renewal_path_confirmed",
  "private_inventory_complete",
];

const pathArg = args.find((arg) => arg.startsWith("--path="));
const outputArg = args.find((arg) => arg.startsWith("--output="));
const inventoryPath = path.resolve(repoRoot, pathArg ? pathArg.slice("--path=".length) : "ops/recovery-inventory.private.md");
const outputValue = outputArg ? outputArg.slice("--output=".length) : "";
const outputPath = outputValue ? path.resolve(repoRoot, outputValue) : "";
const requireReady = args.includes("--require-ready");
const allowMissing = args.includes("--allow-missing");
const jsonMode = args.includes("--json");
const helpMode = args.includes("--help") || args.includes("-h");
const supportedArgs = new Set(["--require-ready", "--allow-missing", "--json", "--help", "-h"]);

function usage() {
  return [
    "Usage:",
    "  node scripts/check-private-recovery-inventory.mjs [--path=FILE] [--output=FILE] [--json] [--require-ready] [--allow-missing]",
    "",
    "Checks only boolean confirmation flags and prints no private recovery details.",
  ].join("\n");
}

function recordFailure(message) {
  failures.push(message);
}

function validateArgs() {
  let unsupportedArgCount = 0;
  for (const arg of args) {
    if (arg.startsWith("--path=")) {
      continue;
    }
    if (arg.startsWith("--output=")) {
      if (arg === "--output=") {
        recordFailure("invalid_output_path");
      }
      continue;
    }
    if (!supportedArgs.has(arg)) {
      unsupportedArgCount += 1;
    }
  }
  if (unsupportedArgCount > 0) {
    recordFailure(`unsupported_arg_count:${unsupportedArgCount}`);
  }
}

function writeJsonPayload(payload) {
  const jsonText = `${JSON.stringify(payload, null, 2)}\n`;
  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, jsonText, "utf8");
  }
  if (jsonMode) {
    console.log(jsonText.trimEnd());
  }
}

function resultPayload({ state, missingFlags = [], allowedMissing = false }) {
  return {
    allowMissing,
    allowedMissing,
    inventoryPathState: fs.existsSync(inventoryPath) ? "present" : "missing",
    missingFlags,
    privateValueScan: failures.includes("private_inventory_contains_forbidden_value_pattern") ? "Fail" : "Pass",
    proofState: state === "ReadyForProvisioning" ? "Pass" : "Unknown",
    recoveryInventoryState: state,
    requireReady,
    solverOutcome: state === "ReadyForProvisioning" ? "SolvedVerified" : "AwaitingEvidence",
  };
}

function failurePayload() {
  const awaitingEvidence = failures.every((failure) =>
    failure === "private_recovery_inventory_missing"
    || failure.startsWith("private_recovery_inventory_not_ready:"));
  return {
    allowMissing,
    failures: [...failures],
    inventoryPathState: fs.existsSync(inventoryPath) ? "present" : "missing",
    privateValueScan: failures.includes("private_inventory_contains_forbidden_value_pattern") ? "Fail" : "Pass",
    proofState: awaitingEvidence ? "Unknown" : "Fail",
    recoveryInventoryState: awaitingEvidence ? "Blocked" : "GovernanceBlocked",
    requireReady,
    solverOutcome: awaitingEvidence ? "AwaitingEvidence" : "GovernanceBlocked",
  };
}

function parseFlagValues(content) {
  const values = new Map();
  for (const flag of requiredFlags) {
    const matches = [...content.matchAll(new RegExp(`^${flag}=(true|false)$`, "gm"))];
    if (matches.length !== 1) {
      recordFailure(`flag_missing_or_duplicate:${flag}`);
      continue;
    }
    values.set(flag, matches[0][1] === "true");
  }
  return values;
}

function validatePrivateFileSafety(content) {
  const privateValuePatterns = [
    /g(?:ho|hp|hr|hs)_[A-Za-z0-9_]{20,}/,
    /github_pat_[A-Za-z0-9_]{20,}/,
    /-----BEGIN (?:RSA |OPENSSH |EC |)PRIVATE KEY-----/,
    /postgres(?:ql)?:\/\/[^:\s]+:[^@\s]+@/i,
    /[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{24,}/,
  ];

  for (const pattern of privateValuePatterns) {
    if (pattern.test(content)) {
      recordFailure("private_inventory_contains_forbidden_value_pattern");
    }
  }
}

function runCheck() {
  if (helpMode) {
    console.log(usage());
    return;
  }

  validateArgs();
  if (!fs.existsSync(inventoryPath)) {
    if (allowMissing) {
      writeJsonPayload(resultPayload({ state: "Missing", allowedMissing: true }));
      if (!jsonMode) {
        console.log("private_recovery_inventory state=Missing allowed=true");
      }
      return;
    }
    recordFailure("private_recovery_inventory_missing");
  }

  if (failures.length === 0) {
    const content = fs.readFileSync(inventoryPath, "utf8");
    validatePrivateFileSafety(content);
    const values = parseFlagValues(content);
    const missingFlags = requiredFlags.filter((flag) => values.get(flag) !== true);
    const state = missingFlags.length === 0 ? "ReadyForProvisioning" : "Blocked";

    if (requireReady && state !== "ReadyForProvisioning") {
      recordFailure(`private_recovery_inventory_not_ready:${missingFlags.join(",")}`);
    }

    if (failures.length === 0) {
      writeJsonPayload(resultPayload({ state, missingFlags }));
      if (state === "ReadyForProvisioning") {
        if (!jsonMode) {
          console.log("private_recovery_inventory state=ReadyForProvisioning missing=none");
        }
      } else {
        if (!jsonMode) {
          console.log(`private_recovery_inventory state=Blocked missing=${missingFlags.join(",")}`);
        }
      }
      return;
    }
  }

  writeJsonPayload(failurePayload());
  if (jsonMode) {
    process.exit(1);
  }
  console.error([usage(), "", ...failures].join("\n"));
  process.exit(1);
}

runCheck();
