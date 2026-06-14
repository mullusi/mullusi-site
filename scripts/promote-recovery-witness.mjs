/*
Purpose: safely promote the Mullusi recovery completion witness after manual recovery checks.
Governance scope: recovery confirmation flags, public-safe witness update, API provisioning permission, and dry-run default.
Dependencies: Node.js standard library and ops/recovery-completion-witness.md.
Invariants: this script never accepts or writes recovery codes, passwords, API keys, database URLs, host addresses, billing details, or private storage paths.
*/

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const witnessPath = path.join(repoRoot, "ops", "recovery-completion-witness.md");

const requiredFlags = [
  "--cloudflare-recovery",
  "--github-recovery",
  "--google-workspace-recovery",
  "--namecheap-recovery",
  "--namecheap-transfer-lock",
  "--billing-renewal",
  "--private-inventory",
];

const args = new Set(process.argv.slice(2).filter((arg) => !arg.startsWith("--date=") && !arg.startsWith("--inventory-path=")));
const dateArg = process.argv.slice(2).find((arg) => arg.startsWith("--date="));
const inventoryPathArg = process.argv.slice(2).find((arg) => arg.startsWith("--inventory-path="));
const reviewDate = dateArg ? dateArg.slice("--date=".length) : new Date().toISOString().slice(0, 10);
const inventoryPath = inventoryPathArg ? inventoryPathArg.slice("--inventory-path=".length) : "ops/recovery-inventory.private.md";
const writeMode = args.has("--write");
const helpMode = args.has("--help") || args.has("-h");
const failures = [];

function usage() {
  return [
    "Usage:",
    "  node scripts/promote-recovery-witness.mjs [required confirmations] [--date=YYYY-MM-DD] [--inventory-path=FILE] [--write]",
    "",
    "Required confirmations:",
    ...requiredFlags.map((flag) => `  ${flag}`),
    "",
    "Default behavior is dry-run. Add --write only after manual recovery checks are complete.",
  ].join("\n");
}

function recordFailure(message) {
  failures.push(message);
}

function validateArgs() {
  const allowedFlags = new Set([...requiredFlags, "--write", "--help", "-h"]);
  for (const arg of args) {
    if (!allowedFlags.has(arg)) {
      recordFailure(`unsupported_flag:${arg}`);
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewDate)) {
    recordFailure(`invalid_review_date:${reviewDate}`);
  }
  if (inventoryPathArg && inventoryPath.trim().length === 0) {
    recordFailure("inventory_path_empty");
  }
  for (const flag of requiredFlags) {
    if (!args.has(flag)) {
      recordFailure(`missing_confirmation:${flag}`);
    }
  }
}

