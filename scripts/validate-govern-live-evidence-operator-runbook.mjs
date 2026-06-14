/*
Purpose: validate the Mullu Govern live evidence operator runbook.
Governance scope: public-safe evidence ref contract, required live approval refs, secret exclusion, route blocking, and non-operative live collection guidance.
Dependencies: Node.js standard library, ops/mullu-govern-live-evidence-operator-runbook.md, public-beta approval packet, and live evidence sequence preflight validator.
Invariants: read-only; does not approve live evidence collection, publish routes, promote product status, activate privacy or retention, mutate DNS/runtime/auth, or print private values.
Test contract: run node scripts/test-validate-govern-live-evidence-operator-runbook.mjs.
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateGovernLiveEvidenceSequencePreflight } from "./validate-govern-live-evidence-sequence-preflight.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const defaultRunbookPath = "ops/mullu-govern-live-evidence-operator-runbook.md";
const allowedArgs = new Set(["--json"]);

const requiredApprovalKeys = [
  "operator_approval_ref",
  "product_status_promotion_ref",
  "privacy_activation_ref",
  "retention_activation_ref",
  "dashboard_operator_readiness_ref",
  "api_contract_test_ref",
  "public_claim_update_ref",
  "runtime_witness_ref",
];

const requiredRefFamilies = [
  "approval://",
  "receipt://",
  "github:pull/",
  "github:actions/runs/",
  "site:ops/",
  "control-plane:pull/",
  "control-plane:receipt/",
  "render:event/",
  "cloudflare:audit/",
  "google-workspace:audit/",
];

const requiredRunbookTerms = [
  "operator_runbook_state=Ready",
  "solver_outcome=SolvedVerified",
  "proof_state=Pass",
  "ready_for_live_evidence=false",
  "public_write_route_allowed=false",
  "approval_packet=ops/mullu-govern-public-beta-approval-packet.md",
  "sequence_preflight=ops/mullu-govern-live-evidence-sequence-preflight.md",
  "runtime_witness_packet=ops/runtime-witness/mullu-govern-closure-packet.md",
  "safe_local_command=node scripts/validate-govern-live-evidence-sequence-preflight.mjs",
  "secret_values_allowed=false",
  "raw_request_bodies_allowed=false",
  "raw_response_bodies_allowed=false",
  "provider_values_allowed=false",
  "STATUS:",
];

const forbiddenEvidencePatterns = [
  { label: "postgres_url", pattern: /postgres(?:ql)?:\/\//i },
  { label: "private_key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { label: "bearer_token", pattern: /Bearer\s+[A-Za-z0-9._~+/-]{16,}/ },
  { label: "api_key_shape", pattern: /\b(?:sk|pk|rk|ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{12,}/ },
  { label: "google_api_key_shape", pattern: /\bAIza[0-9A-Za-z_-]{20,}/ },
  { label: "raw_header_authorization", pattern: /^Authorization:/im },
  { label: "raw_json_payload", pattern: /^\s*{\s*"(?:input|prompt|message|token|authorization|password|secret)"/im },
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

  for (const key of requiredApprovalKeys) {
    if (!evidence.runbook.includes(`| \`${key}\` |`)) {
      findings.push(`required_approval_key_missing_from_table:${key}`);
    }
    if (lineValue(evidence.approvalPacket, key) !== "missing") {
      findings.push(`approval_packet_ref_must_remain_missing:${key}:${lineValue(evidence.approvalPacket, key) || "missing"}`);
    }
  }

  for (const family of requiredRefFamilies) {
    if (!evidence.runbook.includes(family)) findings.push(`required_ref_family_missing:${family}`);
  }

  for (const { label, pattern } of forbiddenEvidencePatterns) {
    for (const [source, content] of Object.entries(evidence.privateValueScanSources)) {
      if (pattern.test(content)) findings.push(`forbidden_private_value_pattern:${source}:${label}`);
    }
  }

  if (lineValue(evidence.approvalPacket, "public_write_route_allowed") !== "false") {
    findings.push(`public_write_route_allowed_must_remain_false:${lineValue(evidence.approvalPacket, "public_write_route_allowed") || "missing"}`);
  }
  if (lineValue(evidence.approvalPacket, "approval_state") !== "NotApproved") {
    findings.push(`approval_state_must_remain_not_approved:${lineValue(evidence.approvalPacket, "approval_state") || "missing"}`);
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

  return {
    findingCount: findings.length,
    findings,
    missingApprovalInputCount: requiredApprovalKeys.filter((key) => lineValue(evidence.approvalPacket, key) === "missing").length,
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
    privateValueScanSources: {
      approvalPacket,
      runbook,
    },
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
