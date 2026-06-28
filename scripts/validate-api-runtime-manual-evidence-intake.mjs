/*
Purpose: validate a public-safe API runtime manual evidence intake JSON file before checklist edits.
Governance scope: 13 pre-DNS API runtime evidence refs, fail-closed private-value rejection, DNS denial, and non-operative default intake state.
Dependencies: Node.js standard library, scripts/validate-api-runtime-manual-evidence-checklist.mjs, and scripts/govern-live-evidence-ref-contract.mjs.
Invariants: read-only; does not mutate checklist rows, contact providers, publish DNS, read secret stores, or print private values.
Test contract: run node scripts/test-validate-api-runtime-manual-evidence-intake.mjs.
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expectedEvidenceKeys } from "./validate-api-runtime-manual-evidence-checklist.mjs";
import {
  scanForbiddenEvidencePatterns,
  validatePublicSafeEvidenceRef,
} from "./govern-live-evidence-ref-contract.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const repoRootPrefix = `${repoRoot}${path.sep}`;
const defaultIntakePath = "ops/api-runtime-manual-evidence-intake-template.json";
const allowedArgs = new Set(["--json", "--require-complete"]);

const forbiddenIntakePatterns = Object.freeze([
  { label: "host_address_assignment", pattern: /^host_address\s*=/im },
  { label: "database_url_assignment", pattern: /^database_url\s*=/im },
  { label: "dns_target_assignment", pattern: /^dns_target\s*=/im },
  { label: "provider_account_assignment", pattern: /^provider_account(?:_id)?\s*=/im },
  { label: "raw_secret_assignment", pattern: /^(?:secret|token|password|api_key|private_key)\s*=/im },
  { label: "raw_ipv4_address", pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/ },
  { label: "raw_ipv6_address", pattern: /\b(?:[A-Fa-f0-9]{1,4}:){2,}[A-Fa-f0-9]{1,4}\b/ },
]);

function blockedResult(finding, options = {}) {
  return {
    apiRuntimeManualEvidenceIntake: "GovernanceBlocked",
    findingCount: 1,
    findings: [finding],
    missingEvidenceRefCount: expectedEvidenceKeys.length,
    proofState: "Fail",
    readyForDns: false,
    requireComplete: options.requireComplete === true,
    solverOutcome: "GovernanceBlocked",
  };
}

function readUtf8Result(relativePath) {
  if (typeof relativePath !== "string" || relativePath.trim() === "") {
    return { content: "", finding: "intake_file_path_invalid" };
  }
  const targetPath = path.resolve(repoRoot, relativePath);
  if (targetPath !== repoRoot && !targetPath.startsWith(repoRootPrefix)) {
    return { content: "", finding: "intake_file_path_outside_repo" };
  }
  try {
    return { content: fs.readFileSync(targetPath, "utf8"), finding: "" };
  } catch {
    return { content: "", finding: "intake_file_unreadable" };
  }
}

function unsupportedArgs(args) {
  return args.filter((arg) => arg.startsWith("--") && !allowedArgs.has(arg) && !arg.startsWith("--path="));
}

function pathArg(args) {
  const match = args.find((arg) => arg.startsWith("--path="));
  return match ? match.slice("--path=".length) : defaultIntakePath;
}

function parseIntake(content) {
  try {
    return { intake: JSON.parse(content), parseError: "" };
  } catch {
    return { intake: null, parseError: "present" };
  }
}

function describeIntakeValue(value) {
  if (value === undefined) return "missing";
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "boolean") return `boolean:${value ? "true" : "false"}`;
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "object") return "object";
  return typeof value;
}

function scanPrivateValueBoundary(content) {
  const findings = [...scanForbiddenEvidencePatterns("apiRuntimeManualEvidenceIntake", content)];
  for (const { label, pattern } of forbiddenIntakePatterns) {
    if (pattern.test(content)) {
      findings.push(`forbidden_private_value_pattern:apiRuntimeManualEvidenceIntake:${label}`);
    }
  }
  return findings;
}

export function validateApiRuntimeManualEvidenceIntakeContent(content, options = {}) {
  const findings = scanPrivateValueBoundary(content);
  const requireComplete = options.requireComplete === true;
  const { intake, parseError } = parseIntake(content);

  if (parseError) findings.push("intake_json_invalid");

  const evidenceRefs = intake?.evidence_refs;
  if (!evidenceRefs || typeof evidenceRefs !== "object" || Array.isArray(evidenceRefs)) {
    findings.push("evidence_refs_object_missing");
  }

  for (const key of expectedEvidenceKeys) {
    const value = evidenceRefs?.[key];
    if (value === undefined) {
      findings.push(`evidence_ref_missing_key:${key}`);
      continue;
    }
    const refResult = validatePublicSafeEvidenceRef(value, { allowMissing: !requireComplete });
    if (!refResult.valid) {
      for (const finding of refResult.findings) findings.push(`evidence_ref_invalid:${key}:${finding}`);
      if (refResult.isMissing && requireComplete) findings.push(`evidence_ref_required:${key}`);
    }
  }

  for (const key of Object.keys(evidenceRefs || {})) {
    if (!expectedEvidenceKeys.includes(key)) findings.push("evidence_ref_unknown_key:present");
  }

  if (intake?.surface_id !== "api.mullusi.com") {
    findings.push(`surface_id_invalid:${describeIntakeValue(intake?.surface_id)}`);
  }
  if (intake?.ready_for_dns !== false) {
    findings.push(`ready_for_dns_must_remain_false:${describeIntakeValue(intake?.ready_for_dns)}`);
  }
  if (intake?.api_dns_publication_allowed !== false) {
    findings.push(`api_dns_publication_allowed_must_remain_false:${describeIntakeValue(intake?.api_dns_publication_allowed)}`);
  }
  for (const [key, label] of [
    ["secret_values_allowed", "secret_values_allowed"],
    ["raw_payloads_allowed", "raw_payloads_allowed"],
    ["provider_values_allowed", "provider_values_allowed"],
    ["host_addresses_allowed", "host_addresses_allowed"],
    ["database_urls_allowed", "database_urls_allowed"],
    ["dns_targets_allowed", "dns_targets_allowed"],
  ]) {
    if (intake?.[key] !== false) findings.push(`${label}_must_remain_false:${describeIntakeValue(intake?.[key])}`);
  }

  const missingCount = expectedEvidenceKeys.filter((key) => evidenceRefs?.[key] === "missing").length;
  const complete = missingCount === 0 && findings.length === 0;

  return {
    apiRuntimeManualEvidenceIntake: findings.length === 0 ? "SolvedVerified" : "GovernanceBlocked",
    findingCount: findings.length,
    findings,
    missingEvidenceRefCount: missingCount,
    proofState: findings.length === 0 ? "Pass" : "Fail",
    readyForDns: false,
    requireComplete,
    solverOutcome: findings.length === 0 ? "SolvedVerified" : "GovernanceBlocked",
    intakeComplete: complete,
  };
}

export function validateApiRuntimeManualEvidenceIntake(relativePath = defaultIntakePath, options = {}) {
  const readResult = readUtf8Result(relativePath);
  if (readResult.finding) return blockedResult(readResult.finding, options);
  return validateApiRuntimeManualEvidenceIntakeContent(readResult.content, options);
}

export function formatApiRuntimeManualEvidenceIntakeReport(result) {
  return [
    `api_runtime_manual_evidence_intake=${result.apiRuntimeManualEvidenceIntake}`,
    `solver_outcome=${result.solverOutcome}`,
    `proof_state=${result.proofState}`,
    `ready_for_dns=${result.readyForDns ? "true" : "false"}`,
    `require_complete=${result.requireComplete ? "true" : "false"}`,
    `intake_complete=${result.intakeComplete ? "true" : "false"}`,
    `missing_evidence_ref_count=${result.missingEvidenceRefCount}`,
    `finding_count=${result.findingCount}`,
    ...result.findings.map((finding) => `finding=${finding}`),
    "secret_values=not_read",
    "provider_values=not_read",
    "host_addresses=not_read",
    "database_urls=not_read",
    "dns_targets=not_read",
    "raw_payloads=not_read",
  ].join("\n");
}

function main() {
  const args = process.argv.slice(2);
  const invalidArgs = unsupportedArgs(args);
  if (invalidArgs.length > 0) {
    const result = blockedResult(`unsupported_args_count:${invalidArgs.length}`, {
      requireComplete: args.includes("--require-complete"),
    });
    if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
    else console.log(formatApiRuntimeManualEvidenceIntakeReport(result));
    process.exit(1);
    return;
  }

  const result = validateApiRuntimeManualEvidenceIntake(pathArg(args), {
    requireComplete: args.includes("--require-complete"),
  });
  if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
  else console.log(formatApiRuntimeManualEvidenceIntakeReport(result));
  if (result.findings.length > 0 || (result.requireComplete && result.missingEvidenceRefCount > 0)) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