export function promotedWitnessContent(originalContent, reviewDateValue = reviewDate) {
  let content = originalContent;
  content = content.replace("recovery_witness_state=AwaitingEvidence", "recovery_witness_state=ReadyForProvisioning");
  content = content.replace("api_provisioning_allowed=false", "api_provisioning_allowed=true");
  content = content.replace(/last_reviewed=\d{4}-\d{2}-\d{2}/, `last_reviewed=${reviewDateValue}`);
  content = content.replaceAll("| AwaitingEvidence |", "| Confirmed |");
  content = content.replace(
    /This state is intentionally blocked until the private recovery inventory is\r?\nfilled outside Git and the operator confirms each root recovery path\./,
    "This state means the private recovery inventory exists outside Git and the\noperator has confirmed each root recovery path."
  );
  content = content.replace(
    /This state is intentionally blocked until the ignored private recovery inventory\r?\nhas all required confirmation flags set to `true` after the operator confirms\r?\neach root recovery path outside Git\./,
    "This state means the ignored private recovery inventory has all required\nconfirmation flags set to `true` after the operator confirmed each root\nrecovery path outside Git."
  );
  content = content.replace("Observed on 2026-06-12:", `Observed on ${reviewDateValue}:`);
  content = content.replace(
    "command=node scripts/check-private-recovery-inventory.mjs --json",
    "command=node scripts/check-private-recovery-inventory.mjs --require-ready --json"
  );
  content = content.replace("recoveryInventoryState=Blocked", "recoveryInventoryState=ReadyForProvisioning");
  content = content.replace("proofState=Unknown", "proofState=Pass");
  content = content.replace("solverOutcome=AwaitingEvidence", "solverOutcome=SolvedVerified");
  content = content.replace(
    /missingFlags=cloudflare_recovery_saved,github_recovery_saved,google_workspace_recovery_confirmed,namecheap_recovery_confirmed,namecheap_transfer_lock_confirmed,billing_renewal_path_confirmed,private_inventory_complete/,
    "missingFlags=none"
  );
  content = content.replace(
    /The blocked state is a public-safe blocker\. The ignored private inventory exists\r?\nlocally, but it is not ready for recovery witness promotion\. The public witness\r?\nrecords only aggregate flag names and never replaces the private inventory\./,
    "The ready state is a public-safe provisioning allowance. The public witness\nrecords only aggregate flag names and never replaces the private inventory."
  );
  content = content.replace(
    "While `api_provisioning_allowed=false`, the next actions are limited to:",
    "When `api_provisioning_allowed=true`, the next actions are limited to:"
  );
  content = content.replace(
    /complete_private_recovery_inventory\r?\nconfirm_namecheap_transfer_lock\r?\nconfirm_google_workspace_recovery\r?\nconfirm_github_recovery_codes\r?\nconfirm_cloudflare_recovery_codes\r?\nconfirm_billing_renewal_path/,
    [
      "provision_private_runtime_host",
      "provision_managed_postgresql",
      "create_production_secret_store",
      "run_api_production_readiness_gate",
      "keep_api_dns_absent_until_pre_dns_evidence_passes",
    ].join("\n")
  );
  content = content.replace(
    /Do not provision production host\/database and do not create `api` DNS until this\r?\nwitness is promoted\./,
    "Do not create `api` DNS until host, database, secret, TLS, and pre-DNS\nevidence pass."
  );
  content = content.replace(
    "Open issues: all recovery witnesses remain AwaitingEvidence",
    "Open issues: host/database provisioning still pending"
  );
  content = content.replace(
    "Open issues: all private recovery confirmation flags remain AwaitingEvidence",
    "Open issues: host/database provisioning still pending"
  );
  content = content.replace(
    "Next action: complete private recovery inventory outside Git, then promote this witness only after manual confirmation",
    "Next action: provision private host and managed PostgreSQL, then run the API production readiness gate"
  );
  return content;
}

function validatePrivateInventoryReady() {
  const result = spawnSync(
    process.execPath,
    [
      path.join(repoRoot, "scripts", "check-private-recovery-inventory.mjs"),
      `--path=${inventoryPath}`,
      "--require-ready",
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
    }
  );
  if (result.status !== 0) {
    recordFailure("private_recovery_inventory_not_ready");
    const safeDetail = result.stderr.trim().split(/\r?\n/).filter((line) => line.startsWith("private_recovery_inventory_not_ready:"));
    for (const line of safeDetail) {
      recordFailure(line);
    }
  }
}

function runPromotion() {
  if (helpMode) {
    console.log(usage());
    return;
  }

  validateArgs();
  if (failures.length > 0) {
    console.error([usage(), "", ...failures].join("\n"));
    process.exit(1);
  }

  if (writeMode) {
    validatePrivateInventoryReady();
    if (failures.length > 0) {
      console.error([usage(), "", ...failures].join("\n"));
      process.exit(1);
    }
  }

  const originalContent = fs.readFileSync(witnessPath, "utf8");
  const nextContent = promotedWitnessContent(originalContent, reviewDate);

  if (nextContent === originalContent) {
    console.error("witness_already_promoted_or_unexpected_shape");
    process.exit(1);
  }

  if (!writeMode) {
    console.log(`recovery_witness_promotable=true write=false review_date=${reviewDate}`);
    return;
  }

  fs.writeFileSync(witnessPath, nextContent, "utf8");
  console.log(`recovery_witness_promoted=true write=true review_date=${reviewDate}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPromotion();
}
