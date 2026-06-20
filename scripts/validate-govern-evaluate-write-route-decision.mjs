/*
Purpose: validate the public-safe Mullu Govern evaluate write-route decision record.
Governance scope: public POST /v1/govern/evaluate exposure denial, product status boundary, privacy and retention inactive state, runtime witness closure denial, approval packet state, and no-secret evidence.
Dependencies: Node.js standard library, ops/mullu-govern-evaluate-write-route-decision.md, products/mullu-govern/product.manifest.json, privacy/govern.policy.json, privacy/govern.retention.json, ops/mullu-govern-public-beta-approval-packet.md, ops/runtime-witness/registry.json, and the shared evidence scanner.
Invariants: read-only; does not publish routes, mutate DNS/runtime/auth, activate privacy/retention, update runtime witnesses, probe endpoints, inspect provider dashboards, or print private values.
Test contract: run node scripts/test-validate-govern-evaluate-write-route-decision.mjs.
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { scanForbiddenEvidencePatterns } from "./govern-live-evidence-ref-contract.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const repoRootPrefix = `${repoRoot}${path.sep}`;
const defaultDecisionPath = "ops/mullu-govern-evaluate-write-route-decision.md";
const allowedArgs = new Set(["--json"]);
const productId = "mullu-govern";

const requiredDecisionTerms = [
  { id: "title", text: "Mullu Govern Evaluate Write Route Decision" },
  { id: "product_id", text: "product_id=mullu-govern" },
  { id: "route", text: "route=POST /v1/govern/evaluate" },
  { id: "decision_state", text: "decision_state=KeepBlocked" },
  { id: "solver_outcome", text: "solver_outcome=AwaitingEvidence" },
  { id: "proof_state", text: "proof_state=Unknown" },
  { id: "public_write_route_allowed", text: "public_write_route_allowed=false" },
  { id: "product_status", text: "product_status=limited-preview" },
  { id: "api_gateway_exposure_state", text: "api_gateway_exposure_state=SolvedVerified" },
  { id: "runtime_witness_closure_allowed", text: "runtime_witness_closure_allowed=false" },
  { id: "approval_packet", text: "approval_packet=ops/mullu-govern-public-beta-approval-packet.md" },
  { id: "public_route_guard_row", text: "Public route guard | route remains closed before approval | `POST /v1/govern/evaluate` returns 404 | pass" },
  { id: "runtime_witness_row", text: "Runtime witness | `SolvedVerified` for product runtime | `AwaitingEvidence` | block" },
  { id: "operator_approval_row", text: "Operator approval | explicit public write-route approval ref | missing | block" },
  { id: "approval_ref", text: "approval_ref=none" },
  { id: "route_publication_action", text: "route_publication_action=none" },
  { id: "dns_mutation", text: "dns_mutation=none" },
  { id: "secret_rotation_required", text: "secret_rotation_required=false" },
  { id: "rollback_triggered", text: "rollback_triggered=false" },
  { id: "rollback_action", text: "rollback_action=remove /v1/govern/evaluate from the public gateway allowlist" },
  { id: "preserve_routes", text: "preserve_routes=/v1/health,/v1/version" },
  { id: "preserve_dns", text: "preserve_dns=api.mullusi.com" },
  { id: "status_block", text: "STATUS:" },
];

const expectedDataClasses = [
  "policy_records",
  "evaluations",
  "traces",
  "proof_stamps",
  "audit_events",
];

const publicWriteRouteDecisionAllowedScalars = new Set([
  "AwaitingEvidence",
  "Blocked",
  "Fail",
  "GovernanceBlocked",
  "KeepBlocked",
  "NotApproved",
  "Pass",
  "SolvedVerified",
  "Unknown",
  "false",
  "limited-preview",
  "missing",
  "none",
  "not-active",
  "planned",
  "true",
  ...expectedDataClasses,
]);

function publicWriteRouteDecisionScalarLabel(value) {
  if (value === undefined || value === null || value === "") return "missing";
  const scalar = String(value);
  if (publicWriteRouteDecisionAllowedScalars.has(scalar)) return scalar;
  if (/^\d+$/.test(scalar)) return "number";
  return "redacted_value";
}

function blockedResult(finding) {
  return {
    decisionState: "Blocked",
    findingCount: 1,
    findings: [finding],
    productStatus: "Unknown",
    proofState: "Fail",
    publicWriteRouteAllowed: false,
    routePublicationAction: "none",
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

function readUtf8(relativePath) {
  const result = readUtf8Result(relativePath, "evidence_source");
  if (result.finding) {
    throw new Error(result.finding);
  }
  return result.content;
}

function readJson(relativePath) {
  return JSON.parse(readUtf8(relativePath));
}

function lineValue(content, key) {
  const match = content.match(new RegExp(`^${key}=([^\\s]+)$`, "m"));
  return match?.[1] ?? "";
}

function unsupportedArgs(args) {
  return args.filter((arg) => arg.startsWith("--") && !allowedArgs.has(arg));
}

function findRuntimeWitness(registry) {
  return registry.witnesses?.find((witness) => witness.productId === productId);
}

export function validateGovernEvaluateWriteRouteDecisionEvidence(evidence) {
  const findings = [];
  const runtimeWitness = findRuntimeWitness(evidence.runtimeRegistry);

  for (const term of requiredDecisionTerms) {
    if (!evidence.decisionRecord.includes(term.text)) findings.push(`required_decision_term_missing:${term.id}`);
  }

  for (const [source, content] of Object.entries(evidence.privateValueScanSources)) {
    findings.push(...scanForbiddenEvidencePatterns(source, content));
  }

  if (lineValue(evidence.decisionRecord, "decision_state") !== "KeepBlocked") {
    findings.push(`decision_state_must_remain_keep_blocked:${publicWriteRouteDecisionScalarLabel(lineValue(evidence.decisionRecord, "decision_state"))}`);
  }
  if (lineValue(evidence.decisionRecord, "public_write_route_allowed") !== "false") {
    findings.push(`decision_public_write_route_allowed_must_remain_false:${publicWriteRouteDecisionScalarLabel(lineValue(evidence.decisionRecord, "public_write_route_allowed"))}`);
  }
  if (lineValue(evidence.decisionRecord, "runtime_witness_closure_allowed") !== "false") {
    findings.push(`decision_runtime_witness_closure_allowed_must_remain_false:${publicWriteRouteDecisionScalarLabel(lineValue(evidence.decisionRecord, "runtime_witness_closure_allowed"))}`);
  }
  if (lineValue(evidence.decisionRecord, "product_status") !== "limited-preview") {
    findings.push(`decision_product_status_must_remain_limited_preview:${publicWriteRouteDecisionScalarLabel(lineValue(evidence.decisionRecord, "product_status"))}`);
  }
  if (lineValue(evidence.decisionRecord, "route_publication_action") !== "none") {
    findings.push(`route_publication_action_must_remain_none:${publicWriteRouteDecisionScalarLabel(lineValue(evidence.decisionRecord, "route_publication_action"))}`);
  }
  if (lineValue(evidence.decisionRecord, "dns_mutation") !== "none") {
    findings.push(`dns_mutation_must_remain_none:${publicWriteRouteDecisionScalarLabel(lineValue(evidence.decisionRecord, "dns_mutation"))}`);
  }
  if (lineValue(evidence.decisionRecord, "secret_rotation_required") !== "false") {
    findings.push(`secret_rotation_required_must_remain_false:${publicWriteRouteDecisionScalarLabel(lineValue(evidence.decisionRecord, "secret_rotation_required"))}`);
  }
  if (lineValue(evidence.decisionRecord, "rollback_triggered") !== "false") {
    findings.push(`rollback_triggered_must_remain_false:${publicWriteRouteDecisionScalarLabel(lineValue(evidence.decisionRecord, "rollback_triggered"))}`);
  }

  if (evidence.manifest?.status !== "limited-preview") {
    findings.push(`manifest_status_must_remain_limited_preview:${publicWriteRouteDecisionScalarLabel(evidence.manifest?.status)}`);
  }
  if (evidence.manifest?.api?.exposure !== "planned") {
    findings.push(`manifest_api_exposure_must_remain_planned:${publicWriteRouteDecisionScalarLabel(evidence.manifest?.api?.exposure)}`);
  }
  if (evidence.privacyPolicy?.collectionState !== "not-active") {
    findings.push(`privacy_collection_state_must_remain_not_active:${publicWriteRouteDecisionScalarLabel(evidence.privacyPolicy?.collectionState)}`);
  }
  for (const row of evidence.retentionPolicy?.retention || []) {
    if (row.state !== "not-active") {
      findings.push(`retention_state_must_remain_not_active:${publicWriteRouteDecisionScalarLabel(row.dataClass)}:${publicWriteRouteDecisionScalarLabel(row.state)}`);
    }
    if (row.maximumDays !== 0) {
      findings.push(`retention_maximum_days_must_remain_zero:${publicWriteRouteDecisionScalarLabel(row.dataClass)}:${publicWriteRouteDecisionScalarLabel(row.maximumDays)}`);
    }
  }

  if (!runtimeWitness) {
    findings.push("runtime_registry_mullu_govern_witness_missing");
  } else {
    if (runtimeWitness.proofState !== "AwaitingEvidence") {
      findings.push(`runtime_registry_proof_state_must_remain_awaiting:${publicWriteRouteDecisionScalarLabel(runtimeWitness.proofState)}`);
    }
    if (runtimeWitness.publicExposure?.allowed !== false) {
      findings.push("runtime_registry_public_exposure_must_remain_blocked");
    }
  }

  if (lineValue(evidence.approvalPacket, "packet_state") !== "AwaitingEvidence") {
    findings.push(`approval_packet_state_must_remain_awaiting:${publicWriteRouteDecisionScalarLabel(lineValue(evidence.approvalPacket, "packet_state"))}`);
  }
  if (lineValue(evidence.approvalPacket, "approval_state") !== "NotApproved") {
    findings.push(`approval_state_must_remain_not_approved:${publicWriteRouteDecisionScalarLabel(lineValue(evidence.approvalPacket, "approval_state"))}`);
  }
  if (lineValue(evidence.approvalPacket, "public_write_route_allowed") !== "false") {
    findings.push(`approval_public_write_route_allowed_must_remain_false:${publicWriteRouteDecisionScalarLabel(lineValue(evidence.approvalPacket, "public_write_route_allowed"))}`);
  }

  return {
    decisionState: publicWriteRouteDecisionScalarLabel(lineValue(evidence.decisionRecord, "decision_state") || "Unknown"),
    findingCount: findings.length,
    findings,
    productStatus: publicWriteRouteDecisionScalarLabel(lineValue(evidence.decisionRecord, "product_status") || "Unknown"),
    proofState: findings.length === 0 ? "Pass" : "Fail",
    publicWriteRouteAllowed: lineValue(evidence.decisionRecord, "public_write_route_allowed") === "true",
    routePublicationAction: publicWriteRouteDecisionScalarLabel(lineValue(evidence.decisionRecord, "route_publication_action") || "Unknown"),
    solverOutcome: findings.length === 0 ? "SolvedVerified" : "GovernanceBlocked",
  };
}

export function collectGovernEvaluateWriteRouteDecisionEvidence(relativePath = defaultDecisionPath) {
  const approvalPacket = readUtf8("ops/mullu-govern-public-beta-approval-packet.md");
  const decisionRecord = readUtf8(relativePath);
  return {
    approvalPacket,
    decisionRecord,
    manifest: readJson("products/mullu-govern/product.manifest.json"),
    privacyPolicy: readJson("privacy/govern.policy.json"),
    privateValueScanSources: {
      approvalPacket,
      decisionRecord,
    },
    retentionPolicy: readJson("privacy/govern.retention.json"),
    runtimeRegistry: readJson("ops/runtime-witness/registry.json"),
  };
}

export function validateGovernEvaluateWriteRouteDecision(relativePath = defaultDecisionPath) {
  const decisionRead = readUtf8Result(relativePath, "evaluate_write_route_decision");
  if (decisionRead.finding) {
    return blockedResult(decisionRead.finding);
  }

  return validateGovernEvaluateWriteRouteDecisionEvidence(
    collectGovernEvaluateWriteRouteDecisionEvidence(relativePath),
  );
}

export function formatGovernEvaluateWriteRouteDecisionReport(result) {
  return [
    `govern_evaluate_write_route_decision=${result.solverOutcome}`,
    `proof_state=${result.proofState}`,
    `decision_state=${result.decisionState}`,
    `public_write_route_allowed=${result.publicWriteRouteAllowed ? "true" : "false"}`,
    `product_status=${result.productStatus}`,
    `route_publication_action=${result.routePublicationAction}`,
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
    decisionState: "Blocked",
    findingCount: invalidArgs.length,
    findings: [`unsupported_args_count:${invalidArgs.length}`],
    productStatus: "Unknown",
    proofState: "Fail",
    publicWriteRouteAllowed: false,
    routePublicationAction: "none",
    solverOutcome: "GovernanceBlocked",
  };
}

function main() {
  const args = process.argv.slice(2);
  const invalidArgs = unsupportedArgs(args);
  if (invalidArgs.length > 0) {
    const result = blockedResultForInvalidArgs(invalidArgs);
    if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
    else console.log(formatGovernEvaluateWriteRouteDecisionReport(result));
    process.exit(1);
    return;
  }

  const result = validateGovernEvaluateWriteRouteDecision();
  if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
  else console.log(formatGovernEvaluateWriteRouteDecisionReport(result));
  if (result.findings.length > 0) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
