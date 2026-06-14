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
import { validateGovernLiveEvidenceRefIntake } from "./validate-govern-live-evidence-ref-intake.mjs";
import { validateGovernLiveEvidenceSequencePreflight } from "./validate-govern-live-evidence-sequence-preflight.mjs";
import { validateGovernPublicBetaApprovalPacket } from "./validate-govern-public-beta-approval-packet.mjs";
import { validateReleaseReadinessSummary } from "./validate-release-readiness-summary.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const defaultRunbookPath = "ops/mullu-govern-live-evidence-operator-runbook.md";
const allowedArgs = new Set(["--json"]);

const requiredRunbookTerms = [
  "operator_runbook_state=Ready",
  "solver_outcome=SolvedVerified",
  "proof_state=Pass",
  "ready_for_live_evidence=false",
  "public_write_route_allowed=false",
  "approval_packet=ops/mullu-govern-public-beta-approval-packet.md",
  "approval_readiness_preflight=ops/mullu-govern-approval-readiness-preflight.md",
  "live_evidence_ref_intake=ops/mullu-govern-live-evidence-ref-intake-template.json",
  "live_evidence_ref_intake_command=node scripts/validate-govern-live-evidence-ref-intake.mjs",
  "live_evidence_ref_collection_checklist=ops/mullu-govern-live-evidence-ref-collection-checklist.md",
  "sequence_preflight=ops/mullu-govern-live-evidence-sequence-preflight.md",
  "runtime_witness_packet=ops/runtime-witness/mullu-govern-closure-packet.md",
  "safe_local_command=node scripts/validate-govern-live-evidence-sequence-preflight.mjs",
  "secret_values_allowed=false",
  "raw_request_bodies_allowed=false",
  "raw_response_bodies_allowed=false",
  "provider_values_allowed=false",
  "STATUS:",
];

function readUtf8(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function lineValue(content, key) {
  const match = content.match(new RegExp(`^${key}=([^\\s]+)$`, "m"));
  return match?.[1] ?? "";
}

function unsupportedArgs(args) {
  return args.filter((arg) => arg.startsWith("--") && !allowedArgs.has(arg));
}

export function validateGovernLiveEvidenceOperatorRunbookEvidence(evidence) {
  const findings = [];

  for (const term of requiredRunbookTerms) {
    if (!evidence.runbook.includes(term)) findings.push(`required_runbook_term_missing:${term}`);
  }

  for (const key of requiredLiveEvidenceApprovalKeys) {
    if (!evidence.runbook.includes(`| \`${key}\` |`)) {
      findings.push(`required_approval_key_missing_from_table:${key}`);
    }
    if (lineValue(evidence.approvalPacket, key) !== "missing") {
      findings.push(`approval_packet_ref_must_remain_missing:${key}:${lineValue(evidence.approvalPacket, key) || "missing"}`);
    }
  }

  for (const family of publicSafeEvidenceRefFamilies) {
    if (!evidence.runbook.includes(family)) findings.push(`required_ref_family_missing:${family}`);
  }

  for (const [source, content] of Object.entries(evidence.privateValueScanSources)) {
    findings.push(...scanForbiddenEvidencePatterns(source, content));
  }

  if (lineValue(evidence.approvalPacket, "public_write_route_allowed") !== "false") {
    findings.push(`public_write_route_allowed_must_remain_false:${lineValue(evidence.approvalPacket, "public_write_route_allowed") || "missing"}`);
  }
  if (lineValue(evidence.approvalPacket, "approval_state") !== "NotApproved") {
    findings.push(`approval_state_must_remain_not_approved:${lineValue(evidence.approvalPacket, "approval_state") || "missing"}`);
  }
  if (evidence.approvalPacketResult?.solverOutcome !== "SolvedVerified") {
    findings.push(`approval_packet_not_solved:${evidence.approvalPacketResult?.solverOutcome || "missing"}`);
  }
  if (evidence.approvalPacketResult?.proofState !== "Pass") {
    findings.push(`approval_packet_proof_not_pass:${evidence.approvalPacketResult?.proofState || "missing"}`);
  }
  if (evidence.approvalPacketResult?.publicWriteRouteAllowed !== false) {
    findings.push("approval_packet_public_route_not_blocked");
  }
  if (evidence.approvalReadinessResult?.solverOutcome !== "SolvedVerified") {
    findings.push(`approval_readiness_not_solved:${evidence.approvalReadinessResult?.solverOutcome || "missing"}`);
  }
  if (evidence.approvalReadinessResult?.proofState !== "Pass") {
    findings.push(`approval_readiness_proof_not_pass:${evidence.approvalReadinessResult?.proofState || "missing"}`);
  }
  if (evidence.approvalReadinessResult?.readyForApproval !== false) {
    findings.push("approval_readiness_ready_for_approval_must_remain_false");
  }
  if (evidence.sequencePreflightResult?.solverOutcome !== "SolvedVerified") {
    findings.push(`sequence_preflight_not_solved:${evidence.sequencePreflightResult?.solverOutcome || "missing"}`);
  }
  if (evidence.sequencePreflightResult?.proofState !== "Pass") {
    findings.push(`sequence_preflight_proof_not_pass:${evidence.sequencePreflightResult?.proofState || "missing"}`);
  }
  if (evidence.sequencePreflightResult?.readyForLiveEvidence !== false) {
    findings.push("sequence_preflight_ready_for_live_evidence_must_remain_false");
  }
  if (evidence.intakeResult?.solverOutcome !== "SolvedVerified") {
    findings.push(`live_evidence_ref_intake_not_solved:${evidence.intakeResult?.solverOutcome || "missing"}`);
  }
  if (evidence.intakeResult?.proofState !== "Pass") {
    findings.push(`live_evidence_ref_intake_proof_not_pass:${evidence.intakeResult?.proofState || "missing"}`);
  }
  if (evidence.intakeResult?.readyForLiveEvidence !== false) {
    findings.push("live_evidence_ref_intake_ready_for_live_evidence_must_remain_false");
  }
  if (evidence.intakeResult?.requireComplete !== false) {
    findings.push("live_evidence_ref_intake_require_complete_must_remain_false");
  }
  if (evidence.releaseReadinessResult?.solverOutcome !== "SolvedVerified") {
    findings.push(`release_readiness_summary_not_solved:${evidence.releaseReadinessResult?.solverOutcome || "missing"}`);
  }
  if (evidence.releaseReadinessResult?.proofState !== "Pass") {
    findings.push(`release_readiness_summary_proof_not_pass:${evidence.releaseReadinessResult?.proofState || "missing"}`);
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
  const approvalPacket = readUtf8("ops/mullu-govern-public-beta-approval-packet.md");
  const runbook = readUtf8(relativePath);
  return {
    approvalPacket,
    approvalPacketResult: validateGovernPublicBetaApprovalPacket(),
    approvalReadinessResult: validateGovernApprovalReadinessPreflight(),
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
  return validateGovernLiveEvidenceOperatorRunbookEvidence(
    collectGovernLiveEvidenceOperatorRunbookEvidence(relativePath),
  );
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
    findings: [`unsupported_args:${invalidArgs.join(",")}`],
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
