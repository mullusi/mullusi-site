/*
Purpose: validate the public-safe Mullu Govern runtime witness closure packet.
Governance scope: product runtime witness closure denial, API gateway/product boundary, manifest status, runtime registry state, approval packet state, live-evidence sequence boundary, and no-secret evidence.
Dependencies: Node.js standard library, ops/runtime-witness/mullu-govern-closure-packet.md, ops/runtime-witness/registry.json, products/mullu-govern/product.manifest.json, ops/mullu-govern-public-beta-approval-packet.md, ops/mullu-govern-live-evidence-sequence-preflight.md, and shared evidence scanner.
Invariants: read-only; does not probe endpoints, publish routes, promote product status, mutate DNS/runtime/auth, update runtime witnesses, activate privacy/retention, or print private values.
Test contract: run node scripts/test-validate-govern-runtime-closure-packet.mjs.
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { scanForbiddenEvidencePatterns } from "./govern-live-evidence-ref-contract.mjs";
import { validateGovernEvaluateWriteRouteDecision } from "./validate-govern-evaluate-write-route-decision.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const repoRootPrefix = `${repoRoot}${path.sep}`;
const defaultPacketPath = "ops/runtime-witness/mullu-govern-closure-packet.md";
const allowedArgs = new Set(["--json"]);
const productId = "mullu-govern";

const requiredPacketTerms = [
  { id: "title", text: "Mullu Govern Runtime Witness Closure Packet" },
  { id: "product_id", text: "product_id=mullu-govern" },
  { id: "packet_state", text: "packet_state=AwaitingEvidence" },
  { id: "candidate_state", text: "candidate_state=SelectedNotPromoted" },
  { id: "api_gateway_exposure_state", text: "api_gateway_exposure_state=SolvedVerified" },
  { id: "product_status", text: "product_status=limited-preview" },
  { id: "product_registry_status", text: "product_registry_status=awaiting-evidence" },
  { id: "runtime_witness_registry_state", text: "runtime_witness_registry_state=AwaitingEvidence" },
  { id: "runtime_witness_closure_allowed", text: "runtime_witness_closure_allowed=false" },
  { id: "product_claims_allowed", text: "product_claims_allowed=false" },
  { id: "write_route_decision", text: "write_route_decision=ops/mullu-govern-evaluate-write-route-decision.md" },
  { id: "public_beta_approval_packet", text: "public_beta_approval_packet=ops/mullu-govern-public-beta-approval-packet.md" },
  { id: "static_deployment_witness", text: "static_deployment_witness=ops/live-deployment-integrity-witness.md" },
  { id: "static_website_integrity", text: "static_website_integrity=SolvedVerified" },
  { id: "api_exposure_probe", text: "api_exposure_probe=2026-06-25:SolvedVerified" },
  {
    id: "live_evidence_operator_request_command",
    text: "live_evidence_operator_request_command=node scripts/emit-govern-live-evidence-operator-request.mjs",
  },
  { id: "last_reviewed", text: "last_reviewed=2026-06-27" },
  { id: "review_update_2026_06_27", text: "## 2026-06-27 Review Update" },
  { id: "health_probe_pass", text: "health_probe=Pass" },
  { id: "gateway_witness_probe_pass", text: "gateway_witness_probe=Pass" },
  { id: "runtime_conformance_probe_pass", text: "runtime_conformance_probe=Pass" },
  { id: "refreshed_runtime_registry_pass", text: "runtime_witness_registry_state=Pass" },
  { id: "refreshed_runtime_closed_zero", text: "runtime_witness_closed_count=0" },
  { id: "refreshed_runtime_blocked_count", text: "runtime_witness_blocked_count=11" },
  { id: "static_integrity_source", text: "static_website_integrity_source=mullusi-site#240" },
  { id: "api_exposure_probe_command", text: "command=node scripts/check-api-exposure-gate.mjs --live --require-ready" },
  { id: "api_probe_no_raw_host", text: "raw_host_values=not_recorded" },
  { id: "evaluate_route", text: "POST /v1/govern/evaluate" },
  { id: "route_not_published", text: "product write route intentionally not published" },
  { id: "private_values_excluded", text: "responses, signatures, provider host data, database URLs, headers, and secrets" },
  { id: "static_integrity_row", text: "Static website integrity | SolvedVerified before product runtime evidence is prepared | SolvedVerified via `ops/live-deployment-integrity-witness.md`" },
  { id: "manifest_status_row", text: "Product manifest status | public-beta or production before public exposure | preflight Ready; current limited-preview" },
  { id: "runtime_proof_state_row", text: "Runtime witness proofState | SolvedVerified | AwaitingEvidence" },
  { id: "runtime_state_row", text: "Runtime state | public-witness-ready or production-ready | private-only" },
  { id: "public_exposure_row", text: "Public exposure | allowed | blocked" },
  { id: "operator_approval_row", text: "Operator approval readiness | approval packet organized without approval | preflight Ready; approval NotApproved" },
  { id: "live_evidence_sequence_row", text: "Live evidence sequence | collection order explicit without live action | preflight Ready; live evidence collection blocked" },
  { id: "public_beta_approval_row", text: "Public-beta approval packet | ReadyForApproval or stronger | AwaitingEvidence in `ops/mullu-govern-public-beta-approval-packet.md`" },
  { id: "status_block", text: "STATUS:" },
];

const expectedBlockers = [
  { id: "product_status_promotion_approval_missing", text: "blocker=product_status_promotion_approval_missing" },
  { id: "product_evaluate_write_route_approval_missing", text: "blocker=product_evaluate_write_route_approval_missing" },
  { id: "product_api_contract_live_execution_not_published", text: "blocker=product_api_contract_live_execution_not_published" },
  { id: "product_privacy_boundary_not_verified", text: "blocker=product_privacy_boundary_not_verified" },
  { id: "product_retention_boundary_not_verified", text: "blocker=product_retention_boundary_not_verified" },
  { id: "dashboard_operator_readiness_evidence_missing", text: "blocker=dashboard_operator_readiness_evidence_missing" },
  { id: "public_claim_update_evidence_missing", text: "blocker=public_claim_update_evidence_missing" },
  { id: "runtime_witness_registry_not_closed", text: "blocker=runtime_witness_registry_not_closed" },
];

const publicRuntimeClosureAllowedScalars = new Set([
  "AwaitingEvidence",
  "Blocked",
  "Fail",
  "GovernanceBlocked",
  "NotApproved",
  "Pass",
  "Ready",
  "SelectedNotPromoted",
  "SolvedVerified",
  "awaiting-evidence",
  "blocked",
  "false",
  "limited-preview",
  "missing",
  "mullu-govern",
  "none",
  "private-only",
  "true",
]);

function publicRuntimeClosureScalarLabel(value) {
  if (value === undefined || value === null || value === "") return "missing";
  const scalar = String(value);
  if (publicRuntimeClosureAllowedScalars.has(scalar)) return scalar;
  if (/^\d+$/.test(scalar)) return "number";
  return "redacted_value";
}

function blockedResult(finding) {
  return {
    findingCount: 1,
    findings: [finding],
    productClaimsAllowed: false,
    proofState: "Fail",
    publicWriteRouteAllowed: false,
    runtimeWitnessClosureAllowed: false,
    runtimeWitnessClosureState: "Blocked",
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
  const result = readUtf8Result(relativePath, "runtime_closure_evidence");
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

export function validateGovernRuntimeClosurePacketEvidence(evidence) {
  const findings = [];
  const runtimeWitness = findRuntimeWitness(evidence.runtimeRegistry);

  for (const term of requiredPacketTerms) {
    if (!evidence.packet.includes(term.text)) findings.push(`required_packet_term_missing:${term.id}`);
  }

  for (const blocker of expectedBlockers) {
    if (!evidence.packet.includes(blocker.text)) findings.push(`runtime_blocker_missing:${blocker.id}`);
  }

  for (const [source, content] of Object.entries(evidence.privateValueScanSources)) {
    findings.push(...scanForbiddenEvidencePatterns(source, content));
  }

  if (!runtimeWitness) {
    findings.push("runtime_registry_mullu_govern_witness_missing");
  } else {
    if (runtimeWitness.proofState !== "AwaitingEvidence") {
      findings.push(`runtime_registry_proof_state_must_remain_awaiting:${publicRuntimeClosureScalarLabel(runtimeWitness.proofState)}`);
    }
    if (runtimeWitness.runtimeState !== "private-only") {
      findings.push(`runtime_registry_runtime_state_must_remain_private_only:${publicRuntimeClosureScalarLabel(runtimeWitness.runtimeState)}`);
    }
    if (runtimeWitness.publicExposure?.allowed !== false) {
      findings.push("runtime_registry_public_exposure_must_remain_blocked");
    }
    if (runtimeWitness.publicExposure?.state !== "blocked") {
      findings.push(`runtime_registry_public_exposure_state_must_remain_blocked:${publicRuntimeClosureScalarLabel(runtimeWitness.publicExposure?.state)}`);
    }
    if (runtimeWitness.rollback?.state !== "Ready") {
      findings.push(`runtime_registry_rollback_state_must_remain_ready:${publicRuntimeClosureScalarLabel(runtimeWitness.rollback?.state)}`);
    }
  }

  if (evidence.manifest?.status !== "limited-preview") {
    findings.push(`manifest_status_must_remain_limited_preview:${publicRuntimeClosureScalarLabel(evidence.manifest?.status)}`);
  }
  if (evidence.manifest?.presentation?.registryStatus !== "awaiting-evidence") {
    findings.push(`manifest_registry_status_must_remain_awaiting:${publicRuntimeClosureScalarLabel(evidence.manifest?.presentation?.registryStatus)}`);
  }

  if (lineValue(evidence.packet, "runtime_witness_closure_allowed") !== "false") {
    findings.push(`runtime_witness_closure_allowed_must_remain_false:${publicRuntimeClosureScalarLabel(lineValue(evidence.packet, "runtime_witness_closure_allowed"))}`);
  }
  if (lineValue(evidence.packet, "product_claims_allowed") !== "false") {
    findings.push(`product_claims_allowed_must_remain_false:${publicRuntimeClosureScalarLabel(lineValue(evidence.packet, "product_claims_allowed"))}`);
  }
  if (lineValue(evidence.packet, "runtime_witness_registry_state") !== "AwaitingEvidence") {
    findings.push(`packet_runtime_registry_state_must_remain_awaiting:${publicRuntimeClosureScalarLabel(lineValue(evidence.packet, "runtime_witness_registry_state"))}`);
  }

  if (lineValue(evidence.approvalPacket, "packet_state") !== "AwaitingEvidence") {
    findings.push(`approval_packet_state_must_remain_awaiting:${publicRuntimeClosureScalarLabel(lineValue(evidence.approvalPacket, "packet_state"))}`);
  }
  if (lineValue(evidence.approvalPacket, "approval_state") !== "NotApproved") {
    findings.push(`approval_state_must_remain_not_approved:${publicRuntimeClosureScalarLabel(lineValue(evidence.approvalPacket, "approval_state"))}`);
  }
  if (lineValue(evidence.approvalPacket, "public_write_route_allowed") !== "false") {
    findings.push(`public_write_route_allowed_must_remain_false:${publicRuntimeClosureScalarLabel(lineValue(evidence.approvalPacket, "public_write_route_allowed"))}`);
  }
  if (lineValue(evidence.liveEvidenceSequence, "ready_for_live_evidence") !== "false") {
    findings.push(`live_evidence_sequence_must_remain_not_ready:${publicRuntimeClosureScalarLabel(lineValue(evidence.liveEvidenceSequence, "ready_for_live_evidence"))}`);
  }
  if (evidence.writeRouteDecision?.solverOutcome !== "SolvedVerified") {
    findings.push(`write_route_decision_not_solved:${publicRuntimeClosureScalarLabel(evidence.writeRouteDecision?.solverOutcome)}`);
  }
  if (evidence.writeRouteDecision?.proofState !== "Pass") {
    findings.push(`write_route_decision_proof_not_pass:${publicRuntimeClosureScalarLabel(evidence.writeRouteDecision?.proofState)}`);
  }
  if (evidence.writeRouteDecision?.publicWriteRouteAllowed !== false) {
    findings.push("write_route_decision_public_route_not_blocked");
  }

  return {
    findingCount: findings.length,
    findings,
    productClaimsAllowed: lineValue(evidence.packet, "product_claims_allowed") === "true",
    proofState: findings.length === 0 ? "Pass" : "Fail",
    publicWriteRouteAllowed: lineValue(evidence.approvalPacket, "public_write_route_allowed") === "true",
    runtimeWitnessClosureAllowed: lineValue(evidence.packet, "runtime_witness_closure_allowed") === "true",
    runtimeWitnessClosureState: findings.length === 0 ? "Ready" : "Blocked",
    solverOutcome: findings.length === 0 ? "SolvedVerified" : "GovernanceBlocked",
  };
}

export function collectGovernRuntimeClosurePacketEvidence(relativePath = defaultPacketPath) {
  const approvalPacket = readUtf8("ops/mullu-govern-public-beta-approval-packet.md");
  const liveEvidenceSequence = readUtf8("ops/mullu-govern-live-evidence-sequence-preflight.md");
  const packet = readUtf8(relativePath);
  return {
    approvalPacket,
    liveEvidenceSequence,
    manifest: readJson("products/mullu-govern/product.manifest.json"),
    packet,
    privateValueScanSources: {
      approvalPacket,
      liveEvidenceSequence,
      packet,
    },
    runtimeRegistry: readJson("ops/runtime-witness/registry.json"),
    writeRouteDecision: validateGovernEvaluateWriteRouteDecision(),
  };
}

export function validateGovernRuntimeClosurePacket(relativePath = defaultPacketPath) {
  const packetRead = readUtf8Result(relativePath, "runtime_closure_packet");
  if (packetRead.finding) {
    return blockedResult(packetRead.finding);
  }

  return validateGovernRuntimeClosurePacketEvidence(
    collectGovernRuntimeClosurePacketEvidence(relativePath),
  );
}

export function formatGovernRuntimeClosurePacketReport(result) {
  return [
    `govern_runtime_closure_packet=${result.solverOutcome}`,
    `proof_state=${result.proofState}`,
    `runtime_witness_closure_state=${result.runtimeWitnessClosureState}`,
    `runtime_witness_closure_allowed=${result.runtimeWitnessClosureAllowed ? "true" : "false"}`,
    `product_claims_allowed=${result.productClaimsAllowed ? "true" : "false"}`,
    `public_write_route_allowed=${result.publicWriteRouteAllowed ? "true" : "false"}`,
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
    productClaimsAllowed: false,
    proofState: "Fail",
    publicWriteRouteAllowed: false,
    runtimeWitnessClosureAllowed: false,
    runtimeWitnessClosureState: "Blocked",
    solverOutcome: "GovernanceBlocked",
  };
}

function main() {
  const args = process.argv.slice(2);
  const invalidArgs = unsupportedArgs(args);
  if (invalidArgs.length > 0) {
    const result = blockedResultForInvalidArgs(invalidArgs);
    if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
    else console.log(formatGovernRuntimeClosurePacketReport(result));
    process.exit(1);
    return;
  }

  const result = validateGovernRuntimeClosurePacket();
  if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
  else console.log(formatGovernRuntimeClosurePacketReport(result));
  if (result.findings.length > 0) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
