/*
Purpose: safely promote Mullusi domain-hardening preflight after public-safe admin evidence is confirmed.
Governance scope: confirmation flags, derived mutation permissions, dry-run default, and secret-free DNS/email hardening state.
Dependencies: Node.js standard library, ops/domain-security-preflight.md, and scripts/check-domain-hardening-preflight.mjs.
Invariants: this script never accepts or writes DKIM keys, DNS target values, provider account IDs, tokens, credentials, report payloads, or raw DNS values.
*/

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");

const confirmationFlags = [
  {
    flag: "--active-cloudflare-ca-set",
    key: "active_cloudflare_ca_set",
    description: "Cloudflare active edge certificate CA set confirmed from admin/API readback.",
  },
  {
    flag: "--cloudflare-ca-source",
    key: "cloudflare_ca_source",
    description: "CAA candidate source confirmed from current Cloudflare documentation or managed CAA readback.",
  },
  {
    flag: "--dns-write-authority",
    key: "dns_write_authority",
    description: "Operator has bounded Cloudflare DNS write authority for the zone.",
  },
  {
    flag: "--sender-inventory",
    key: "sender_inventory",
    description: "All legitimate mail senders are inventoried with owners.",
  },
  {
    flag: "--google-dkim-selector",
    key: "google_workspace_dkim_selector",
    description: "Google Workspace DKIM selector is generated and safe to publish.",
  },
  {
    flag: "--dmarc-report-mailbox",
    key: "dmarc_report_mailbox",
    description: "DMARC aggregate report destination exists and is monitored.",
  },
  {
    flag: "--mta-sts-host",
    key: "mta_sts_https_policy_host",
    description: "MTA-STS HTTPS policy host exists with valid TLS and policy path.",
  },
  {
    flag: "--tls-rpt-mailbox",
    key: "tls_rpt_report_mailbox",
    description: "TLS-RPT destination exists and is monitored.",
  },
];

const permissionRules = [
  {
    key: "manual_caa_allowed",
    dependencies: ["active_cloudflare_ca_set", "cloudflare_ca_source", "dns_write_authority"],
  },
  {
    key: "dkim_publication_allowed",
    dependencies: ["google_workspace_dkim_selector", "dns_write_authority"],
  },
  {
    key: "spf_hardfail_allowed",
    dependencies: ["sender_inventory", "dns_write_authority"],
  },
  {
    key: "dmarc_enforcement_allowed",
    dependencies: ["sender_inventory", "dmarc_report_mailbox", "dns_write_authority"],
  },
  {
    key: "mta_sts_enforce_allowed",
    dependencies: ["mta_sts_https_policy_host", "dns_write_authority"],
  },
  {
    key: "tls_rpt_publication_allowed",
    dependencies: ["tls_rpt_report_mailbox", "dns_write_authority"],
  },
];

const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs.filter((arg) => !arg.startsWith("--date=") && !arg.startsWith("--path=")));
const dateArg = rawArgs.find((arg) => arg.startsWith("--date="));
const pathArg = rawArgs.find((arg) => arg.startsWith("--path="));
const reviewDate = dateArg ? dateArg.slice("--date=".length) : new Date().toISOString().slice(0, 10);
const preflightPath = path.resolve(repoRoot, pathArg ? pathArg.slice("--path=".length) : "ops/domain-security-preflight.md");
const writeMode = args.has("--write");
const helpMode = args.has("--help") || args.has("-h");
const failures = [];
const hasEvidencePromotion = confirmationFlags.some((item) => args.has(item.flag));

function usage() {
  return [
    "Usage:",
    "  node scripts/promote-domain-hardening-preflight.mjs [confirmation flags] [--date=YYYY-MM-DD] [--path=FILE] [--write]",
    "",
    "Confirmation flags:",
    ...confirmationFlags.map((item) => `  ${item.flag}  ${item.description}`),
    "",
    "Default behavior is dry-run. Add --write only after admin evidence is confirmed.",
    "Mutation permissions are derived from evidence flags; permission flags are not accepted.",
  ].join("\n");
}

function recordFailure(message) {
  failures.push(message);
}

