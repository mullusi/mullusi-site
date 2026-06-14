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
import { validateGovernApprovalReadinessPreflight } from "./validate-govern-approval-readiness-preflight.mjs";
import { validateGovernDashboardOperatorReadinessPreflight } from "./validate-govern-dashboard-operator-readiness-preflight.mjs";
import { validateGovernEvaluateContractPreflight } from "./validate-govern-evaluate-contract-preflight.mjs";
import { validateGovernPrivacyRetentionPreflight } from "./validate-govern-privacy-retention-preflight.mjs";
import { validateGovernProductStatusPreflight } from "./validate-govern-product-status-preflight.mjs";
import { validateGovernPublicBetaApprovalPacket } from "./validate-govern-public-beta-approval-packet.mjs";
import { validateGovernPublicClaimUpdatePreflight } from "./validate-govern-public-claim-update-preflight.mjs";
import { validateGovernSupportReadiness } from "./validate-govern-support-readiness.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const defaultWitnessPath = "ops/mullu-govern-live-evidence-sequence-preflight.md";
const allowedArgs = new Set(["--json"]);

const sequencedApprovalKeys = [
  "operator_approval_ref",
  "product_status_promotion_ref",
  "privacy_activation_ref",
  "retention_activation_ref",
  "dashboard_operator_readiness_ref",
  "api_contract_test_ref",
  "public_claim_update_ref",
  "runtime_witness_ref",
];

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
  "live_evidence_sequence_preflight_state=Ready",
  "solver_outcome=SolvedVerified",
  "proof_state=Pass",
  "packet_state=AwaitingEvidence",
  "approval_state=NotApproved",
  "ready_for_live_evidence=false",
  "public_write_route_allowed=false",
  "route_publication_action=none",
  "dns_mutation=none",
  "runtime_mutation=none",
  "dashboard_auth_mutation=none",
  "privacy_activation_allowed=false",
  "retention_activation_allowed=false",
  "product_status_promotion_allowed=false",
  "public_claim_update_allowed=false",
  "runtime_witness_update_allowed=false",
  "provider_values_recorded=false",
  "STATUS:",
];

const forbiddenEvidencePatterns = [
  { label: "postgres_url", pattern: /postgres(?:ql)?:\/\//i },
  { label: "private_key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { label: "bearer_token", pattern: /Bearer\s+[A-Za-z0-9._~+/-]{16,}/ },
  { label: "api_key_shape", pattern: /\b(?:sk|pk|rk|ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{12,}/ },
  { label: "google_api_key_shape", pattern: /\bAIza[0-9A-Za-z_-]{20,}/ },
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

function aggregateValidatorResults() {
  return {
    approvalPacket: validateGovernPublicBetaApprovalPacket(),
    approvalReadinessPreflight: validateGovernApprovalReadinessPreflight(),
    contractPreflight: validateGovernEvaluateContractPreflight(),
    dashboardPreflight: validateGovernDashboardOperatorReadinessPreflight(),
    privacyRetentionPreflight: validateGovernPrivacyRetentionPreflight(),
    productStatusPreflight: validateGovernProductStatusPreflight(),
    publicClaimPreflight: validateGovernPublicClaimUpdatePreflight(),
    supportReadiness: validateGovernSupportReadiness(),
  };
}

export function validateGovernLiveEvidenceSequencePreflightEvidence(evidence) {
  const findings = [];

  for (const term of requiredWitnessTerms) {
    if (!evidence.witness.includes(term)) findings.push(`required_witness_term_missing:${term}`);
  }

  for (const { label, pattern } of forbiddenEvidencePatterns) {
    for (const [source, content] of Object.entries(evidence.privateValueScanSources)) {
      if (pattern.test(content)) findings.push(`forbidden_private_value_pattern:${source}:${label}`);
    }
  }

  for (const key of sequencedApprovalKeys) {
    const packetValue = lineValue(evidence.approvalPacket, key);
    const witnessValue = lineValue(evidence.witness, key);
    if (packetValue !== "missing") findings.push(`approval_input_must_remain_missing:${key}:${packetValue || "missing"}`);
    if (witnessValue !== "missing") findings.push(`witness_sequence_ref_must_remain_missing:${key}:${witnessValue || "missing"}`);
  }

  for (const blocker of expectedRuntimeBlockers) {
    if (!evidence.runtimeClosurePacket.includes(blocker)) findings.push(`runtime_blocker_missing:${blocker}`);
  }

  if (lineValue(evidence.approvalPacket, "packet_state") !== "AwaitingEvidence") {
    findings.push(`approval_packet_state_must_remain_awaiting:${lineValue(evidence.approvalPacket, "packet_state") || "missing"}`);
  }
  if (lineValue(evidence.approvalPacket, "approval_state") !== "NotApproved") {
    findings.push(`approval_state_must_remain_not_approved:${lineValue(evidence.approvalPacket, "approval_state") || "missing"}`);
  }
  if (lineValue(evidence.approvalPacket, "public_write_route_allowed") !== "false") {
    findings.push(`public_write_route_allowed_must_remain_false:${lineValue(evidence.approvalPacket, "public_write_route_allowed") || "missing"}`);
  }
  if (lineValue(evidence.approvalPacket, "route_publication_action") !== "none") {
    findings.push(`route_publication_action_must_remain_none:${lineValue(evidence.approvalPacket, "route_publication_action") || "missing"}`);
  }
  if (lineValue(evidence.approvalPacket, "dns_mutation") !== "none") {
    findings.push(`dns_mutation_must_remain_none:${lineValue(evidence.approvalPacket, "dns_mutation") || "missing"}`);
  }
  if (lineValue(evidence.approvalPacket, "runtime_mutation") !== "none") {
    findings.push(`runtime_mutation_must_remain_none:${lineValue(evidence.approvalPacket, "runtime_mutation") || "missing"}`);
  }

  const expectedPassResults = {
    approvalPacket: "SolvedVerified",
    approvalReadinessPreflight: "SolvedVerified",
    contractPreflight: "SolvedVerified",
    dashboardPreflight: "SolvedVerified",
    privacyRetentionPreflight: "SolvedVerified",
    productStatusPreflight: "SolvedVerified",
    publicClaimPreflight: "SolvedVerified",
    supportReadiness: "SolvedVerified",
  };

  for (const [name, expectedOutcome] of Object.entries(expectedPassResults)) {
    const observed = evidence.validatorResults[name]?.solverOutcome;
    if (observed !== expectedOutcome) {
      findings.push(`aggregate_validator_not_solved:${name}:${observed || "missing"}`);
    }
    const proofState = evidence.validatorResults[name]?.proofState;
    if (proofState !== "Pass") {
      findings.push(`aggregate_validator_proof_not_pass:${name}:${proofState || "missing"}`);
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
  const approvalPacket = readUtf8("ops/mullu-govern-public-beta-approval-packet.md");
  const runtimeClosurePacket = readUtf8("ops/runtime-witness/mullu-govern-closure-packet.md");
  const witness = readUtf8(relativePath);
  return {
    approvalPacket,
    privateValueScanSources: {
      approvalPacket,
      runtimeClosurePacket,
      witness,
    },
    runtimeClosurePacket,
    validatorResults: aggregateValidatorResults(),
    witness,
  };
}

export function validateGovernLiveEvidenceSequencePreflight(relativePath = defaultWitnessPath) {
  return validateGovernLiveEvidenceSequencePreflightEvidence(
    collectGovernLiveEvidenceSequencePreflightEvidence(relativePath),
  );
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
    findings: [`unsupported_args:${invalidArgs.join(",")}`],
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

