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
import { validateGovernProductStatusPreflight } from "./validate-govern-product-status-preflight.mjs";
import { validateGovernDashboardOperatorReadinessPreflight } from "./validate-govern-dashboard-operator-readiness-preflight.mjs";
import { validateGovernPublicClaimUpdatePreflight } from "./validate-govern-public-claim-update-preflight.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const defaultWitnessPath = "ops/mullu-govern-approval-readiness-preflight.md";
const allowedArgs = new Set(["--json"]);

const requiredWitnessTerms = [
  "approval_readiness_preflight_state=Ready",
  "solver_outcome=SolvedVerified",
  "proof_state=Pass",
  "packet_state=AwaitingEvidence",
  "approval_state=NotApproved",
  "operator_approval_ref=missing",
  "ready_for_approval=false",
  "public_write_route_allowed=false",
  "route_publication_action=none",
  "dns_mutation=none",
  "runtime_mutation=none",
  "dashboard_auth_mutation=none",
  "privacy_activation_allowed=false",
  "retention_activation_allowed=false",
  "product_status_promotion_allowed=false",
  "public_claim_update_allowed=false",
  "secret_rotation_required=false",
  "provider_values_recorded=false",
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

function aggregateValidatorResults() {
  return {
    approvalPacket: validateGovernPublicBetaApprovalPacket(),
    contractPreflight: validateGovernEvaluateContractPreflight(),
    dashboardPreflight: validateGovernDashboardOperatorReadinessPreflight(),
    privacyRetentionPreflight: validateGovernPrivacyRetentionPreflight(),
    productStatusPreflight: validateGovernProductStatusPreflight(),
    publicClaimPreflight: validateGovernPublicClaimUpdatePreflight(),
    supportReadiness: validateGovernSupportReadiness(),
  };
}

export function validateGovernApprovalReadinessPreflightEvidence(evidence) {
  const findings = [];

  for (const term of requiredWitnessTerms) {
    if (!evidence.witness.includes(term)) findings.push(`required_witness_term_missing:${term}`);
  }

  for (const [source, content] of Object.entries(evidence.privateValueScanSources)) {
    findings.push(...scanForbiddenEvidencePatterns(source, content));
  }

  for (const key of requiredLiveEvidenceApprovalKeys) {
    const value = lineValue(evidence.approvalPacket, key);
    if (value !== "missing") findings.push(`approval_input_must_remain_missing:${key}:${value || "missing"}`);
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

  const expectedPassResults = {
    approvalPacket: "SolvedVerified",
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
  const witness = readUtf8(relativePath);
  return {
    approvalPacket: readUtf8("ops/mullu-govern-public-beta-approval-packet.md"),
    privateValueScanSources: {
      approvalPacket: readUtf8("ops/mullu-govern-public-beta-approval-packet.md"),
      witness,
    },
    validatorResults: aggregateValidatorResults(),
    witness,
  };
}

export function validateGovernApprovalReadinessPreflight(relativePath = defaultWitnessPath) {
  return validateGovernApprovalReadinessPreflightEvidence(
    collectGovernApprovalReadinessPreflightEvidence(relativePath),
  );
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
      findings: [`unsupported_args:${invalidArgs.join(",")}`],
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
