/*
Purpose: verify Mullusi security.txt disclosure metadata before public deployment.
Governance scope: RFC 9116 contact reachability metadata, expiration discipline, canonical policy routing, and public-safe output.
Dependencies: Node.js standard library and .well-known/security.txt.
Invariants: read-only, deterministic under an explicit clock, no DNS mutation, and no secret values are read or printed.
Test contract: run node scripts/test-check-security-txt.mjs.
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const defaultSecurityTxtPath = path.join(repoRoot, ".well-known", "security.txt");
const dayMs = 24 * 60 * 60 * 1000;
const minimumValidityDays = 30;
const maximumValidityDays = 366;
const requiredContacts = ["mailto:support@mullusi.com", "mailto:research@mullusi.com"];
const requiredPolicy = "https://mullusi.com/responsible-disclosure/";
const requiredCanonical = "https://mullusi.com/.well-known/security.txt";
const requiredLanguages = ["en", "am"];
const rfc3339TimestampPattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|z|[+-]\d{2}:\d{2})$/;

function parseSecurityTxt(content) {
  const fields = new Map();
  const parseFindings = [];
  const lines = String(content ?? "").split(/\r?\n/);
  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      parseFindings.push(`field_malformed:line_${index + 1}`);
      continue;
    }
    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();
    if (!key || !value) {
      parseFindings.push(`field_value_missing:line_${index + 1}`);
      continue;
    }
    if (!fields.has(key)) fields.set(key, []);
    fields.get(key).push(value);
  }
  return { fields, parseFindings };
}

function isoDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function daysUntil(expiresAt, now) {
  return Math.floor((expiresAt.getTime() - now.getTime()) / dayMs);
}

function parseClock(value) {
  if (!value) return new Date();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`now_invalid:${value}`);
  }
  return parsed;
}

function isPathInside(parentDirectory, candidatePath) {
  const relativePath = path.relative(parentDirectory, candidatePath);
  return relativePath === "" || (!!relativePath && !relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function resolveSecurityTxtPath(value) {
  const resolvedPath = path.resolve(repoRoot, value);
  if (!isPathInside(repoRoot, resolvedPath)) {
    throw new Error("path_outside_repo");
  }
  if (path.basename(resolvedPath).toLowerCase() !== "security.txt") {
    throw new Error("path_not_security_txt");
  }
  return resolvedPath;
}

function parseRfc3339Timestamp(value) {
  const match = String(value ?? "").match(rfc3339TimestampPattern);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return null;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function evaluateSecurityTxtContent(content, { now = new Date() } = {}) {
  const { fields, parseFindings } = parseSecurityTxt(content);
  const contacts = fields.get("contact") ?? [];
  const policies = fields.get("policy") ?? [];
  const canonicals = fields.get("canonical") ?? [];
  const languages = (fields.get("preferred-languages") ?? [])
    .flatMap((value) => value.split(",").map((item) => item.trim().toLowerCase()))
    .filter(Boolean);
  const expiresValues = fields.get("expires") ?? [];
  const expiresValue = expiresValues[0] ?? "";
  const findings = [...parseFindings];

  for (const contact of requiredContacts) {
    if (!contacts.includes(contact)) findings.push(`contact_missing:${contact}`);
  }
  if (!policies.includes(requiredPolicy)) findings.push("policy_missing");
  if (!canonicals.includes(requiredCanonical)) findings.push("canonical_missing");
  for (const language of requiredLanguages) {
    if (!languages.includes(language)) findings.push(`preferred_language_missing:${language}`);
  }

  let expiresAt = null;
  let remainingDays = -1;
  if (expiresValues.length === 0) {
    findings.push("expires_missing");
  } else if (expiresValues.length > 1) {
    findings.push(`expires_duplicate:${expiresValues.length}`);
  } else {
    expiresAt = parseRfc3339Timestamp(expiresValue);
    if (!expiresAt) {
      findings.push("expires_invalid");
    } else {
      remainingDays = daysUntil(expiresAt, now);
      if (remainingDays < minimumValidityDays) findings.push(`expires_too_soon:${remainingDays}`);
      if (remainingDays > maximumValidityDays) findings.push(`expires_too_far:${remainingDays}`);
    }
  }

  const passed = findings.length === 0;
  return {
    verdict: passed ? "SolvedVerified" : "GovernanceBlocked",
    proofState: passed ? "Pass" : "Fail",
    securityTxtState: passed ? "SolvedVerified" : "GovernanceBlocked",
    contactCount: contacts.length,
    policyCount: policies.length,
    canonicalCount: canonicals.length,
    preferredLanguageCount: languages.length,
    expiresAt: expiresAt ? expiresAt.toISOString() : "missing",
    expiresDaysRemaining: remainingDays,
    minimumValidityDays,
    maximumValidityDays,
    findings,
    observedAt: isoDateOnly(now),
  };
}

export function formatResult(result) {
  const lines = [
    `verdict=${result.verdict}`,
    `proof_state=${result.proofState}`,
    `security_txt_state=${result.securityTxtState}`,
    `observed_at=${result.observedAt}`,
    `expires_at=${result.expiresAt}`,
    `expires_days_remaining=${result.expiresDaysRemaining}`,
    `minimum_validity_days=${result.minimumValidityDays}`,
    `maximum_validity_days=${result.maximumValidityDays}`,
    `contact_count=${result.contactCount}`,
    `policy_count=${result.policyCount}`,
    `canonical_count=${result.canonicalCount}`,
    `preferred_language_count=${result.preferredLanguageCount}`,
  ];
  if (result.findings.length === 0) {
    lines.push("finding=none");
  } else {
    for (const finding of result.findings) lines.push(`finding=${finding}`);
  }
  lines.push("raw_secret_values=not_read");
  return lines.join("\n");
}

function usage() {
  return [
    "Usage:",
    "  node scripts/check-security-txt.mjs [--path=.well-known/security.txt] [--now=YYYY-MM-DD]",
    "",
    "Checks local security.txt disclosure metadata without contacting public infrastructure.",
  ].join("\n");
}

function parseArgs(args) {
  const options = {
    path: defaultSecurityTxtPath,
    now: new Date(),
  };
  for (const arg of args) {
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg.startsWith("--path=")) {
      options.path = resolveSecurityTxtPath(arg.slice("--path=".length));
    } else if (arg.startsWith("--now=")) {
      options.now = parseClock(arg.slice("--now=".length));
    } else {
      throw new Error(`unsupported_arg:${arg}`);
    }
  }
  return options;
}

function runCli() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.log(`verdict=GovernanceBlocked\nproof_state=Fail\nerror=${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return;
  }
  if (options.help) {
    console.log(usage());
    return;
  }
  const content = fs.readFileSync(options.path, "utf8");
  const result = evaluateSecurityTxtContent(content, { now: options.now });
  console.log(formatResult(result));
  if (result.proofState !== "Pass") process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
