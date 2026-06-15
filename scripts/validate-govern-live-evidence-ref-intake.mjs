/*
Purpose: validate a public-safe Mullu Govern live evidence ref intake file before approval-packet edits.
Governance scope: approval-bound evidence refs, required-key completeness, fail-closed private-value rejection, and non-operative default intake state.
Dependencies: Node.js standard library and scripts/govern-live-evidence-ref-contract.mjs.
Invariants: read-only; does not mutate approval packets, publish routes, contact providers, read secret stores, or print private values.
Test contract: run node scripts/test-validate-govern-live-evidence-ref-intake.mjs.
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  requiredLiveEvidenceApprovalKeys,
  scanForbiddenEvidencePatterns,
  validatePublicSafeEvidenceRef,
} from "./govern-live-evidence-ref-contract.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const defaultIntakePath = "ops/mullu-govern-live-evidence-ref-intake-template.json";
const allowedArgs = new Set(["--json", "--require-complete"]);

function readUtf8(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
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
  } catch (error) {
    return { intake: null, parseError: error.message ? "present" : "missing" };
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

export function validateGovernLiveEvidenceRefIntakeContent(content, options = {}) {
  const findings = [];
  const requireComplete = options.requireComplete === true;
  const { intake, parseError } = parseIntake(content);

  findings.push(...scanForbiddenEvidencePatterns("intake", content));

  if (parseError) {
    findings.push("intake_json_invalid");
  }

  const approvalRefs = intake?.approval_refs;
  if (!approvalRefs || typeof approvalRefs !== "object" || Array.isArray(approvalRefs)) {
    findings.push("approval_refs_object_missing");
  }

  for (const key of requiredLiveEvidenceApprovalKeys) {
    const value = approvalRefs?.[key];
    if (value === undefined) {
      findings.push(`approval_ref_missing_key:${key}`);
      continue;
    }
    const refResult = validatePublicSafeEvidenceRef(value, { allowMissing: !requireComplete });
    if (!refResult.valid) {
      for (const finding of refResult.findings) findings.push(`approval_ref_invalid:${key}:${finding}`);
      if (refResult.isMissing && requireComplete) findings.push(`approval_ref_required:${key}`);
    }
  }

  for (const key of Object.keys(approvalRefs || {})) {
    if (!requiredLiveEvidenceApprovalKeys.includes(key)) findings.push("approval_ref_unknown_key:present");
  }

  if (intake?.product_id !== "mullu-govern") {
    findings.push(`product_id_invalid:${describeIntakeValue(intake?.product_id)}`);
  }
  if (intake?.ready_for_live_evidence !== false) {
    findings.push(`ready_for_live_evidence_must_remain_false:${describeIntakeValue(intake?.ready_for_live_evidence)}`);
  }
  if (intake?.public_write_route_allowed !== false) {
    findings.push(`public_write_route_allowed_must_remain_false:${describeIntakeValue(intake?.public_write_route_allowed)}`);
  }
  if (intake?.secret_values_allowed !== false) {
    findings.push(`secret_values_allowed_must_remain_false:${describeIntakeValue(intake?.secret_values_allowed)}`);
  }
  if (intake?.raw_payloads_allowed !== false) {
    findings.push(`raw_payloads_allowed_must_remain_false:${describeIntakeValue(intake?.raw_payloads_allowed)}`);
  }
  if (intake?.provider_values_allowed !== false) {
    findings.push(`provider_values_allowed_must_remain_false:${describeIntakeValue(intake?.provider_values_allowed)}`);
  }

  const missingCount = requiredLiveEvidenceApprovalKeys
    .filter((key) => approvalRefs?.[key] === "missing")
    .length;

  return {
    findingCount: findings.length,
    findings,
    missingApprovalInputCount: missingCount,
    proofState: findings.length === 0 ? "Pass" : "Fail",
    readyForLiveEvidence: false,
    requireComplete,
    solverOutcome: findings.length === 0 ? "SolvedVerified" : "GovernanceBlocked",
  };
}

export function validateGovernLiveEvidenceRefIntake(relativePath = defaultIntakePath, options = {}) {
  return validateGovernLiveEvidenceRefIntakeContent(readUtf8(relativePath), options);
}

export function formatGovernLiveEvidenceRefIntakeReport(result) {
  return [
    `govern_live_evidence_ref_intake=${result.solverOutcome}`,
    `proof_state=${result.proofState}`,
    `ready_for_live_evidence=${result.readyForLiveEvidence ? "true" : "false"}`,
    `require_complete=${result.requireComplete ? "true" : "false"}`,
    `missing_approval_input_count=${result.missingApprovalInputCount}`,
    `finding_count=${result.findingCount}`,
    ...result.findings.map((finding) => `finding=${finding}`),
    "secret_values=not_read",
    "provider_values=not_read",
    "raw_payloads=not_read",
  ].join("\n");
}

function main() {
  const args = process.argv.slice(2);
  const invalidArgs = unsupportedArgs(args);
  if (invalidArgs.length > 0) {
    const result = {
      findingCount: invalidArgs.length,
      findings: [`unsupported_args_count:${invalidArgs.length}`],
      missingApprovalInputCount: 0,
      proofState: "Fail",
      readyForLiveEvidence: false,
      requireComplete: args.includes("--require-complete"),
      solverOutcome: "GovernanceBlocked",
    };
    if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
    else console.log(formatGovernLiveEvidenceRefIntakeReport(result));
    process.exit(1);
    return;
  }

  const result = validateGovernLiveEvidenceRefIntake(pathArg(args), {
    requireComplete: args.includes("--require-complete"),
  });
  if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
  else console.log(formatGovernLiveEvidenceRefIntakeReport(result));
  if (result.findings.length > 0) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
