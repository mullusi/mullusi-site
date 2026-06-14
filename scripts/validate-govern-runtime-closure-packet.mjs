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
const defaultPacketPath = "ops/runtime-witness/mullu-govern-closure-packet.md";
const allowedArgs = new Set(["--json"]);
const productId = "mullu-govern";

const requiredPacketTerms = [
  "Mullu Govern Runtime Witness Closure Packet",
  "product_id=mullu-govern",
  "packet_state=AwaitingEvidence",
  "candidate_state=SelectedNotPromoted",
  "api_gateway_exposure_state=SolvedVerified",
  "product_status=limited-preview",
  "product_registry_status=awaiting-evidence",
  "runtime_witness_registry_state=AwaitingEvidence",
  "runtime_witness_closure_allowed=false",
  "product_claims_allowed=false",
  "write_route_decision=ops/mullu-govern-evaluate-write-route-decision.md",
  "public_beta_approval_packet=ops/mullu-govern-public-beta-approval-packet.md",
  "POST /v1/govern/evaluate",
  "product write route intentionally not published",
  "responses, signatures, provider host data, database URLs, headers, and secrets",
  "Product manifest status | public-beta or production before public exposure | preflight Ready; current limited-preview",
  "Runtime witness proofState | SolvedVerified | AwaitingEvidence",
  "Runtime state | public-witness-ready or production-ready | private-only",
  "Public exposure | allowed | blocked",
  "Operator approval readiness | approval packet organized without approval | preflight Ready; approval NotApproved",
  "Live evidence sequence | collection order explicit without live action | preflight Ready; live evidence collection blocked",
  "Public-beta approval packet | ReadyForApproval or stronger | AwaitingEvidence in `ops/mullu-govern-public-beta-approval-packet.md`",
  "STATUS:",
];

const expectedBlockers = [
  "blocker=product_status_promotion_approval_missing",
  "blocker=product_evaluate_write_route_approval_missing",
  "blocker=product_api_contract_live_execution_not_published",
  "blocker=product_privacy_boundary_not_verified",
  "blocker=product_retention_boundary_not_verified",
  "blocker=dashboard_operator_readiness_evidence_missing",
  "blocker=public_claim_update_evidence_missing",
  "blocker=runtime_witness_registry_not_closed",
];

function readUtf8(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
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
    if (!evidence.packet.includes(term)) findings.push(`required_packet_term_missing:${term}`);
  }

  for (const blocker of expectedBlockers) {
    if (!evidence.packet.includes(blocker)) findings.push(`runtime_blocker_missing:${blocker}`);
  }

  for (const [source, content] of Object.entries(evidence.privateValueScanSources)) {
    findings.push(...scanForbiddenEvidencePatterns(source, content));
  }

  if (!runtimeWitness) {
    findings.push("runtime_registry_mullu_govern_witness_missing");
  } else {
    if (runtimeWitness.proofState !== "AwaitingEvidence") {
      findings.push(`runtime_registry_proof_state_must_remain_awaiting:${runtimeWitness.proofState || "missing"}`);
    }
    if (runtimeWitness.runtimeState !== "private-only") {
      findings.push(`runtime_registry_runtime_state_must_remain_private_only:${runtimeWitness.runtimeState || "missing"}`);
    }
    if (runtimeWitness.publicExposure?.allowed !== false) {
      findings.push("runtime_registry_public_exposure_must_remain_blocked");
    }
    if (runtimeWitness.publicExposure?.state !== "blocked") {
      findings.push(`runtime_registry_public_exposure_state_must_remain_blocked:${runtimeWitness.publicExposure?.state || "missing"}`);
    }
    if (runtimeWitness.rollback?.state !== "Ready") {
      findings.push(`runtime_registry_rollback_state_must_remain_ready:${runtimeWitness.rollback?.state || "missing"}`);
    }
  }

  if (evidence.manifest?.status !== "limited-preview") {
    findings.push(`manifest_status_must_remain_limited_preview:${evidence.manifest?.status || "missing"}`);
  }
  if (evidence.manifest?.presentation?.registryStatus !== "awaiting-evidence") {
    findings.push(`manifest_registry_status_must_remain_awaiting:${evidence.manifest?.presentation?.registryStatus || "missing"}`);
  }

  if (lineValue(evidence.packet, "runtime_witness_closure_allowed") !== "false") {
    findings.push(`runtime_witness_closure_allowed_must_remain_false:${lineValue(evidence.packet, "runtime_witness_closure_allowed") || "missing"}`);
  }
  if (lineValue(evidence.packet, "product_claims_allowed") !== "false") {
    findings.push(`product_claims_allowed_must_remain_false:${lineValue(evidence.packet, "product_claims_allowed") || "missing"}`);
  }
  if (lineValue(evidence.packet, "runtime_witness_registry_state") !== "AwaitingEvidence") {
    findings.push(`packet_runtime_registry_state_must_remain_awaiting:${lineValue(evidence.packet, "runtime_witness_registry_state") || "missing"}`);
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
  if (lineValue(evidence.liveEvidenceSequence, "ready_for_live_evidence") !== "false") {
    findings.push(`live_evidence_sequence_must_remain_not_ready:${lineValue(evidence.liveEvidenceSequence, "ready_for_live_evidence") || "missing"}`);
  }
  if (evidence.writeRouteDecision?.solverOutcome !== "SolvedVerified") {
    findings.push(`write_route_decision_not_solved:${evidence.writeRouteDecision?.solverOutcome || "missing"}`);
  }
  if (evidence.writeRouteDecision?.proofState !== "Pass") {
    findings.push(`write_route_decision_proof_not_pass:${evidence.writeRouteDecision?.proofState || "missing"}`);
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
    findings: [`unsupported_args:${invalidArgs.join(",")}`],
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
