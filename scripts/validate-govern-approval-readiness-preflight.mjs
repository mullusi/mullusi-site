/*
Purpose: validate public-safe operator approval readiness preflight evidence for Mullu Govern.
Governance scope: aggregate preflight health, non-operative approval packet state, missing approval refs, public write-route blocking, and no-secret evidence.
Dependencies: Node.js standard library, ops/mullu-govern-approval-readiness-preflight.md, public-beta approval packet, and Mullu Govern preflight validators.
Invariants: read-only; does not approve public-beta, publish routes, promote product status, activate privacy or retention, mutate DNS/runtime/auth, or print private values.
Test contract: run node scripts/test-validate-govern-approval-readiness-preflight.mjs.
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  requiredLiveEvidenceApprovalKeys,
  scanForbiddenEvidencePatterns,
} from "./govern-live-evidence-ref-contract.mjs";
import { validateGovernPublicBetaApprovalPacket } from "./validate-govern-public-beta-approval-packet.mjs";
import { validateGovernSupportReadiness } from "./validate-govern-support-readiness.mjs";
import { validateGovernPrivacyRetentionPreflight } from "./validate-govern-privacy-retention-preflight.mjs";
import { validateGovernEvaluateContractPreflight } from "./validate-govern-evaluate-contract-preflight.mjs";
import { validateGovernEvaluateWriteRouteDecision } from "./validate-govern-evaluate-write-route-decision.mjs";
import { validateGovernProductStatusPreflight } from "./validate-govern-product-status-preflight.mjs";
import { validateGovernDashboardOperatorReadinessPreflight } from "./validate-govern-dashboard-operator-readiness-preflight.mjs";
import { validateGovernPublicClaimUpdatePreflight } from "./validate-govern-public-claim-update-preflight.mjs";
import { validateGovernRuntimeClosurePacket } from "./validate-govern-runtime-closure-packet.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const repoRootPrefix = `${repoRoot}${path.sep}`;
const defaultWitnessPath = "ops/mullu-govern-approval-readiness-preflight.md";
const allowedArgs = new Set(["--json"]);

const requiredWitnessTerms = [
  { id: "approval_readiness_preflight_state", text: "approval_readiness_preflight_state=Ready" },
  { id: "solver_outcome", text: "solver_outcome=SolvedVerified" },
  { id: "proof_state", text: "proof_state=Pass" },
  { id: "packet_state", text: "packet_state=AwaitingEvidence" },
  { id: "approval_state", text: "approval_state=NotApproved" },
  { id: "operator_approval_ref", text: "operator_approval_ref=missing" },
  { id: "live_evidence_operator_approval_ref", text: "live_evidence_operator_approval_ref=approval://mullu-govern/live-evidence/2026-06-30/operator-approved" },
  { id: "ready_for_approval", text: "ready_for_approval=false" },
  { id: "public_write_route_allowed", text: "public_write_route_allowed=false" },
  { id: "route_publication_action", text: "route_publication_action=none" },
  { id: "dns_mutation", text: "dns_mutation=none" },
  { id: "runtime_mutation", text: "runtime_mutation=none" },
  { id: "dashboard_auth_mutation", text: "dashboard_auth_mutation=none" },
  { id: "privacy_activation_allowed", text: "privacy_activation_allowed=false" },
  { id: "retention_activation_allowed", text: "retention_activation_allowed=false" },
  { id: "product_status_promotion_allowed", text: "product_status_promotion_allowed=false" },
  { id: "public_claim_update_allowed", text: "public_claim_update_allowed=false" },
  { id: "secret_rotation_required", text: "secret_rotation_required=false" },
  { id: "provider_values_recorded", text: "provider_values_recorded=false" },
  {
    id: "live_evidence_operator_request_command",
    text: "live_evidence_operator_request_command=node scripts/emit-govern-live-evidence-operator-request.mjs",
  },
  { id: "last_reviewed", text: "last_reviewed=2026-06-27" },
  { id: "status_block", text: "STATUS:" },
];

const publicApprovalReadinessAllowedScalars = new Set([
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
  "approval://mullu-govern/live-evidence/2026-06-30/operator-approved",
]);

function blockedResult(finding) {
  return {
    approvalReadinessPreflightState: "Blocked",
    findingCount: 1,
    findings: [finding],
    missingApprovalInputCount: 0,
    proofState: "Fail",
    publicWriteRouteAllowed: false,
    readyForApproval: false,
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

export function publicApprovalReadinessScalarLabel(value) {
  if (value === undefined || value === null || value === "") return "missing";
  if (typeof value === "boolean") return `boolean:${value ? "true" : "false"}`;
  if (typeof value === "string" && publicApprovalReadinessAllowedScalars.has(value)) return value;
  if (typeof value === "string") return "redacted_value";
  if (typeof value === "number") return "number";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  return typeof value;
}

function aggregateValidatorResults() {
  return {
    approvalPacket: validateGovernPublicBetaApprovalPacket(),
    contractPreflight: validateGovernEvaluateContractPreflight(),
    dashboardPreflight: validateGovernDashboardOperatorReadinessPreflight(),
    privacyRetentionPreflight: validateGovernPrivacyRetentionPreflight(),
    productStatusPreflight: validateGovernProductStatusPreflight(),
    publicClaimPreflight: validateGovernPublicClaimUpdatePreflight(),
    runtimeClosurePacket: validateGovernRuntimeClosurePacket(),
    supportReadiness: validateGovernSupportReadiness(),
    writeRouteDecision: validateGovernEvaluateWriteRouteDecision(),
  };
}

export function validateGovernApprovalReadinessPreflightEvidence(evidence) {
  const findings = [];

  for (const term of requiredWitnessTerms) {
    if (!evidence.witness.includes(term.text)) findings.push(`required_witness_term_missing:${term.id}`);
  }

  for (const [source, content] of Object.entries(evidence.privateValueScanSources)) {
    findings.push(...scanForbiddenEvidencePatterns(source, content));
  }

  for (const key of requiredLiveEvidenceApprovalKeys) {
    const value = lineValue(evidence.approvalPacket, key);
    if (value !== "missing") findings.push(`approval_input_must_remain_missing:${key}:${publicApprovalReadinessScalarLabel(value)}`);
  }

  if (lineValue(evidence.approvalPacket, "packet_state") !== "AwaitingEvidence") {
    findings.push(`approval_packet_state_must_remain_awaiting:${publicApprovalReadinessScalarLabel(lineValue(evidence.approvalPacket, "packet_state"))}`);
  }
  if (lineValue(evidence.approvalPacket, "approval_state") !== "NotApproved") {
    findings.push(`approval_state_must_remain_not_approved:${publicApprovalReadinessScalarLabel(lineValue(evidence.approvalPacket, "approval_state"))}`);
  }
  if (lineValue(evidence.approvalPacket, "public_write_route_allowed") !== "false") {
    findings.push(`public_write_route_allowed_must_remain_false:${publicApprovalReadinessScalarLabel(lineValue(evidence.approvalPacket, "public_write_route_allowed"))}`);
  }

  const expectedPassResults = {
    approvalPacket: "SolvedVerified",
    contractPreflight: "SolvedVerified",
    dashboardPreflight: "SolvedVerified",
    privacyRetentionPreflight: "SolvedVerified",
    productStatusPreflight: "SolvedVerified",
    publicClaimPreflight: "SolvedVerified",
    runtimeClosurePacket: "SolvedVerified",
    supportReadiness: "SolvedVerified",
    writeRouteDecision: "SolvedVerified",
  };
  for (const [name, expectedOutcome] of Object.entries(expectedPassResults)) {
    const observed = evidence.validatorResults[name]?.solverOutcome;
    if (observed !== expectedOutcome) {
      findings.push(`aggregate_validator_not_solved:${name}:${publicApprovalReadinessScalarLabel(observed)}`);
    }
    const proofState = evidence.validatorResults[name]?.proofState;
    if (proofState !== "Pass") {
      findings.push(`aggregate_validator_proof_not_pass:${name}:${publicApprovalReadinessScalarLabel(proofState)}`);
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
    approvalReadinessPreflightState: findings.length === 0 ? "Ready" : "Blocked",
    findingCount: findings.length,
    findings,
    missingApprovalInputCount,
    proofState: findings.length === 0 ? "Pass" : "Fail",
    publicWriteRouteAllowed: lineValue(evidence.approvalPacket, "public_write_route_allowed") === "true",
    readyForApproval: false,
    solverOutcome: findings.length === 0 ? "SolvedVerified" : "GovernanceBlocked",
  };
}

export function collectGovernApprovalReadinessPreflightEvidence(relativePath = defaultWitnessPath) {
  const witnessResult = readUtf8Result(relativePath, "approval_readiness_preflight");
  const approvalPacketResult = readUtf8Result("ops/mullu-govern-public-beta-approval-packet.md", "approval_packet");
  const firstFinding = [witnessResult, approvalPacketResult]
    .find((result) => result.finding)?.finding ?? "";
  if (firstFinding) return { blockedResult: blockedResult(firstFinding) };

  const witness = witnessResult.content;
  const approvalPacket = approvalPacketResult.content;
  return {
    approvalPacket,
    privateValueScanSources: {
      approvalPacket,
      witness,
    },
    validatorResults: aggregateValidatorResults(),
    witness,
  };
}

export function validateGovernApprovalReadinessPreflight(relativePath = defaultWitnessPath) {
  const evidence = collectGovernApprovalReadinessPreflightEvidence(relativePath);
  if (evidence.blockedResult) return evidence.blockedResult;
  return validateGovernApprovalReadinessPreflightEvidence(evidence);
}

export function formatGovernApprovalReadinessPreflightReport(result) {
  return [
    `govern_approval_readiness_preflight=${result.solverOutcome}`,
    `proof_state=${result.proofState}`,
    `approval_readiness_preflight_state=${result.approvalReadinessPreflightState}`,
    `ready_for_approval=${result.readyForApproval ? "true" : "false"}`,
    `public_write_route_allowed=${result.publicWriteRouteAllowed ? "true" : "false"}`,
    `missing_approval_input_count=${result.missingApprovalInputCount}`,
    `finding_count=${result.findingCount}`,
    ...result.findings.map((finding) => `finding=${finding}`),
    "secret_values=not_recorded",
    "host_addresses=not_recorded",
    "database_urls=not_recorded",
    "provider_values=not_recorded",
  ].join("\n");
}

function main() {
  const args = process.argv.slice(2);
  const invalidArgs = unsupportedArgs(args);
  if (invalidArgs.length > 0) {
    const result = {
      approvalReadinessPreflightState: "Blocked",
      findingCount: invalidArgs.length,
      findings: [`unsupported_args_count:${invalidArgs.length}`],
      missingApprovalInputCount: 0,
      proofState: "Fail",
      publicWriteRouteAllowed: false,
      readyForApproval: false,
      solverOutcome: "GovernanceBlocked",
    };
    if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
    else console.log(formatGovernApprovalReadinessPreflightReport(result));
    process.exit(1);
    return;
  }

  const result = validateGovernApprovalReadinessPreflight();
  if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
  else console.log(formatGovernApprovalReadinessPreflightReport(result));
  if (result.findings.length > 0) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
