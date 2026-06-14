/*
Purpose: validate the non-operative Mullu Govern public-beta approval packet.
Governance scope: public write-route approval state, missing evidence refs, route publication denial, and no-secret approval evidence.
Dependencies: Node.js standard library and ops/mullu-govern-public-beta-approval-packet.md.
Invariants: read-only; does not inspect provider dashboards, mutate DNS, publish routes, or print private values.
Test contract: run node scripts/test-validate-govern-public-beta-approval-packet.mjs.
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  requiredLiveEvidenceApprovalKeys,
  scanForbiddenEvidencePatterns,
  validatePublicSafeEvidenceRef,
} from "./govern-live-evidence-ref-contract.mjs";
import { validateGovernEvaluateWriteRouteDecision } from "./validate-govern-evaluate-write-route-decision.mjs";
import { validateGovernRuntimeClosurePacket } from "./validate-govern-runtime-closure-packet.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const defaultPacketPath = "ops/mullu-govern-public-beta-approval-packet.md";
const allowedArgs = new Set(["--json"]);

const approvalInputKeys = Object.freeze([
  ...requiredLiveEvidenceApprovalKeys,
  "rollback_witness_ref",
  "support_readiness_ref",
]);

const currentAllowedEvidenceRefs = new Map([
  [
    "rollback_witness_ref",
    "control-plane:pull/1686:scripts/validate_govern_evaluate_route_rollback.py",
  ],
  [
    "support_readiness_ref",
    "site:ops/mullu-govern-support-readiness.md",
  ],
]);

const requiredTerms = [
  "packet_state=AwaitingEvidence",
  "approval_state=NotApproved",
  "public_write_route_allowed=false",
  "current_decision=KeepBlocked",
  "route_publication_action=none",
  "dns_mutation=none",
  "runtime_mutation=none",
  "secret_rotation_required=false",
  "POST /v1/govern/evaluate",
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

export function validateApprovalPacketContent(content, context = {}) {
  const findings = [];

  for (const term of requiredTerms) {
    if (!content.includes(term)) findings.push(`required_term_missing:${term}`);
  }

  findings.push(
    ...scanForbiddenEvidencePatterns("approval_packet", content)
      .map((finding) => finding.replace("forbidden_private_value_pattern:approval_packet:", "forbidden_private_value_pattern:")),
  );

  const packetState = lineValue(content, "packet_state");
  const approvalState = lineValue(content, "approval_state");
  const publicWriteRouteAllowed = lineValue(content, "public_write_route_allowed");
  const routePublicationAction = lineValue(content, "route_publication_action");
  const dnsMutation = lineValue(content, "dns_mutation");
  const runtimeMutation = lineValue(content, "runtime_mutation");
  const secretRotationRequired = lineValue(content, "secret_rotation_required");
  const missingApprovalInputs = approvalInputKeys.filter((key) => lineValue(content, key) === "missing");
  const closedApprovalInputs = approvalInputKeys.filter((key) => {
    const value = lineValue(content, key);
    return value && value !== "missing";
  });

  if (packetState !== "AwaitingEvidence") {
    findings.push(`packet_state_must_remain_awaiting_evidence:${packetState || "missing"}`);
  }
  if (approvalState !== "NotApproved") {
    findings.push(`approval_state_must_remain_not_approved:${approvalState || "missing"}`);
  }
  if (publicWriteRouteAllowed !== "false") {
    findings.push(`public_write_route_allowed_must_remain_false:${publicWriteRouteAllowed || "missing"}`);
  }
  if (routePublicationAction !== "none") {
    findings.push(`route_publication_action_must_remain_none:${routePublicationAction || "missing"}`);
  }
  if (dnsMutation !== "none") {
    findings.push(`dns_mutation_must_remain_none:${dnsMutation || "missing"}`);
  }
  if (runtimeMutation !== "none") {
    findings.push(`runtime_mutation_must_remain_none:${runtimeMutation || "missing"}`);
  }
  if (secretRotationRequired !== "false") {
    findings.push(`secret_rotation_required_must_remain_false:${secretRotationRequired || "missing"}`);
  }

  for (const key of approvalInputKeys) {
    const value = lineValue(content, key);
    if (!value) findings.push(`approval_input_missing:${key}`);
    if (value && value !== "missing") {
      const allowedValue = currentAllowedEvidenceRefs.get(key);
      if (value !== allowedValue) {
        findings.push(`approval_input_ref_not_allowed:${key}`);
      }
      const refResult = validatePublicSafeEvidenceRef(value);
      for (const refFinding of refResult.findings) {
        findings.push(`approval_input_ref_invalid:${key}:${refFinding}`);
      }
    }
  }

  if (missingApprovalInputs.length !== approvalInputKeys.length - currentAllowedEvidenceRefs.size) {
    findings.push(`approval_inputs_must_remain_missing_except_allowed_refs:${missingApprovalInputs.length}/${approvalInputKeys.length}`);
  }

  for (const [key, expectedValue] of currentAllowedEvidenceRefs) {
    const value = lineValue(content, key);
    if (value !== expectedValue) findings.push(`required_allowed_evidence_ref_missing:${key}`);
  }

  if (context.writeRouteDecision) {
    if (context.writeRouteDecision.solverOutcome !== "SolvedVerified") {
      findings.push(`write_route_decision_not_solved:${context.writeRouteDecision.solverOutcome || "missing"}`);
    }
    if (context.writeRouteDecision.proofState !== "Pass") {
      findings.push(`write_route_decision_proof_not_pass:${context.writeRouteDecision.proofState || "missing"}`);
    }
    if (context.writeRouteDecision.decisionState !== "KeepBlocked") {
      findings.push(`write_route_decision_must_remain_keep_blocked:${context.writeRouteDecision.decisionState || "missing"}`);
    }
    if (context.writeRouteDecision.publicWriteRouteAllowed !== false) {
      findings.push("write_route_decision_public_route_not_blocked");
    }
  }

  if (context.runtimeClosurePacket) {
    if (context.runtimeClosurePacket.solverOutcome !== "SolvedVerified") {
      findings.push(`runtime_closure_packet_not_solved:${context.runtimeClosurePacket.solverOutcome || "missing"}`);
    }
    if (context.runtimeClosurePacket.proofState !== "Pass") {
      findings.push(`runtime_closure_packet_proof_not_pass:${context.runtimeClosurePacket.proofState || "missing"}`);
    }
    if (context.runtimeClosurePacket.runtimeWitnessClosureAllowed !== false) {
      findings.push("runtime_closure_packet_closure_not_blocked");
    }
    if (context.runtimeClosurePacket.productClaimsAllowed !== false) {
      findings.push("runtime_closure_packet_product_claims_not_blocked");
    }
  }

  return {
    approvalState: approvalState || "Unknown",
    closedApprovalInputs,
    missingApprovalInputs,
    packetState: packetState || "Unknown",
    proofState: findings.length === 0 ? "Pass" : "Fail",
    publicWriteRouteAllowed: publicWriteRouteAllowed === "true",
    solverOutcome: findings.length === 0 ? "SolvedVerified" : "GovernanceBlocked",
    findings,
  };
}

export function validateGovernPublicBetaApprovalPacket(relativePath = defaultPacketPath) {
  return validateApprovalPacketContent(readUtf8(relativePath), {
    runtimeClosurePacket: validateGovernRuntimeClosurePacket(),
    writeRouteDecision: validateGovernEvaluateWriteRouteDecision(),
  });
}

export function formatApprovalPacketReport(result) {
  return [
    `govern_public_beta_approval_packet=${result.solverOutcome}`,
    `proof_state=${result.proofState}`,
    `packet_state=${result.packetState}`,
    `approval_state=${result.approvalState}`,
    `public_write_route_allowed=${result.publicWriteRouteAllowed ? "true" : "false"}`,
    `missing_approval_input_count=${result.missingApprovalInputs.length}`,
    `finding_count=${result.findings.length}`,
    ...result.findings.map((finding) => `finding=${finding}`),
    "secret_values=not_recorded",
    "host_addresses=not_recorded",
    "database_urls=not_recorded",
  ].join("\n");
}

function main() {
  const args = process.argv.slice(2);
  const invalidArgs = unsupportedArgs(args);
  if (invalidArgs.length > 0) {
    const result = {
      approvalState: "Unknown",
      findings: [`unsupported_args:${invalidArgs.join(",")}`],
      missingApprovalInputs: [],
      packetState: "Unknown",
      proofState: "Fail",
      publicWriteRouteAllowed: false,
      solverOutcome: "GovernanceBlocked",
    };
    if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
    else console.log(formatApprovalPacketReport(result));
    process.exit(1);
    return;
  }

  const result = validateGovernPublicBetaApprovalPacket();
  if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
  else console.log(formatApprovalPacketReport(result));
  if (result.findings.length > 0) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
