/*
Purpose: report Mullu Govern live evidence ref readiness without promoting preflight evidence.
Governance scope: approval ref completeness, local preflight distinction, private-value redaction, and fail-closed status reporting.
Dependencies: Node.js standard library and scripts/govern-live-evidence-ref-contract.mjs.
Invariants: read-only; does not mutate intake files, approval packets, routes, privacy, retention, runtime witnesses, provider systems, or secret stores.
Test contract: run node scripts/test-report-govern-live-evidence-ref-status.mjs.
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
const repoRootPrefix = `${repoRoot}${path.sep}`;
const defaultIntakePath = "ops/mullu-govern-live-evidence-ref-intake-template.json";
const allowedArgs = new Set(["--help", "-h", "--json"]);

const refEvidencePlan = Object.freeze({
  operator_approval_ref: {
    guardPath: "ops/mullu-govern-approval-readiness-preflight.md",
    acceptedShape: "approval://mullu-govern/live-evidence/YYYY-MM-DD/operator-approved",
    evidenceKind: "operator approval record",
    nextAction: "collect_explicit_operator_approval_ref",
  },
  product_status_promotion_ref: {
    guardPath: "ops/mullu-govern-product-status-preflight.md",
    acceptedShape: "github:pull/NNN:product-status-public-beta-approval",
    evidenceKind: "product status promotion approval PR",
    nextAction: "collect_product_status_promotion_ref",
  },
  privacy_activation_ref: {
    guardPath: "ops/mullu-govern-privacy-retention-preflight.md",
    acceptedShape: "github:pull/NNN:privacy-govern-policy-activation",
    evidenceKind: "privacy activation approval PR",
    nextAction: "collect_privacy_activation_ref",
  },
  retention_activation_ref: {
    guardPath: "ops/mullu-govern-privacy-retention-preflight.md",
    acceptedShape: "github:pull/NNN:govern-retention-activation",
    evidenceKind: "retention activation approval PR",
    nextAction: "collect_retention_activation_ref",
  },
  dashboard_operator_readiness_ref: {
    guardPath: "ops/mullu-govern-dashboard-operator-readiness-preflight.md",
    acceptedShape: "receipt://dashboard/govern/operator-readiness/YYYY-MM-DD",
    evidenceKind: "dashboard operator-readiness receipt",
    nextAction: "collect_dashboard_operator_readiness_ref",
  },
  api_contract_test_ref: {
    guardPath: "ops/mullu-govern-evaluate-contract-preflight.md",
    acceptedShape: "github:actions/runs/NNN:govern-evaluate-contract-live",
    evidenceKind: "live evaluate contract test run",
    nextAction: "collect_live_contract_test_ref_after_approval",
  },
  public_claim_update_ref: {
    guardPath: "ops/mullu-govern-public-claim-update-preflight.md",
    acceptedShape: "github:pull/NNN:govern-public-claim-update",
    evidenceKind: "bounded public claim update PR",
    nextAction: "collect_public_claim_update_ref",
  },
  runtime_witness_ref: {
    guardPath: "ops/runtime-witness/mullu-govern-closure-packet.md",
    acceptedShape: "github:pull/NNN:runtime-witness-govern-closure",
    evidenceKind: "runtime witness closure PR",
    nextAction: "collect_runtime_witness_closure_ref",
  },
});

function usage() {
  return [
    "Usage:",
    "  node scripts/report-govern-live-evidence-ref-status.mjs [--path=FILE] [--json]",
    "",
    "Reports public-safe live evidence ref readiness without changing any file.",
  ].join("\n");
}

function unsupportedArgs(args) {
  return args.filter((arg) => arg.startsWith("--") && !allowedArgs.has(arg) && !arg.startsWith("--path="));
}

function pathArg(args) {
  const match = args.find((arg) => arg.startsWith("--path="));
  return match ? match.slice("--path=".length) : defaultIntakePath;
}

function readUtf8(relativePath) {
  const targetPath = path.resolve(repoRoot, relativePath);
  if (targetPath !== repoRoot && !targetPath.startsWith(repoRootPrefix)) {
    return { content: "", finding: "file_path_outside_repo" };
  }
  try {
    return { content: fs.readFileSync(targetPath, "utf8"), finding: "" };
  } catch {
    return { content: "", finding: "file_unreadable" };
  }
}

function parseJson(content) {
  try {
    return { value: JSON.parse(content), finding: "" };
  } catch {
    return { value: null, finding: "intake_json_invalid" };
  }
}

function lineValue(content, key) {
  const match = content.match(new RegExp(`^${key}=([^\\s]+)$`, "m"));
  return match?.[1] ?? "";
}

function publicValue(value) {
  if (value === undefined) return "missing";
  if (value === null) return "null";
  const text = String(value);
  if (scanForbiddenEvidencePatterns("value", text).length > 0) return "redacted";
  if (text.length > 96) return `${text.slice(0, 93)}...`;
  return text;
}

function proofStateFromCounts(counts) {
  if (counts.invalidRefCount > 0 || counts.findings.length > 0) return "Fail";
  if (counts.missingRefCount > 0 || counts.localGuardMissingCount > 0) return "Unknown";
  return "Pass";
}

function solverOutcomeFromCounts(counts) {
  if (counts.invalidRefCount > 0 || counts.findings.length > 0) return "GovernanceBlocked";
  if (counts.missingRefCount > 0 || counts.localGuardMissingCount > 0) return "AwaitingEvidence";
  return "SolvedVerified";
}

export function analyzeGovernLiveEvidenceRefStatusContent(content, guardContents = {}) {
  const findings = [...scanForbiddenEvidencePatterns("intake", content)];
  const parsed = parseJson(content);
  if (parsed.finding) findings.push(parsed.finding);

  const intake = parsed.value;
  const approvalRefs = intake?.approval_refs;
  if (!approvalRefs || typeof approvalRefs !== "object" || Array.isArray(approvalRefs)) {
    findings.push("approval_refs_object_missing");
  }

  const refs = [];
  for (const key of requiredLiveEvidenceApprovalKeys) {
    const plan = refEvidencePlan[key];
    const value = approvalRefs?.[key] ?? "missing";
    const validation = validatePublicSafeEvidenceRef(value, { allowMissing: true });
    const guardContent = guardContents[plan.guardPath] ?? "";
    const localGuardValue = lineValue(guardContent, key) || "missing";
    const localGuardMissing = localGuardValue === "missing";
    const status = validation.valid === false
      ? "invalid"
      : value === "missing"
        ? "missing"
        : localGuardMissing
          ? "candidate_without_local_activation"
          : "candidate";

    refs.push({
      acceptedShape: plan.acceptedShape,
      evidenceKind: plan.evidenceKind,
      key,
      localGuardMissing,
      localGuardValue: publicValue(localGuardValue),
      nextAction: status === "candidate" ? "verify_sequence_order" : plan.nextAction,
      refValue: publicValue(value),
      status,
      validShape: validation.valid,
    });
  }

  const counts = {
    findings,
    invalidRefCount: refs.filter((ref) => ref.validShape === false).length,
    localGuardMissingCount: refs.filter((ref) => ref.localGuardMissing).length,
    missingRefCount: refs.filter((ref) => ref.refValue === "missing").length,
  };

  return {
    findingCount: findings.length,
    findings,
    invalidRefCount: counts.invalidRefCount,
    localGuardMissingCount: counts.localGuardMissingCount,
    missingRefCount: counts.missingRefCount,
    proofState: proofStateFromCounts(counts),
    refs,
    solverOutcome: solverOutcomeFromCounts(counts),
  };
}

export function collectGovernLiveEvidenceRefStatus(relativePath = defaultIntakePath) {
  const intakeRead = readUtf8(relativePath);
  if (intakeRead.finding) {
    return {
      findingCount: 1,
      findings: [intakeRead.finding],
      invalidRefCount: 0,
      localGuardMissingCount: 0,
      missingRefCount: 0,
      proofState: "Fail",
      refs: [],
      solverOutcome: "GovernanceBlocked",
    };
  }

  const guardContents = {};
  for (const plan of Object.values(refEvidencePlan)) {
    if (guardContents[plan.guardPath] !== undefined) continue;
    const guardRead = readUtf8(plan.guardPath);
    guardContents[plan.guardPath] = guardRead.content;
  }
  return analyzeGovernLiveEvidenceRefStatusContent(intakeRead.content, guardContents);
}

export function formatGovernLiveEvidenceRefStatusReport(result) {
  return [
    `govern_live_evidence_ref_status=${result.solverOutcome}`,
    `proof_state=${result.proofState}`,
    `missing_ref_count=${result.missingRefCount}`,
    `local_guard_missing_count=${result.localGuardMissingCount}`,
    `invalid_ref_count=${result.invalidRefCount}`,
    `finding_count=${result.findingCount}`,
    ...result.findings.map((finding) => `finding=${finding}`),
    ...result.refs.map((ref) => [
      `ref=${ref.key}`,
      `status=${ref.status}`,
      `current=${ref.refValue}`,
      `local_guard=${ref.localGuardValue}`,
      `accepted_shape=${ref.acceptedShape}`,
      `next_action=${ref.nextAction}`,
    ].join(" ")),
    "secret_values=not_read",
    "provider_values=not_read",
    "raw_payloads=not_read",
  ].join("\n");
}

function runCli() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage());
    return;
  }

  const invalidArgs = unsupportedArgs(args);
  if (invalidArgs.length > 0) {
    const result = {
      findingCount: invalidArgs.length,
      findings: [`unsupported_args_count:${invalidArgs.length}`],
      invalidRefCount: 0,
      localGuardMissingCount: 0,
      missingRefCount: 0,
      proofState: "Fail",
      refs: [],
      solverOutcome: "GovernanceBlocked",
    };
    if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
    else console.log(formatGovernLiveEvidenceRefStatusReport(result));
    process.exit(1);
    return;
  }

  const result = collectGovernLiveEvidenceRefStatus(pathArg(args));
  if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
  else console.log(formatGovernLiveEvidenceRefStatusReport(result));
  if (result.solverOutcome === "GovernanceBlocked") process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
