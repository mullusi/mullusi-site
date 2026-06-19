/*
Purpose: validate public-safe product-status promotion preflight evidence for Mullu Govern.
Governance scope: limited-preview preservation, release-gate ordering, approval-packet fail-closed refs, public write-route blocking, runtime closure blocking, and no-secret evidence.
Dependencies: Node.js standard library, ops/mullu-govern-product-status-preflight.md, product manifest, public-beta approval packet, write-route decision validator, runtime closure validator, and approval-packet validator.
Invariants: read-only; does not promote product status, publish routes, activate privacy or retention, mutate DNS, or print private values.
Test contract: run node scripts/test-validate-govern-product-status-preflight.mjs.
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { scanForbiddenEvidencePatterns } from "./govern-live-evidence-ref-contract.mjs";
import { validateGovernPublicBetaApprovalPacket } from "./validate-govern-public-beta-approval-packet.mjs";
import { validateGovernEvaluateWriteRouteDecision } from "./validate-govern-evaluate-write-route-decision.mjs";
import { validateGovernRuntimeClosurePacket } from "./validate-govern-runtime-closure-packet.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const repoRootPrefix = `${repoRoot}${path.sep}`;
const defaultWitnessPath = "ops/mullu-govern-product-status-preflight.md";
const allowedArgs = new Set(["--json"]);

const expectedPromotionPath = [
  "private-incubation",
  "internal-alpha",
  "limited-preview",
  "public-beta",
  "production",
];

const requiredReleaseGates = [
  "route",
  "docs",
  "api_contract",
  "privacy",
  "runtime_witness",
  "rollback",
  "support",
  "status",
];

const requiredWitnessTerms = [
  { id: "product_status_preflight_state", text: "product_status_preflight_state=Ready" },
  { id: "solver_outcome", text: "solver_outcome=SolvedVerified" },
  { id: "proof_state", text: "proof_state=Pass" },
  { id: "product_status_current", text: "product_status_current=limited-preview" },
  { id: "product_status_target", text: "product_status_target=public-beta" },
  { id: "product_status_promotion_allowed", text: "product_status_promotion_allowed=false" },
  { id: "product_status_promotion_ref", text: "product_status_promotion_ref=missing" },
  { id: "public_write_route_allowed", text: "public_write_route_allowed=false" },
  { id: "route_publication_action", text: "route_publication_action=none" },
  { id: "dns_mutation", text: "dns_mutation=none" },
  { id: "runtime_mutation", text: "runtime_mutation=none" },
  { id: "secret_rotation_required", text: "secret_rotation_required=false" },
  { id: "public_beta_claim_allowed", text: "public_beta_claim_allowed=false" },
  { id: "status_block", text: "STATUS:" },
];

const publicProductStatusAllowedScalars = new Set([
  "missing",
  "false",
  "true",
  "none",
  "mullu-govern",
  "limited-preview",
  "public-beta",
  "planned",
  "SolvedVerified",
  "GovernanceBlocked",
  "Pass",
  "Fail",
]);

function blockedResult(finding) {
  return {
    findingCount: 1,
    findings: [finding],
    manifestStatus: "Unknown",
    productStatusPreflightState: "Blocked",
    proofState: "Fail",
    publicWriteRouteAllowed: false,
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
  const result = readUtf8Result(relativePath, "product_status_evidence");
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

export function publicProductStatusScalarLabel(value) {
  if (value === undefined || value === null || value === "" || value === "Unknown") return "missing";
  if (typeof value === "boolean") return `boolean:${value ? "true" : "false"}`;
  if (typeof value === "string" && publicProductStatusAllowedScalars.has(value)) return value;
  if (typeof value === "string") return "redacted_value";
  if (typeof value === "number") return "number";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  return typeof value;
}

function sameOrderedValues(observed, expected) {
  return Array.isArray(observed)
    && observed.length === expected.length
    && observed.every((value, index) => value === expected[index]);
}

function includesAll(observed, expected) {
  return Array.isArray(observed) && expected.every((value) => observed.includes(value));
}

function aggregateValidatorResults() {
  return {
    approvalPacket: validateGovernPublicBetaApprovalPacket(),
    runtimeClosurePacket: validateGovernRuntimeClosurePacket(),
    writeRouteDecision: validateGovernEvaluateWriteRouteDecision(),
  };
}

export function validateGovernProductStatusPreflightEvidence(evidence) {
  const findings = [];

  for (const term of requiredWitnessTerms) {
    if (!evidence.witness.includes(term.text)) findings.push(`required_witness_term_missing:${term.id}`);
  }

  for (const [source, content] of Object.entries(evidence.privateValueScanSources)) {
    findings.push(...scanForbiddenEvidencePatterns(source, content));
  }

  if (evidence.manifest?.id !== "mullu-govern") {
    findings.push(`manifest_id_invalid:${publicProductStatusScalarLabel(evidence.manifest?.id)}`);
  }
  if (evidence.manifest?.status !== "limited-preview") {
    findings.push(`manifest_status_must_remain_limited_preview:${publicProductStatusScalarLabel(evidence.manifest?.status)}`);
  }
  if (!sameOrderedValues(evidence.manifest?.releaseGate?.promotionPath, expectedPromotionPath)) {
    findings.push(`manifest_promotion_path_invalid:${Array.isArray(evidence.manifest?.releaseGate?.promotionPath) ? "redacted_value" : "missing"}`);
  }
  if (!includesAll(evidence.manifest?.releaseGate?.required, requiredReleaseGates)) {
    findings.push("manifest_required_release_gates_incomplete");
  }

  const route = evidence.manifest?.api?.routes?.find((candidate) => (
    candidate.method === "POST" && candidate.path === "/v1/govern/evaluate"
  ));
  if (!route) findings.push("manifest_evaluate_route_missing");
  if (evidence.manifest?.api?.exposure !== "planned") {
    findings.push(`manifest_api_exposure_must_remain_planned:${publicProductStatusScalarLabel(evidence.manifest?.api?.exposure)}`);
  }

  if (!evidence.approvalPacket.includes("public_write_route_allowed=false")) {
    findings.push("approval_packet_write_route_not_blocked");
  }
  if (lineValue(evidence.approvalPacket, "product_status_current") !== "limited-preview") {
    findings.push(`approval_packet_product_status_current_invalid:${publicProductStatusScalarLabel(lineValue(evidence.approvalPacket, "product_status_current"))}`);
  }
  if (lineValue(evidence.approvalPacket, "product_status_target") !== "public-beta") {
    findings.push(`approval_packet_product_status_target_invalid:${publicProductStatusScalarLabel(lineValue(evidence.approvalPacket, "product_status_target"))}`);
  }
  if (lineValue(evidence.approvalPacket, "product_status_promotion_ref") !== "missing") {
    findings.push(`approval_packet_product_status_promotion_ref_must_remain_missing:${publicProductStatusScalarLabel(lineValue(evidence.approvalPacket, "product_status_promotion_ref"))}`);
  }

  const expectedPassResults = {
    approvalPacket: "SolvedVerified",
    runtimeClosurePacket: "SolvedVerified",
    writeRouteDecision: "SolvedVerified",
  };
  for (const [name, expectedOutcome] of Object.entries(expectedPassResults)) {
    const observed = evidence.validatorResults?.[name]?.solverOutcome;
    if (observed !== expectedOutcome) {
      findings.push(`aggregate_validator_not_solved:${name}:${publicProductStatusScalarLabel(observed)}`);
    }
    const proofState = evidence.validatorResults?.[name]?.proofState;
    if (proofState !== "Pass") {
      findings.push(`aggregate_validator_proof_not_pass:${name}:${publicProductStatusScalarLabel(proofState)}`);
    }
  }
  const missingApprovalInputCount = evidence.validatorResults?.approvalPacket?.missingApprovalInputs?.length ?? 0;
  if (missingApprovalInputCount !== 8) {
    findings.push(`approval_packet_missing_input_count_must_remain_eight:${missingApprovalInputCount}`);
  }
  if (evidence.validatorResults?.approvalPacket?.publicWriteRouteAllowed !== false) {
    findings.push("approval_packet_public_write_route_not_blocked");
  }
  if (evidence.validatorResults?.runtimeClosurePacket?.runtimeWitnessClosureAllowed !== false) {
    findings.push("runtime_closure_packet_must_not_allow_runtime_closure");
  }
  if (evidence.validatorResults?.runtimeClosurePacket?.productClaimsAllowed !== false) {
    findings.push("runtime_closure_packet_must_not_allow_product_claims");
  }
  if (evidence.validatorResults?.runtimeClosurePacket?.publicWriteRouteAllowed !== false) {
    findings.push("runtime_closure_packet_public_write_route_not_blocked");
  }
  if (evidence.validatorResults?.writeRouteDecision?.publicWriteRouteAllowed !== false) {
    findings.push("write_route_decision_public_route_not_blocked");
  }
  if (evidence.validatorResults?.writeRouteDecision?.routePublicationAction !== "none") {
    findings.push(`write_route_decision_route_publication_action_must_remain_none:${publicProductStatusScalarLabel(evidence.validatorResults?.writeRouteDecision?.routePublicationAction)}`);
  }

  return {
    findingCount: findings.length,
    findings,
    manifestStatus: publicProductStatusScalarLabel(evidence.manifest?.status),
    productStatusPreflightState: findings.length === 0 ? "Ready" : "Blocked",
    proofState: findings.length === 0 ? "Pass" : "Fail",
    publicWriteRouteAllowed: evidence.approvalPacket.includes("public_write_route_allowed=true"),
    solverOutcome: findings.length === 0 ? "SolvedVerified" : "GovernanceBlocked",
  };
}

export function collectGovernProductStatusPreflightEvidence(relativePath = defaultWitnessPath) {
  const witness = readUtf8(relativePath);
  return {
    approvalPacket: readUtf8("ops/mullu-govern-public-beta-approval-packet.md"),
    manifest: readJson("products/mullu-govern/product.manifest.json"),
    privateValueScanSources: {
      approvalPacket: readUtf8("ops/mullu-govern-public-beta-approval-packet.md"),
      manifest: readUtf8("products/mullu-govern/product.manifest.json"),
      witness,
    },
    validatorResults: aggregateValidatorResults(),
    witness,
  };
}

export function validateGovernProductStatusPreflight(relativePath = defaultWitnessPath) {
  const witnessRead = readUtf8Result(relativePath, "product_status_preflight");
  if (witnessRead.finding) {
    return blockedResult(witnessRead.finding);
  }

  return validateGovernProductStatusPreflightEvidence(collectGovernProductStatusPreflightEvidence(relativePath));
}

export function formatGovernProductStatusPreflightReport(result) {
  return [
    `govern_product_status_preflight=${result.solverOutcome}`,
    `proof_state=${result.proofState}`,
    `product_status_preflight_state=${result.productStatusPreflightState}`,
    `manifest_status=${result.manifestStatus}`,
    `product_status_promotion_allowed=false`,
    `public_write_route_allowed=${result.publicWriteRouteAllowed ? "true" : "false"}`,
    `finding_count=${result.findingCount}`,
    ...result.findings.map((finding) => `finding=${finding}`),
    "secret_values=not_recorded",
    "host_addresses=not_recorded",
    "database_urls=not_recorded",
    "raw_user_data=not_recorded",
  ].join("\n");
}

function main() {
  const args = process.argv.slice(2);
  const invalidArgs = unsupportedArgs(args);
  if (invalidArgs.length > 0) {
    const result = {
      findingCount: invalidArgs.length,
      findings: [`unsupported_args_count:${invalidArgs.length}`],
      manifestStatus: "Unknown",
      productStatusPreflightState: "Blocked",
      proofState: "Fail",
      publicWriteRouteAllowed: false,
      solverOutcome: "GovernanceBlocked",
    };
    if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
    else console.log(formatGovernProductStatusPreflightReport(result));
    process.exit(1);
    return;
  }

  const result = validateGovernProductStatusPreflight();
  if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
  else console.log(formatGovernProductStatusPreflightReport(result));
  if (result.findings.length > 0) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
