/*
Purpose: validate public-safe live evidence sequencing preflight evidence for Mullu Govern.
Governance scope: approval-bound live evidence order, aggregate preflight health, runtime closure blockers, missing approval refs, public write-route blocking, and no-secret evidence.
Dependencies: Node.js standard library, ops/mullu-govern-live-evidence-sequence-preflight.md, public-beta approval packet, runtime closure packet, and Mullu Govern preflight validators.
Invariants: read-only; does not approve live evidence collection, publish routes, promote product status, activate privacy or retention, mutate DNS/runtime/auth, update runtime witnesses, or print private values.
Test contract: run node scripts/test-validate-govern-live-evidence-sequence-preflight.mjs.
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  requiredLiveEvidenceApprovalKeys,
  scanForbiddenEvidencePatterns,
} from "./govern-live-evidence-ref-contract.mjs";
import { validateGovernApprovalReadinessPreflight } from "./validate-govern-approval-readiness-preflight.mjs";
import { validateGovernDashboardOperatorReadinessPreflight } from "./validate-govern-dashboard-operator-readiness-preflight.mjs";
import { validateGovernEvaluateContractPreflight } from "./validate-govern-evaluate-contract-preflight.mjs";
import { validateGovernLiveEvidenceRefIntake } from "./validate-govern-live-evidence-ref-intake.mjs";
import { validateGovernPrivacyRetentionPreflight } from "./validate-govern-privacy-retention-preflight.mjs";
import { validateGovernProductStatusPreflight } from "./validate-govern-product-status-preflight.mjs";
import { validateGovernPublicBetaApprovalPacket } from "./validate-govern-public-beta-approval-packet.mjs";
import { validateGovernPublicClaimUpdatePreflight } from "./validate-govern-public-claim-update-preflight.mjs";
import { validateGovernRuntimeClosurePacket } from "./validate-govern-runtime-closure-packet.mjs";
import { validateGovernSupportReadiness } from "./validate-govern-support-readiness.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const repoRootPrefix = `${repoRoot}${path.sep}`;
const defaultWitnessPath = "ops/mullu-govern-live-evidence-sequence-preflight.md";
const allowedArgs = new Set(["--json"]);

const expectedRuntimeBlockers = [
  "blocker=product_status_promotion_approval_missing",
  "blocker=product_evaluate_write_route_approval_missing",
  "blocker=product_api_contract_live_execution_not_published",
  "blocker=product_privacy_boundary_not_verified",
  "blocker=product_retention_boundary_not_verified",
  "blocker=dashboard_operator_readiness_evidence_missing",
  "blocker=public_claim_update_evidence_missing",
  "blocker=runtime_witness_registry_not_closed",
];

const requiredWitnessTerms = [
  { id: "live_evidence_sequence_preflight_state", text: "live_evidence_sequence_preflight_state=Ready" },
  { id: "solver_outcome", text: "solver_outcome=SolvedVerified" },
  { id: "proof_state", text: "proof_state=Pass" },
  { id: "packet_state", text: "packet_state=AwaitingEvidence" },
  { id: "approval_state", text: "approval_state=NotApproved" },
  { id: "ready_for_live_evidence", text: "ready_for_live_evidence=false" },
  { id: "public_write_route_allowed", text: "public_write_route_allowed=false" },
  { id: "route_publication_action", text: "route_publication_action=none" },
  { id: "dns_mutation", text: "dns_mutation=none" },
  { id: "runtime_mutation", text: "runtime_mutation=none" },
  { id: "dashboard_auth_mutation", text: "dashboard_auth_mutation=none" },
  { id: "privacy_activation_allowed", text: "privacy_activation_allowed=false" },
  { id: "retention_activation_allowed", text: "retention_activation_allowed=false" },
  { id: "product_status_promotion_allowed", text: "product_status_promotion_allowed=false" },
  { id: "public_claim_update_allowed", text: "public_claim_update_allowed=false" },
  { id: "runtime_witness_update_allowed", text: "runtime_witness_update_allowed=false" },
  { id: "provider_values_recorded", text: "provider_values_recorded=false" },
  {
    id: "live_evidence_ref_intake",
    text: "live_evidence_ref_intake=ops/mullu-govern-live-evidence-ref-intake-template.json",
  },
  {
    id: "live_evidence_ref_intake_command",
    text: "live_evidence_ref_intake_command=node scripts/validate-govern-live-evidence-ref-intake.mjs",
  },
  { id: "status_block", text: "STATUS:" },
];

const publicSequenceAllowedScalars = new Set([
  "missing",
  "false",
  "true",
  "none",
  "AwaitingEvidence",
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
    liveEvidenceSequencePreflightState: "Blocked",
    missingApprovalInputCount: 0,
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

export function publicSequenceScalarLabel(value) {
  if (value === undefined || value === null || value === "") return "missing";
  if (typeof value === "boolean") return `boolean:${value ? "true" : "false"}`;
  if (typeof value === "string" && publicSequenceAllowedScalars.has(value)) return value;
  if (typeof value === "string") return "redacted_value";
  if (typeof value === "number") return "number";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  return typeof value;
}

function aggregateValidatorResults() {
  return {
    approvalPacket: validateGovernPublicBetaApprovalPacket(),
    approvalReadinessPreflight: validateGovernApprovalReadinessPreflight(),
    contractPreflight: validateGovernEvaluateContractPreflight(),
    dashboardPreflight: validateGovernDashboardOperatorReadinessPreflight(),
    liveEvidenceRefIntake: validateGovernLiveEvidenceRefIntake(),
    privacyRetentionPreflight: validateGovernPrivacyRetentionPreflight(),
    productStatusPreflight: validateGovernProductStatusPreflight(),
    publicClaimPreflight: validateGovernPublicClaimUpdatePreflight(),
    runtimeClosurePacket: validateGovernRuntimeClosurePacket(),
    supportReadiness: validateGovernSupportReadiness(),
  };
}

export function validateGovernLiveEvidenceSequencePreflightEvidence(evidence) {
  const findings = [];

  for (const term of requiredWitnessTerms) {
    if (!evidence.witness.includes(term.text)) findings.push(`required_witness_term_missing:${term.id}`);
  }

  for (const [source, content] of Object.entries(evidence.privateValueScanSources)) {
    findings.push(...scanForbiddenEvidencePatterns(source, content));
  }

  for (const key of requiredLiveEvidenceApprovalKeys) {
    const packetValue = lineValue(evidence.approvalPacket, key);
    const witnessValue = lineValue(evidence.witness, key);
    if (packetValue !== "missing") findings.push(`approval_input_must_remain_missing:${key}:${publicSequenceScalarLabel(packetValue)}`);
    if (witnessValue !== "missing") findings.push(`witness_sequence_ref_must_remain_missing:${key}:${publicSequenceScalarLabel(witnessValue)}`);
  }

  for (const blocker of expectedRuntimeBlockers) {
    if (!evidence.runtimeClosurePacket.includes(blocker)) findings.push(`runtime_blocker_missing:${blocker}`);
  }

  if (lineValue(evidence.approvalPacket, "packet_state") !== "AwaitingEvidence") {
    findings.push(`approval_packet_state_must_remain_awaiting:${publicSequenceScalarLabel(lineValue(evidence.approvalPacket, "packet_state"))}`);
  }
  if (lineValue(evidence.approvalPacket, "approval_state") !== "NotApproved") {
    findings.push(`approval_state_must_remain_not_approved:${publicSequenceScalarLabel(lineValue(evidence.approvalPacket, "approval_state"))}`);
  }
  if (lineValue(evidence.approvalPacket, "public_write_route_allowed") !== "false") {
    findings.push(`public_write_route_allowed_must_remain_false:${publicSequenceScalarLabel(lineValue(evidence.approvalPacket, "public_write_route_allowed"))}`);
  }
  if (lineValue(evidence.approvalPacket, "route_publication_action") !== "none") {
    findings.push(`route_publication_action_must_remain_none:${publicSequenceScalarLabel(lineValue(evidence.approvalPacket, "route_publication_action"))}`);
  }
  if (lineValue(evidence.approvalPacket, "dns_mutation") !== "none") {
    findings.push(`dns_mutation_must_remain_none:${publicSequenceScalarLabel(lineValue(evidence.approvalPacket, "dns_mutation"))}`);
  }
  if (lineValue(evidence.approvalPacket, "runtime_mutation") !== "none") {
    findings.push(`runtime_mutation_must_remain_none:${publicSequenceScalarLabel(lineValue(evidence.approvalPacket, "runtime_mutation"))}`);
  }

  const expectedPassResults = {
    approvalPacket: "SolvedVerified",
    approvalReadinessPreflight: "SolvedVerified",
    contractPreflight: "SolvedVerified",
    dashboardPreflight: "SolvedVerified",
    liveEvidenceRefIntake: "SolvedVerified",
    privacyRetentionPreflight: "SolvedVerified",
    productStatusPreflight: "SolvedVerified",
    publicClaimPreflight: "SolvedVerified",
    runtimeClosurePacket: "SolvedVerified",
    supportReadiness: "SolvedVerified",
  };

  for (const [name, expectedOutcome] of Object.entries(expectedPassResults)) {
    const observed = evidence.validatorResults[name]?.solverOutcome;
    if (observed !== expectedOutcome) {
      findings.push(`aggregate_validator_not_solved:${name}:${publicSequenceScalarLabel(observed)}`);
    }
    const proofState = evidence.validatorResults[name]?.proofState;
    if (proofState !== "Pass") {
      findings.push(`aggregate_validator_proof_not_pass:${name}:${publicSequenceScalarLabel(proofState)}`);
    }
  }

  const missingApprovalInputCount = evidence.validatorResults.approvalPacket?.missingApprovalInputs?.length ?? 0;
  if (missingApprovalInputCount !== 8) {
    findings.push(`missing_approval_input_count_must_remain_eight:${missingApprovalInputCount}`);
  }
  if (evidence.validatorResults.approvalPacket?.publicWriteRouteAllowed !== false) {
    findings.push("approval_packet_public_write_route_not_blocked");
  }

  return {
    findingCount: findings.length,
    findings,
    liveEvidenceSequencePreflightState: findings.length === 0 ? "Ready" : "Blocked",
    missingApprovalInputCount,
    proofState: findings.length === 0 ? "Pass" : "Fail",
    publicWriteRouteAllowed: lineValue(evidence.approvalPacket, "public_write_route_allowed") === "true",
    readyForLiveEvidence: false,
    solverOutcome: findings.length === 0 ? "SolvedVerified" : "GovernanceBlocked",
  };
}

export function collectGovernLiveEvidenceSequencePreflightEvidence(relativePath = defaultWitnessPath) {
  const approvalPacketResult = readUtf8Result("ops/mullu-govern-public-beta-approval-packet.md", "approval_packet");
  const liveEvidenceRefIntakeResult = readUtf8Result("ops/mullu-govern-live-evidence-ref-intake-template.json", "live_evidence_ref_intake");
  const runtimeClosurePacketResult = readUtf8Result("ops/runtime-witness/mullu-govern-closure-packet.md", "runtime_closure_packet");
  const witnessResult = readUtf8Result(relativePath, "live_evidence_sequence_preflight");
  const firstFinding = [
    approvalPacketResult,
    liveEvidenceRefIntakeResult,
    runtimeClosurePacketResult,
    witnessResult,
  ].find((result) => result.finding)?.finding ?? "";
  if (firstFinding) return { blockedResult: blockedResult(firstFinding) };

  const approvalPacket = approvalPacketResult.content;
  const liveEvidenceRefIntake = liveEvidenceRefIntakeResult.content;
  const runtimeClosurePacket = runtimeClosurePacketResult.content;
  const witness = witnessResult.content;
  return {
    approvalPacket,
    privateValueScanSources: {
      approvalPacket,
      liveEvidenceRefIntake,
      runtimeClosurePacket,
      witness,
    },
    runtimeClosurePacket,
    validatorResults: aggregateValidatorResults(),
    witness,
  };
}

export function validateGovernLiveEvidenceSequencePreflight(relativePath = defaultWitnessPath) {
  const evidence = collectGovernLiveEvidenceSequencePreflightEvidence(relativePath);
  if (evidence.blockedResult) return evidence.blockedResult;
  return validateGovernLiveEvidenceSequencePreflightEvidence(evidence);
}

export function formatGovernLiveEvidenceSequencePreflightReport(result) {
  return [
    `govern_live_evidence_sequence_preflight=${result.solverOutcome}`,
    `proof_state=${result.proofState}`,
    `live_evidence_sequence_preflight_state=${result.liveEvidenceSequencePreflightState}`,
    `ready_for_live_evidence=${result.readyForLiveEvidence ? "true" : "false"}`,
    `public_write_route_allowed=${result.publicWriteRouteAllowed ? "true" : "false"}`,
    `missing_approval_input_count=${result.missingApprovalInputCount}`,
    `finding_count=${result.findingCount}`,
    ...result.findings.map((finding) => `finding=${finding}`),
    "secret_values=not_recorded",
    "host_addresses=not_recorded",
    "database_urls=not_recorded",
    "provider_values=not_recorded",
    "raw_user_data=not_recorded",
  ].join("\n");
}

function blockedResultForInvalidArgs(invalidArgs) {
  return {
    findingCount: invalidArgs.length,
    findings: [`unsupported_args_count:${invalidArgs.length}`],
    liveEvidenceSequencePreflightState: "Blocked",
    missingApprovalInputCount: 0,
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
    else console.log(formatGovernLiveEvidenceSequencePreflightReport(result));
    process.exit(1);
    return;
  }

  const result = validateGovernLiveEvidenceSequencePreflight();
  if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
  else console.log(formatGovernLiveEvidenceSequencePreflightReport(result));
  if (result.findings.length > 0) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

