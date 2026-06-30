/*
Purpose: validate the Mullu Govern live evidence operator runbook.
Governance scope: public-safe evidence ref contract, required live approval refs, secret exclusion, route blocking, release blocking, intake blocking, and non-operative live collection guidance.
Dependencies: Node.js standard library, ops/mullu-govern-live-evidence-operator-runbook.md, public-beta approval packet, live evidence ref intake validator, release readiness summary validator, and live evidence sequence preflight validator.
Invariants: read-only; does not approve live evidence collection, publish routes, promote product status, activate privacy or retention, mutate DNS/runtime/auth, or print private values.
Test contract: run node scripts/test-validate-govern-live-evidence-operator-runbook.mjs.
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  publicSafeEvidenceRefFamilies,
  requiredLiveEvidenceApprovalKeys,
  scanForbiddenEvidencePatterns,
} from "./govern-live-evidence-ref-contract.mjs";
import { validateGovernApprovalReadinessPreflight } from "./validate-govern-approval-readiness-preflight.mjs";
import { validateGovernLiveEvidenceRefCollectionChecklist } from "./validate-govern-live-evidence-ref-collection-checklist.mjs";
import { validateGovernLiveEvidenceRefIntake } from "./validate-govern-live-evidence-ref-intake.mjs";
import { validateGovernLiveEvidenceSequencePreflight } from "./validate-govern-live-evidence-sequence-preflight.mjs";
import { validateGovernPublicBetaApprovalPacket } from "./validate-govern-public-beta-approval-packet.mjs";
import { validateReleaseReadinessSummary } from "./validate-release-readiness-summary.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const repoRootPrefix = `${repoRoot}${path.sep}`;
const defaultRunbookPath = "ops/mullu-govern-live-evidence-operator-runbook.md";
const allowedArgs = new Set(["--json"]);

const requiredRunbookTerms = [
  { id: "operator_runbook_state", text: "operator_runbook_state=Ready" },
  { id: "solver_outcome", text: "solver_outcome=SolvedVerified" },
  { id: "proof_state", text: "proof_state=Pass" },
  { id: "ready_for_live_evidence", text: "ready_for_live_evidence=false" },
  { id: "public_write_route_allowed", text: "public_write_route_allowed=false" },
  { id: "approval_packet", text: "approval_packet=ops/mullu-govern-public-beta-approval-packet.md" },
  {
    id: "approval_readiness_preflight",
    text: "approval_readiness_preflight=ops/mullu-govern-approval-readiness-preflight.md",
  },
  {
    id: "live_evidence_ref_intake",
    text: "live_evidence_ref_intake=ops/mullu-govern-live-evidence-ref-intake-template.json",
  },
  {
    id: "live_evidence_operator_request_command",
    text: "live_evidence_operator_request_command=node scripts/emit-govern-live-evidence-operator-request.mjs",
  },
  {
    id: "live_evidence_ref_status_command",
    text: "live_evidence_ref_status_command=node scripts/report-govern-live-evidence-ref-status.mjs",
  },
  {
    id: "live_evidence_ref_intake_command",
    text: "live_evidence_ref_intake_command=node scripts/validate-govern-live-evidence-ref-intake.mjs",
  },
  {
    id: "live_evidence_ref_collection_checklist",
    text: "live_evidence_ref_collection_checklist=ops/mullu-govern-live-evidence-ref-collection-checklist.md",
  },
  {
    id: "sequence_preflight",
    text: "sequence_preflight=ops/mullu-govern-live-evidence-sequence-preflight.md",
  },
  {
    id: "runtime_witness_packet",
    text: "runtime_witness_packet=ops/runtime-witness/mullu-govern-closure-packet.md",
  },
  {
    id: "safe_local_command",
    text: "safe_local_command=node scripts/validate-govern-live-evidence-sequence-preflight.mjs",
  },
  { id: "static_website_integrity", text: "static_website_integrity=SolvedVerified" },
  { id: "api_exposure_probe", text: "api_exposure_probe=2026-06-29:SolvedVerified" },
  { id: "complete_mode_current_state", text: "complete_mode_current_state=GovernanceBlocked" },
  { id: "complete_mode_blocker_count", text: "complete_mode_blocker_count=8" },
  {
    id: "status_report_command",
    text: "command=node scripts/report-govern-live-evidence-ref-status.mjs",
  },
  { id: "status_report_state", text: "govern_live_evidence_ref_status=AwaitingEvidence" },
  { id: "status_missing_ref_count", text: "missing_ref_count=8" },
  { id: "status_local_guard_missing_count", text: "local_guard_missing_count=8" },
  { id: "status_invalid_ref_count", text: "invalid_ref_count=0" },
  {
    id: "operator_request_report_state",
    text: "govern_live_evidence_operator_request=AwaitingEvidence",
  },
  { id: "operator_request_next_action", text: "next_action=supply_public_safe_refs_in_ignored_local_intake" },
  {
    id: "complete_mode_command",
    text: "command=node scripts/validate-govern-live-evidence-ref-intake.mjs --require-complete",
  },
  { id: "complete_mode_requires_operator_ref", text: "finding=approval_ref_required:operator_approval_ref" },
  { id: "complete_mode_requires_runtime_ref", text: "finding=approval_ref_required:runtime_witness_ref" },
  { id: "secret_values_allowed", text: "secret_values_allowed=false" },
  { id: "raw_request_bodies_allowed", text: "raw_request_bodies_allowed=false" },
  { id: "raw_response_bodies_allowed", text: "raw_response_bodies_allowed=false" },
  { id: "provider_values_allowed", text: "provider_values_allowed=false" },
  { id: "operator_request_example", text: "accepted_example=approval://mullu-govern/live-evidence/2026-06-30/operator-approved" },
  { id: "operator_request_action_example", text: "accepted_example=github:actions/runs/123:govern-evaluate-contract-live" },
  { id: "last_reviewed", text: "last_reviewed=2026-06-30" },
  { id: "status_block", text: "STATUS:" },
];

const publicRunbookAllowedScalars = new Set([
  "missing",
  "false",
  "true",
  "NotApproved",
  "SolvedVerified",
  "GovernanceBlocked",
  "Pass",
  "Fail",
]);

function blockedResult(finding) {
  return {
    findingCount: 1,
    findings: [finding],
    missingApprovalInputCount: 0,
    operatorRunbookState: "Blocked",
    proofState: "Fail",
    publicWriteRouteAllowed: false,
    readyForLiveEvidence: false,
    solverOutcome: "GovernanceBlocked",
  };
}

function readUtf8Result(relativePath, findingPrefix) {
  if (typeof relativePath !== "string" || relativePath.trim() === "") {
    return { content: "", finding: `${findingPrefix}_path_invalid` };
  }

  const targetPath = path.resolve(repoRoot, relativePath);
  if (targetPath !== repoRoot && !targetPath.startsWith(repoRootPrefix)) {
    return { content: "", finding: `${findingPrefix}_path_outside_repo` };
  }

  try {
    return { content: fs.readFileSync(targetPath, "utf8"), finding: "" };
  } catch {
    return { content: "", finding: `${findingPrefix}_unreadable` };
  }
}

function lineValue(content, key) {
  const match = content.match(new RegExp(`^${key}=([^\\s]+)$`, "m"));
  return match?.[1] ?? "";
}

function unsupportedArgs(args) {
  return args.filter((arg) => arg.startsWith("--") && !allowedArgs.has(arg));
}

export function publicOperatorRunbookScalarLabel(value) {
  if (value === undefined || value === null || value === "") return "missing";
  if (typeof value === "boolean") return `boolean:${value ? "true" : "false"}`;
  if (typeof value === "string" && publicRunbookAllowedScalars.has(value)) return value;
  if (typeof value === "string") return "redacted_value";
  if (typeof value === "number") return "number";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  return typeof value;
}

export function validateGovernLiveEvidenceOperatorRunbookEvidence(evidence) {
  const findings = [];

  for (const term of requiredRunbookTerms) {
    if (!evidence.runbook.includes(term.text)) findings.push(`required_runbook_term_missing:${term.id}`);
  }

  for (const key of requiredLiveEvidenceApprovalKeys) {
    if (!evidence.runbook.includes(`| \`${key}\` |`)) {
      findings.push(`required_approval_key_missing_from_table:${key}`);
    }
    if (lineValue(evidence.approvalPacket, key) !== "missing") {
      findings.push(`approval_packet_ref_must_remain_missing:${key}:${publicOperatorRunbookScalarLabel(lineValue(evidence.approvalPacket, key))}`);
    }
  }

  for (const family of publicSafeEvidenceRefFamilies) {
    if (!evidence.runbook.includes(family)) findings.push(`required_ref_family_missing:${family}`);
  }

  for (const [source, content] of Object.entries(evidence.privateValueScanSources)) {
    findings.push(...scanForbiddenEvidencePatterns(source, content));
  }

  if (lineValue(evidence.approvalPacket, "public_write_route_allowed") !== "false") {
    findings.push(`public_write_route_allowed_must_remain_false:${publicOperatorRunbookScalarLabel(lineValue(evidence.approvalPacket, "public_write_route_allowed"))}`);
  }
  if (lineValue(evidence.approvalPacket, "approval_state") !== "NotApproved") {
    findings.push(`approval_state_must_remain_not_approved:${publicOperatorRunbookScalarLabel(lineValue(evidence.approvalPacket, "approval_state"))}`);
  }
  if (evidence.approvalPacketResult?.solverOutcome !== "SolvedVerified") {
    findings.push(`approval_packet_not_solved:${publicOperatorRunbookScalarLabel(evidence.approvalPacketResult?.solverOutcome)}`);
  }
  if (evidence.approvalPacketResult?.proofState !== "Pass") {
    findings.push(`approval_packet_proof_not_pass:${publicOperatorRunbookScalarLabel(evidence.approvalPacketResult?.proofState)}`);
  }
  if (evidence.approvalPacketResult?.publicWriteRouteAllowed !== false) {
    findings.push("approval_packet_public_route_not_blocked");
  }
  if (evidence.approvalReadinessResult?.solverOutcome !== "SolvedVerified") {
    findings.push(`approval_readiness_not_solved:${publicOperatorRunbookScalarLabel(evidence.approvalReadinessResult?.solverOutcome)}`);
  }
  if (evidence.approvalReadinessResult?.proofState !== "Pass") {
    findings.push(`approval_readiness_proof_not_pass:${publicOperatorRunbookScalarLabel(evidence.approvalReadinessResult?.proofState)}`);
  }
  if (evidence.approvalReadinessResult?.readyForApproval !== false) {
    findings.push("approval_readiness_ready_for_approval_must_remain_false");
  }
  if (evidence.sequencePreflightResult?.solverOutcome !== "SolvedVerified") {
    findings.push(`sequence_preflight_not_solved:${publicOperatorRunbookScalarLabel(evidence.sequencePreflightResult?.solverOutcome)}`);
  }
  if (evidence.sequencePreflightResult?.proofState !== "Pass") {
    findings.push(`sequence_preflight_proof_not_pass:${publicOperatorRunbookScalarLabel(evidence.sequencePreflightResult?.proofState)}`);
  }
  if (evidence.sequencePreflightResult?.readyForLiveEvidence !== false) {
    findings.push("sequence_preflight_ready_for_live_evidence_must_remain_false");
  }
  if (evidence.intakeResult?.solverOutcome !== "SolvedVerified") {
    findings.push(`live_evidence_ref_intake_not_solved:${publicOperatorRunbookScalarLabel(evidence.intakeResult?.solverOutcome)}`);
  }
  if (evidence.intakeResult?.proofState !== "Pass") {
    findings.push(`live_evidence_ref_intake_proof_not_pass:${publicOperatorRunbookScalarLabel(evidence.intakeResult?.proofState)}`);
  }
  if (evidence.intakeResult?.readyForLiveEvidence !== false) {
    findings.push("live_evidence_ref_intake_ready_for_live_evidence_must_remain_false");
  }
  if (evidence.intakeResult?.requireComplete !== false) {
    findings.push("live_evidence_ref_intake_require_complete_must_remain_false");
  }
  if (evidence.collectionChecklistResult?.solverOutcome !== "SolvedVerified") {
    findings.push(`live_evidence_ref_collection_checklist_not_solved:${publicOperatorRunbookScalarLabel(evidence.collectionChecklistResult?.solverOutcome)}`);
  }
  if (evidence.collectionChecklistResult?.proofState !== "Pass") {
    findings.push(`live_evidence_ref_collection_checklist_proof_not_pass:${publicOperatorRunbookScalarLabel(evidence.collectionChecklistResult?.proofState)}`);
  }
  if (evidence.collectionChecklistResult?.readyForLiveEvidence !== false) {
    findings.push("live_evidence_ref_collection_checklist_ready_for_live_evidence_must_remain_false");
  }
  if (evidence.releaseReadinessResult?.solverOutcome !== "SolvedVerified") {
    findings.push(`release_readiness_summary_not_solved:${publicOperatorRunbookScalarLabel(evidence.releaseReadinessResult?.solverOutcome)}`);
  }
  if (evidence.releaseReadinessResult?.proofState !== "Pass") {
    findings.push(`release_readiness_summary_proof_not_pass:${publicOperatorRunbookScalarLabel(evidence.releaseReadinessResult?.proofState)}`);
  }
  if (evidence.releaseReadinessResult?.productRuntimeClaimsAllowed !== false) {
    findings.push("release_readiness_product_runtime_claims_must_remain_false");
  }
  if (evidence.releaseReadinessResult?.publicProductReleaseAllowed !== false) {
    findings.push("release_readiness_public_product_release_must_remain_false");
  }

  return {
    findingCount: findings.length,
    findings,
    missingApprovalInputCount: requiredLiveEvidenceApprovalKeys.filter((key) => lineValue(evidence.approvalPacket, key) === "missing").length,
    operatorRunbookState: findings.length === 0 ? "Ready" : "Blocked",
    proofState: findings.length === 0 ? "Pass" : "Fail",
    publicWriteRouteAllowed: lineValue(evidence.approvalPacket, "public_write_route_allowed") === "true",
    readyForLiveEvidence: false,
    solverOutcome: findings.length === 0 ? "SolvedVerified" : "GovernanceBlocked",
  };
}

export function collectGovernLiveEvidenceOperatorRunbookEvidence(relativePath = defaultRunbookPath) {
  const approvalPacketResult = readUtf8Result("ops/mullu-govern-public-beta-approval-packet.md", "approval_packet");
  const runbookResult = readUtf8Result(relativePath, "operator_runbook");
  const firstFinding = [approvalPacketResult, runbookResult]
    .find((result) => result.finding)?.finding ?? "";
  if (firstFinding) return { blockedResult: blockedResult(firstFinding) };

  const approvalPacket = approvalPacketResult.content;
  const runbook = runbookResult.content;
  return {
    approvalPacket,
    approvalPacketResult: validateGovernPublicBetaApprovalPacket(),
    approvalReadinessResult: validateGovernApprovalReadinessPreflight(),
    collectionChecklistResult: validateGovernLiveEvidenceRefCollectionChecklist(),
    intakeResult: validateGovernLiveEvidenceRefIntake(),
    privateValueScanSources: {
      approvalPacket,
      runbook,
    },
    releaseReadinessResult: validateReleaseReadinessSummary(),
    runbook,
    sequencePreflightResult: validateGovernLiveEvidenceSequencePreflight(),
  };
}

export function validateGovernLiveEvidenceOperatorRunbook(relativePath = defaultRunbookPath) {
  const evidence = collectGovernLiveEvidenceOperatorRunbookEvidence(relativePath);
  if (evidence.blockedResult) return evidence.blockedResult;
  return validateGovernLiveEvidenceOperatorRunbookEvidence(evidence);
}

export function formatGovernLiveEvidenceOperatorRunbookReport(result) {
  return [
    `govern_live_evidence_operator_runbook=${result.solverOutcome}`,
    `proof_state=${result.proofState}`,
    `operator_runbook_state=${result.operatorRunbookState}`,
    `ready_for_live_evidence=${result.readyForLiveEvidence ? "true" : "false"}`,
    `public_write_route_allowed=${result.publicWriteRouteAllowed ? "true" : "false"}`,
    `missing_approval_input_count=${result.missingApprovalInputCount}`,
    `finding_count=${result.findingCount}`,
    ...result.findings.map((finding) => `finding=${finding}`),
    "secret_values=not_recorded",
    "host_addresses=not_recorded",
    "database_urls=not_recorded",
    "provider_values=not_recorded",
    "raw_payloads=not_recorded",
  ].join("\n");
}

function blockedResultForInvalidArgs(invalidArgs) {
  return {
    findingCount: invalidArgs.length,
    findings: [`unsupported_args_count:${invalidArgs.length}`],
    missingApprovalInputCount: 0,
    operatorRunbookState: "Blocked",
    proofState: "Fail",
    publicWriteRouteAllowed: false,
    readyForLiveEvidence: false,
    solverOutcome: "GovernanceBlocked",
  };
}

function main() {
  const args = process.argv.slice(2);
  const invalidArgs = unsupportedArgs(args);
  if (invalidArgs.length > 0) {
    const result = blockedResultForInvalidArgs(invalidArgs);
    if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
    else console.log(formatGovernLiveEvidenceOperatorRunbookReport(result));
    process.exit(1);
    return;
  }

  const result = validateGovernLiveEvidenceOperatorRunbook();
  if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
  else console.log(formatGovernLiveEvidenceOperatorRunbookReport(result));
  if (result.findings.length > 0) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