function validateArgs() {
  const allowedFlags = new Set([...confirmationFlags.map((item) => item.flag), "--write", "--help", "-h"]);
  const unsupportedFlags = [...args].filter((arg) => !allowedFlags.has(arg));
  if (unsupportedFlags.length > 0) {
    recordFailure(`unsupported_flag_count:${unsupportedFlags.length}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewDate)) {
    recordFailure(`invalid_review_date:${reviewDate}`);
  }
}

function lineValue(content, key) {
  const match = content.match(new RegExp(`^${key}=([^\\s]+)$`, "m"));
  return match?.[1] ?? "";
}

function setLineValue(content, key, value) {
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (!pattern.test(content)) {
    throw new Error(`preflight_key_missing:${key}`);
  }
  return content.replace(pattern, `${key}=${value}`);
}

function nextPreflightContent(originalContent) {
  if (!hasEvidencePromotion) {
    return originalContent;
  }

  let content = originalContent;
  const evidenceState = {};

  for (const item of confirmationFlags) {
    const currentValue = lineValue(content, item.key);
    const nextValue = args.has(item.flag) ? "Pass" : currentValue || "AwaitingEvidence";
    evidenceState[item.key] = nextValue;
    content = setLineValue(content, item.key, nextValue);
  }

  for (const rule of permissionRules) {
    const allowed = rule.dependencies.every((dependency) => evidenceState[dependency] === "Pass");
    content = setLineValue(content, rule.key, allowed ? "true" : "false");
  }

  const allEvidencePass = confirmationFlags.every((item) => evidenceState[item.key] === "Pass");
  content = setLineValue(content, "domain_hardening_preflight", allEvidencePass ? "SolvedVerified" : "GovernanceBlocked");

  content = content.replace(
    /Next action: .*/,
    allEvidencePass
      ? "Next action: run scripts/check-domain-hardening-preflight.mjs --require-ready, then execute ops/domain-security-hardening-runbook.md in order"
      : "Next action: fill only public-safe Pass/AwaitingEvidence states after admin-console confirmation, then run scripts/check-domain-hardening-preflight.mjs --require-ready",
  );
  content = content.replace(
    /Open issues: .*/,
    allEvidencePass
      ? "Open issues: none for preflight; execute DNS hardening in bounded runbook order"
      : "Open issues: Cloudflare CA set, DNS write authority, sender inventory, Google DKIM selector, report mailboxes, MTA-STS host",
  );
  content = content.replace(
    /Self-attested invariants: .*/,
    allEvidencePass
      ? "Self-attested invariants: mutation permissions derived from evidence, raw secrets not recorded, preflight ready"
      : "Self-attested invariants: mutation permissions are derived from evidence, raw secrets not recorded, external evidence requirements explicit",
  );
  content = content.replace(
    /Completeness: \d+%/,
    allEvidencePass ? "Completeness: 100%" : "Completeness: 100%",
  );
  content = content.replace(
    /last_promoted=\d{4}-\d{2}-\d{2}|last_promoted=AwaitingEvidence/,
    `last_promoted=${reviewDate}`,
  );

  return content;
}

function runPreflightCheck(mode) {
  return spawnSync(process.execPath, [
    path.join(repoRoot, "scripts", "check-domain-hardening-preflight.mjs"),
    mode,
    `--path=${preflightPath}`,
  ], {
    cwd: repoRoot,
    encoding: "utf8",
  });
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

  const originalContent = fs.readFileSync(preflightPath, "utf8");
  const nextContent = nextPreflightContent(originalContent);
  if (nextContent === originalContent) {
    console.log(`domain_hardening_preflight_promotable=false write=false review_date=${reviewDate}`);
    return;
  }

  if (!writeMode) {
    console.log(`domain_hardening_preflight_promotable=true write=false review_date=${reviewDate}`);
    return;
  }

  fs.writeFileSync(preflightPath, nextContent, "utf8");
  const checkMode = lineValue(nextContent, "domain_hardening_preflight") === "SolvedVerified"
    ? "--require-ready"
    : "--expect-blocked";
  const result = runPreflightCheck(checkMode);
  if (result.status !== 0) {
    fs.writeFileSync(preflightPath, originalContent, "utf8");
    console.error(`domain_hardening_preflight_validation_failed:${checkMode}`);
    console.error(result.stdout.trim() || result.stderr.trim());
    process.exit(1);
  }
  console.log(`domain_hardening_preflight_promoted=true write=true review_date=${reviewDate}`);
}

runPromotion();
