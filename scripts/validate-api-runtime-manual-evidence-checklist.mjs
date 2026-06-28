/*
Purpose: validate the public-safe manual evidence checklist for api.mullusi.com pre-DNS runtime readiness.
Governance scope: 13 manual runtime evidence rows, public-safe evidence refs, DNS denial while evidence is missing, and private-value exclusion.
Dependencies: Node.js standard library, ops/api-runtime-manual-evidence-checklist.md, scripts/check-api-production-readiness.mjs, and scripts/govern-live-evidence-ref-contract.mjs.
Invariants: deterministic repository-local validation; no secret values, host addresses, database URLs, DNS targets, provider account IDs, raw headers, or raw provider payloads are printed.
Test contract: run node scripts/test-validate-api-runtime-manual-evidence-checklist.mjs.
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readinessFlags } from "./check-api-production-readiness.mjs";
import {
  scanForbiddenEvidencePatterns,
  validatePublicSafeEvidenceRef,
} from "./govern-live-evidence-ref-contract.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const checklistPath = "ops/api-runtime-manual-evidence-checklist.md";
const expectedEvidenceKeys = Object.freeze(readinessFlags.map(({ key }) => key));
const allowedEvidenceStates = new Set(["AwaitingEvidence", "Pass"]);

const forbiddenChecklistPatterns = Object.freeze([
  { label: "host_address_assignment", pattern: /^host_address\s*=/im },
  { label: "database_url_assignment", pattern: /^database_url\s*=/im },
  { label: "dns_target_assignment", pattern: /^dns_target\s*=/im },
  { label: "provider_account_assignment", pattern: /^provider_account(?:_id)?\s*=/im },
  { label: "raw_secret_assignment", pattern: /^(?:secret|token|password|api_key|private_key)\s*=/im },
  { label: "raw_message_header", pattern: /^(?:Authentication-Results|DKIM-Signature|Received|Return-Path):/im },
  { label: "raw_ipv4_address", pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/ },
  { label: "raw_ipv6_address", pattern: /\b(?:[A-Fa-f0-9]{1,4}:){2,}[A-Fa-f0-9]{1,4}\b/ },
]);

function readUtf8(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function safeFindingLabel(value) {
  return String(value ?? "").replace(/[^A-Za-z0-9_.:-]+/g, "_").slice(0, 96) || "missing";
}

function parseEvidenceRows(content) {
  const rows = [];
  const rowPattern = /^evidence_item=([a-z0-9_]+)\s+state=([A-Za-z]+)\s+public_safe_ref=([^\s]+)\s+private_value_storage=([a-z0-9_]+)$/gm;
  let match = rowPattern.exec(content);
  while (match) {
    rows.push({
      key: match[1],
      state: match[2],
      publicSafeRef: match[3],
      privateValueStorage: match[4],
    });
    match = rowPattern.exec(content);
  }
  return rows;
}

function validatePrivateValueBoundary(content) {
  const findings = [...scanForbiddenEvidencePatterns("apiRuntimeManualEvidenceChecklist", content)];
  for (const { label, pattern } of forbiddenChecklistPatterns) {
    if (pattern.test(content)) {
      findings.push(`forbidden_private_value_pattern:apiRuntimeManualEvidenceChecklist:${label}`);
    }
  }
  return findings;
}

export function evaluateApiRuntimeManualEvidenceChecklist(content) {
  const hardFindings = validatePrivateValueBoundary(content);
  const rows = parseEvidenceRows(content);
  const rowsByKey = new Map();

  for (const row of rows) {
    if (rowsByKey.has(row.key)) hardFindings.push(`manual_evidence_duplicate:${safeFindingLabel(row.key)}`);
    rowsByKey.set(row.key, row);
  }

  for (const key of expectedEvidenceKeys) {
    if (!rowsByKey.has(key)) hardFindings.push(`manual_evidence_missing_row:${key}`);
  }

  for (const row of rows) {
    if (!expectedEvidenceKeys.includes(row.key)) {
      hardFindings.push(`manual_evidence_unexpected_row:${safeFindingLabel(row.key)}`);
      continue;
    }
    if (!allowedEvidenceStates.has(row.state)) {
      hardFindings.push(`manual_evidence_state_invalid:${row.key}`);
    }
    if (row.privateValueStorage !== "outside_git") {
      hardFindings.push(`manual_evidence_private_storage_invalid:${row.key}`);
    }
    const refResult = validatePublicSafeEvidenceRef(row.publicSafeRef, { allowMissing: row.state === "AwaitingEvidence" });
    if (row.state === "Pass" && refResult.isMissing) {
      hardFindings.push(`manual_evidence_pass_ref_missing:${row.key}`);
    }
    if (!refResult.valid) {
      hardFindings.push(...refResult.findings.map((finding) => `manual_evidence_ref_invalid:${row.key}:${finding}`));
    }
  }

  const missingEvidence = expectedEvidenceKeys.filter((key) => {
    const row = rowsByKey.get(key);
    return !row || row.state !== "Pass";
  });
  const allRowsPresent = expectedEvidenceKeys.every((key) => rowsByKey.has(key));
  const allRowsPass = allRowsPresent && missingEvidence.length === 0;
  const contractPass = hardFindings.length === 0;
  const checklistState = contractPass && allRowsPass ? "SolvedVerified" : "AwaitingEvidence";

  return {
    apiRuntimeManualEvidenceChecklist: checklistState,
    solverOutcome: contractPass && allRowsPass ? "SolvedVerified" : "AwaitingEvidence",
    proofState: contractPass && allRowsPass ? "Pass" : "Unknown",
    apiDnsPublicationAllowed: contractPass && allRowsPass,
    manualEvidenceItemCount: expectedEvidenceKeys.length,
    manualEvidenceObservedCount: rows.length,
    manualEvidenceMissing: missingEvidence,
    hardFindings,
    secretBoundary: hardFindings.some((finding) => finding.includes("forbidden_private_value_pattern")) ? "Fail" : "Pass",
    checklistContract: hardFindings.length === 0 ? "Pass" : "Fail",
  };
}

export function formatApiRuntimeManualEvidenceChecklistResult(result) {
  const findingLines = result.hardFindings.length > 0
    ? result.hardFindings.map((finding) => `finding=${finding}`)
    : ["finding=none"];
  const blockerLines = result.manualEvidenceMissing.length > 0
    ? result.manualEvidenceMissing.map((key) => `blocker=manual_evidence_missing:${key}`)
    : ["blocker=none"];
  return [
    `api_runtime_manual_evidence_checklist=${result.apiRuntimeManualEvidenceChecklist}`,
    `solver_outcome=${result.solverOutcome}`,
    `proof_state=${result.proofState}`,
    `api_dns_publication_allowed=${result.apiDnsPublicationAllowed ? "true" : "false"}`,
    `manual_evidence_item_count=${result.manualEvidenceItemCount}`,
    `manual_evidence_observed_count=${result.manualEvidenceObservedCount}`,
    `manual_evidence_missing_count=${result.manualEvidenceMissing.length}`,
    `checklist_contract=${result.checklistContract}`,
    `secret_boundary=${result.secretBoundary}`,
    ...findingLines,
    ...blockerLines,
    "secret_values=not_recorded",
    "host_addresses=not_recorded",
    "database_urls=not_recorded",
    "provider_values=not_recorded",
    "raw_headers=not_recorded",
    "raw_payloads=not_recorded",
  ].join("\n");
}

function parseCliArgs(args) {
  const allowed = new Set(["--help", "-h", "--json", "--require-ready"]);
  return {
    help: args.includes("--help") || args.includes("-h"),
    outputJson: args.includes("--json"),
    requireReady: args.includes("--require-ready"),
    invalidOptionCount: args.filter((arg) => arg.startsWith("--") && !allowed.has(arg)).length,
  };
}

function usage() {
  return [
    "Usage:",
    "  node scripts/validate-api-runtime-manual-evidence-checklist.mjs [--require-ready] [--json]",
    "",
    "Validates public-safe evidence refs without printing private values.",
  ].join("\n");
}

function publicErrorCode(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("ENOENT")) return "api_runtime_manual_evidence_checklist_file_unavailable";
  if (/secret|token|password|credential|postgres|private|D:\\|C:\\/i.test(message)) {
    return "api_runtime_manual_evidence_checklist_unavailable";
  }
  return "api_runtime_manual_evidence_checklist_unavailable";
}

function printResult(result, args) {
  if (args.outputJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(formatApiRuntimeManualEvidenceChecklistResult(result));
}

function runCli() {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (args.invalidOptionCount > 0) {
    const result = {
      apiRuntimeManualEvidenceChecklist: "GovernanceBlocked",
      solverOutcome: "GovernanceBlocked",
      proofState: "Fail",
      apiDnsPublicationAllowed: false,
      manualEvidenceItemCount: expectedEvidenceKeys.length,
      manualEvidenceObservedCount: 0,
      manualEvidenceMissing: expectedEvidenceKeys,
      hardFindings: [`unsupported_args_count:${args.invalidOptionCount}`],
      secretBoundary: "Unknown",
      checklistContract: "Fail",
    };
    printResult(result, args);
    process.exit(1);
    return;
  }
  try {
    const result = evaluateApiRuntimeManualEvidenceChecklist(readUtf8(checklistPath));
    printResult(result, args);
    if (result.checklistContract === "Fail" || (args.requireReady && result.apiRuntimeManualEvidenceChecklist !== "SolvedVerified")) {
      process.exit(1);
    }
  } catch (error) {
    const result = {
      apiRuntimeManualEvidenceChecklist: "GovernanceBlocked",
      solverOutcome: "GovernanceBlocked",
      proofState: "Fail",
      apiDnsPublicationAllowed: false,
      manualEvidenceItemCount: expectedEvidenceKeys.length,
      manualEvidenceObservedCount: 0,
      manualEvidenceMissing: expectedEvidenceKeys,
      hardFindings: [`checklist_error:${publicErrorCode(error)}`],
      secretBoundary: "Unknown",
      checklistContract: "Fail",
    };
    printResult(result, args);
    process.exit(1);
  }
}

export { expectedEvidenceKeys };

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
