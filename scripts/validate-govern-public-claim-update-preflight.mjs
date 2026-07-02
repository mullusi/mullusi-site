/*
Purpose: validate public-safe public-claim update preflight evidence for Mullu Govern.
Governance scope: limited-preview preservation, generated claim blocking, proof-boundary blocking, approval-packet fail-closed refs, product-status blocking, public write-route blocking, runtime closure blocking, and no-secret evidence.
Dependencies: Node.js standard library, ops/mullu-govern-public-claim-update-preflight.md, product manifest, proof boundary, generated product and claim registries, public-claim gate, public-beta approval packet, product-status validator, write-route decision validator, runtime closure validator, and approval-packet validator.
Invariants: read-only; does not promote product status, render claims, publish routes, activate privacy or retention, mutate DNS, or print private values.
Test contract: run node scripts/test-validate-govern-public-claim-update-preflight.mjs.
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { scanForbiddenEvidencePatterns } from "./govern-live-evidence-ref-contract.mjs";
import { validateGovernPublicBetaApprovalPacket } from "./validate-govern-public-beta-approval-packet.mjs";
import { validateGovernEvaluateWriteRouteDecision } from "./validate-govern-evaluate-write-route-decision.mjs";
import { validateGovernProductStatusPreflight } from "./validate-govern-product-status-preflight.mjs";
import { validateGovernRuntimeClosurePacket } from "./validate-govern-runtime-closure-packet.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const repoRootPrefix = `${repoRoot}${path.sep}`;
const defaultWitnessPath = "ops/mullu-govern-public-claim-update-preflight.md";
const allowedArgs = new Set(["--json"]);

const expectedBlockedClaims = [
  "mullu-govern.blocked.dashboard-operator-readiness",
  "mullu-govern.blocked.production-runtime-witness-closure",
  "mullu-govern.blocked.public-proof-stamp-issuance",
];

const requiredWitnessTerms = [
  { id: "public_claim_update_preflight_state", text: "public_claim_update_preflight_state=Ready" },
  { id: "solver_outcome", text: "solver_outcome=SolvedVerified" },
  { id: "proof_state", text: "proof_state=Pass" },
  { id: "product_status_current", text: "product_status_current=limited-preview" },
  { id: "public_claim_update_allowed", text: "public_claim_update_allowed=false" },
  { id: "public_claim_update_ref", text: "public_claim_update_ref=missing" },
  { id: "bounded_public_claim_update_ref", text: "bounded_public_claim_update_ref=github:pull/348:govern-public-claim-update" },
  { id: "public_beta_claim_allowed", text: "public_beta_claim_allowed=false" },
  { id: "renderable_claim_count", text: "renderable_claim_count=0" },
  { id: "govern_blocked_claim_count", text: "govern_blocked_claim_count=3" },
  { id: "public_write_route_allowed", text: "public_write_route_allowed=false" },
  { id: "route_publication_action", text: "route_publication_action=none" },
  { id: "dns_mutation", text: "dns_mutation=none" },
  { id: "runtime_mutation", text: "runtime_mutation=none" },
  { id: "secret_rotation_required", text: "secret_rotation_required=false" },
  { id: "provider_values_recorded", text: "provider_values_recorded=false" },
  { id: "status_block", text: "STATUS:" },
];

const publicClaimUpdateAllowedScalars = new Set([
  "0",
  "3",
  "8",
  "AwaitingEvidence",
  "Blocked",
  "Fail",
  "GovernanceBlocked",
  "Pass",
  "Ready",
  "SolvedVerified",
  "block",
  "blocked",
  "false",
  "limited-preview",
  "missing",
  "mullu-govern",
  "none",
  "true",
  ...expectedBlockedClaims,
]);

function publicClaimUpdateScalarLabel(value) {
  if (value === undefined || value === null || value === "") return "missing";
  const scalar = String(value);
  if (publicClaimUpdateAllowedScalars.has(scalar)) return scalar;
  if (/^\d+$/.test(scalar)) return "number";
  return "redacted_value";
}

function publicClaimUpdateListLabel(values) {
  if (!Array.isArray(values) || values.length === 0) return "missing";
  if (values.every((value) => publicClaimUpdateAllowedScalars.has(String(value)))) {
    return values.join(",");
  }
  return `list_length:${values.length}`;
}

function blockedResult(finding) {
  return {
    findingCount: 1,
    findings: [finding],
    governBlockedClaimCount: 0,
    proofState: "Fail",
    publicClaimUpdatePreflightState: "Blocked",
    publicWriteRouteAllowed: false,
    renderableClaimCount: 0,
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
  const result = readUtf8Result(relativePath, "public_claim_evidence");
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

function sameSet(observed, expected) {
  return Array.isArray(observed)
    && observed.length === expected.length
    && expected.every((value) => observed.includes(value));
}

function governGeneratedProduct(productsRegistry) {
  return (productsRegistry.products || []).find((product) => product.id === "mullu-govern");
}

function governGeneratedClaims(claimRegistry) {
  return (claimRegistry.claims || []).filter((claim) => claim.productId === "mullu-govern");
}

function aggregateValidatorResults() {
  return {
    approvalPacket: validateGovernPublicBetaApprovalPacket(),
    productStatusPreflight: validateGovernProductStatusPreflight(),
    runtimeClosurePacket: validateGovernRuntimeClosurePacket(),
    writeRouteDecision: validateGovernEvaluateWriteRouteDecision(),
  };
}

export function validateGovernPublicClaimUpdatePreflightEvidence(evidence) {
  const findings = [];

  for (const term of requiredWitnessTerms) {
    if (!evidence.witness.includes(term.text)) findings.push(`required_witness_term_missing:${term.id}`);
  }

  for (const [source, content] of Object.entries(evidence.privateValueScanSources)) {
    findings.push(...scanForbiddenEvidencePatterns(source, content));
  }

  if (!evidence.publicClaimGate.includes("no public claim ships without a status, evidence basis, exposure decision, and rollback path")) {
    findings.push("public_claim_gate_invariant_missing");
  }
  if (evidence.manifest?.id !== "mullu-govern") {
    findings.push(`manifest_id_invalid:${publicClaimUpdateScalarLabel(evidence.manifest?.id)}`);
  }
  if (evidence.manifest?.status !== "limited-preview") {
    findings.push(`manifest_status_must_remain_limited_preview:${publicClaimUpdateScalarLabel(evidence.manifest?.status)}`);
  }
  if (!Array.isArray(evidence.manifest?.proof?.claimsAllowed) || evidence.manifest.proof.claimsAllowed.length !== 0) {
    findings.push("manifest_claims_allowed_must_remain_empty");
  }
  if (!sameSet(evidence.manifest?.proof?.claimsBlockedUntilVerified, [
    "production runtime witness closure",
    "public proof stamp issuance",
    "dashboard operator readiness",
  ])) {
    findings.push("manifest_blocked_claims_invalid");
  }

  if (evidence.proof?.productId !== "mullu-govern") {
    findings.push(`proof_product_id_invalid:${publicClaimUpdateScalarLabel(evidence.proof?.productId)}`);
  }
  if (evidence.proof?.proofState !== "AwaitingEvidence") {
    findings.push(`proof_state_must_remain_awaiting_evidence:${publicClaimUpdateScalarLabel(evidence.proof?.proofState)}`);
  }
  if (!Array.isArray(evidence.proof?.claimsAllowed) || evidence.proof.claimsAllowed.length !== 0) {
    findings.push("proof_claims_allowed_must_remain_empty");
  }
  const proofClaimIds = (evidence.proof?.claimBindings || []).map((claim) => claim.claimId);
  if (!sameSet(proofClaimIds, expectedBlockedClaims)) {
    findings.push(`proof_claim_bindings_invalid:${publicClaimUpdateListLabel(proofClaimIds)}`);
  }
  for (const claim of evidence.proof?.claimBindings || []) {
    if (claim.state !== "blocked") findings.push(`proof_claim_state_must_remain_blocked:${publicClaimUpdateScalarLabel(claim.claimId)}`);
    if (claim.renderDecision !== "block") findings.push(`proof_claim_render_decision_must_remain_block:${publicClaimUpdateScalarLabel(claim.claimId)}`);
    if (claim.proofState !== "AwaitingEvidence") findings.push(`proof_claim_proof_state_must_remain_awaiting:${publicClaimUpdateScalarLabel(claim.claimId)}`);
  }

  const productRecord = governGeneratedProduct(evidence.productsRegistry);
  if (!productRecord) findings.push("generated_product_record_missing:mullu-govern");
  if (productRecord?.status !== "limited-preview") {
    findings.push(`generated_product_status_must_remain_limited_preview:${publicClaimUpdateScalarLabel(productRecord?.status)}`);
  }
  if (productRecord?.publicExposureAllowed !== false) {
    findings.push(`generated_product_public_exposure_must_remain_false:${publicClaimUpdateScalarLabel(productRecord?.publicExposureAllowed)}`);
  }
  if (productRecord?.releaseGateState !== "blocked") {
    findings.push(`generated_product_release_gate_must_remain_blocked:${publicClaimUpdateScalarLabel(productRecord?.releaseGateState)}`);
  }

  const renderableClaims = evidence.claimRegistry?.renderableClaims || [];
  if (!Array.isArray(renderableClaims) || renderableClaims.length !== 0) {
    findings.push(`generated_renderable_claim_count_must_remain_zero:${Array.isArray(renderableClaims) ? renderableClaims.length : "missing"}`);
  }
  const generatedClaims = governGeneratedClaims(evidence.claimRegistry);
  const generatedClaimIds = generatedClaims.map((claim) => claim.claimId);
  if (!sameSet(generatedClaimIds, expectedBlockedClaims)) {
    findings.push(`generated_govern_claims_invalid:${publicClaimUpdateListLabel(generatedClaimIds)}`);
  }
  for (const claim of generatedClaims) {
    if (claim.publicRenderAllowed !== false) findings.push(`generated_claim_public_render_must_remain_false:${publicClaimUpdateScalarLabel(claim.claimId)}`);
    if (claim.renderDecision !== "block") findings.push(`generated_claim_render_decision_must_remain_block:${publicClaimUpdateScalarLabel(claim.claimId)}`);
    if (claim.runtimeWitnessClosed !== false) findings.push(`generated_claim_runtime_witness_must_remain_open:${publicClaimUpdateScalarLabel(claim.claimId)}`);
  }

  if (!evidence.approvalPacket.includes("public_write_route_allowed=false")) {
    findings.push("approval_packet_write_route_not_blocked");
  }
  if (lineValue(evidence.approvalPacket, "public_claim_update_ref") !== "missing") {
    findings.push(`approval_packet_public_claim_update_ref_must_remain_missing:${publicClaimUpdateScalarLabel(lineValue(evidence.approvalPacket, "public_claim_update_ref"))}`);
  }

  const expectedPassResults = {
    approvalPacket: "SolvedVerified",
    productStatusPreflight: "SolvedVerified",
    runtimeClosurePacket: "SolvedVerified",
    writeRouteDecision: "SolvedVerified",
  };
  for (const [name, expectedOutcome] of Object.entries(expectedPassResults)) {
    const observed = evidence.validatorResults?.[name]?.solverOutcome;
    if (observed !== expectedOutcome) {
      findings.push(`aggregate_validator_not_solved:${name}:${publicClaimUpdateScalarLabel(observed)}`);
    }
    const proofState = evidence.validatorResults?.[name]?.proofState;
    if (proofState !== "Pass") {
      findings.push(`aggregate_validator_proof_not_pass:${name}:${publicClaimUpdateScalarLabel(proofState)}`);
    }
  }
  const missingApprovalInputCount = evidence.validatorResults?.approvalPacket?.missingApprovalInputs?.length ?? 0;
  if (missingApprovalInputCount !== 8) {
    findings.push(`approval_packet_missing_input_count_must_remain_eight:${missingApprovalInputCount}`);
  }
  if (evidence.validatorResults?.approvalPacket?.publicWriteRouteAllowed !== false) {
    findings.push("approval_packet_public_write_route_not_blocked");
  }
  if (evidence.validatorResults?.productStatusPreflight?.productStatusPreflightState !== "Ready") {
    findings.push(`product_status_preflight_must_remain_ready:${publicClaimUpdateScalarLabel(evidence.validatorResults?.productStatusPreflight?.productStatusPreflightState)}`);
  }
  if (evidence.validatorResults?.productStatusPreflight?.publicWriteRouteAllowed !== false) {
    findings.push("product_status_preflight_public_write_route_not_blocked");
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
    findings.push(`write_route_decision_route_publication_action_must_remain_none:${publicClaimUpdateScalarLabel(evidence.validatorResults?.writeRouteDecision?.routePublicationAction)}`);
  }

  return {
    findingCount: findings.length,
    findings,
    governBlockedClaimCount: generatedClaims.length,
    proofState: findings.length === 0 ? "Pass" : "Fail",
    publicClaimUpdatePreflightState: findings.length === 0 ? "Ready" : "Blocked",
    publicWriteRouteAllowed: evidence.approvalPacket.includes("public_write_route_allowed=true"),
    renderableClaimCount: Array.isArray(renderableClaims) ? renderableClaims.length : 0,
    solverOutcome: findings.length === 0 ? "SolvedVerified" : "GovernanceBlocked",
  };
}

export function collectGovernPublicClaimUpdatePreflightEvidence(relativePath = defaultWitnessPath) {
  const witness = readUtf8(relativePath);
  return {
    approvalPacket: readUtf8("ops/mullu-govern-public-beta-approval-packet.md"),
    claimRegistry: readJson("data/generated/claim-registry.json"),
    manifest: readJson("products/mullu-govern/product.manifest.json"),
    productsRegistry: readJson("data/generated/products.json"),
    proof: readJson("proof/govern.proof.json"),
    publicClaimGate: readUtf8("ops/public-claim-gate.md"),
    privateValueScanSources: {
      approvalPacket: readUtf8("ops/mullu-govern-public-beta-approval-packet.md"),
      manifest: readUtf8("products/mullu-govern/product.manifest.json"),
      proof: readUtf8("proof/govern.proof.json"),
      witness,
    },
    validatorResults: aggregateValidatorResults(),
    witness,
  };
}

export function validateGovernPublicClaimUpdatePreflight(relativePath = defaultWitnessPath) {
  const witnessRead = readUtf8Result(relativePath, "public_claim_update_preflight");
  if (witnessRead.finding) {
    return blockedResult(witnessRead.finding);
  }

  return validateGovernPublicClaimUpdatePreflightEvidence(collectGovernPublicClaimUpdatePreflightEvidence(relativePath));
}

export function formatGovernPublicClaimUpdatePreflightReport(result) {
  return [
    `govern_public_claim_update_preflight=${result.solverOutcome}`,
    `proof_state=${result.proofState}`,
    `public_claim_update_preflight_state=${result.publicClaimUpdatePreflightState}`,
    `renderable_claim_count=${result.renderableClaimCount}`,
    `govern_blocked_claim_count=${result.governBlockedClaimCount}`,
    "public_claim_update_allowed=false",
    `public_write_route_allowed=${result.publicWriteRouteAllowed ? "true" : "false"}`,
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
      findingCount: invalidArgs.length,
      findings: [`unsupported_args_count:${invalidArgs.length}`],
      governBlockedClaimCount: 0,
      proofState: "Fail",
      publicClaimUpdatePreflightState: "Blocked",
      publicWriteRouteAllowed: false,
      renderableClaimCount: 0,
      solverOutcome: "GovernanceBlocked",
    };
    if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
    else console.log(formatGovernPublicClaimUpdatePreflightReport(result));
    process.exit(1);
    return;
  }

  const result = validateGovernPublicClaimUpdatePreflight();
  if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
  else console.log(formatGovernPublicClaimUpdatePreflightReport(result));
  if (result.findings.length > 0) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
