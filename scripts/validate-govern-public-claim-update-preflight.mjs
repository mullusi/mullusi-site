/*
Purpose: validate public-safe public-claim update preflight evidence for Mullu Govern.
Governance scope: limited-preview preservation, generated claim blocking, proof-boundary blocking, approval-packet fail-closed refs, public write-route blocking, and no-secret evidence.
Dependencies: Node.js standard library, ops/mullu-govern-public-claim-update-preflight.md, product manifest, proof boundary, generated product and claim registries, public-claim gate, and public-beta approval packet.
Invariants: read-only; does not promote product status, render claims, publish routes, activate privacy or retention, mutate DNS, or print private values.
Test contract: run node scripts/test-validate-govern-public-claim-update-preflight.mjs.
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const defaultWitnessPath = "ops/mullu-govern-public-claim-update-preflight.md";
const allowedArgs = new Set(["--json"]);

const expectedBlockedClaims = [
  "mullu-govern.blocked.dashboard-operator-readiness",
  "mullu-govern.blocked.production-runtime-witness-closure",
  "mullu-govern.blocked.public-proof-stamp-issuance",
];

const requiredWitnessTerms = [
  "public_claim_update_preflight_state=Ready",
  "solver_outcome=SolvedVerified",
  "proof_state=Pass",
  "product_status_current=limited-preview",
  "public_claim_update_allowed=false",
  "public_claim_update_ref=missing",
  "public_beta_claim_allowed=false",
  "renderable_claim_count=0",
  "govern_blocked_claim_count=3",
  "public_write_route_allowed=false",
  "route_publication_action=none",
  "dns_mutation=none",
  "runtime_mutation=none",
  "secret_rotation_required=false",
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

export function validateGovernPublicClaimUpdatePreflightEvidence(evidence) {
  const findings = [];

  for (const term of requiredWitnessTerms) {
    if (!evidence.witness.includes(term)) findings.push(`required_witness_term_missing:${term}`);
  }

  for (const { label, pattern } of forbiddenEvidencePatterns) {
    for (const [source, content] of Object.entries(evidence.privateValueScanSources)) {
      if (pattern.test(content)) findings.push(`forbidden_private_value_pattern:${source}:${label}`);
    }
  }

  if (!evidence.publicClaimGate.includes("no public claim ships without a status, evidence basis, exposure decision, and rollback path")) {
    findings.push("public_claim_gate_invariant_missing");
  }
  if (evidence.manifest?.id !== "mullu-govern") {
    findings.push(`manifest_id_invalid:${evidence.manifest?.id || "missing"}`);
  }
  if (evidence.manifest?.status !== "limited-preview") {
    findings.push(`manifest_status_must_remain_limited_preview:${evidence.manifest?.status || "missing"}`);
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
    findings.push(`proof_product_id_invalid:${evidence.proof?.productId || "missing"}`);
  }
  if (evidence.proof?.proofState !== "AwaitingEvidence") {
    findings.push(`proof_state_must_remain_awaiting_evidence:${evidence.proof?.proofState || "missing"}`);
  }
  if (!Array.isArray(evidence.proof?.claimsAllowed) || evidence.proof.claimsAllowed.length !== 0) {
    findings.push("proof_claims_allowed_must_remain_empty");
  }
  const proofClaimIds = (evidence.proof?.claimBindings || []).map((claim) => claim.claimId);
  if (!sameSet(proofClaimIds, expectedBlockedClaims)) {
    findings.push(`proof_claim_bindings_invalid:${proofClaimIds.join(",") || "missing"}`);
  }
  for (const claim of evidence.proof?.claimBindings || []) {
    if (claim.state !== "blocked") findings.push(`proof_claim_state_must_remain_blocked:${claim.claimId || "missing"}`);
    if (claim.renderDecision !== "block") findings.push(`proof_claim_render_decision_must_remain_block:${claim.claimId || "missing"}`);
    if (claim.proofState !== "AwaitingEvidence") findings.push(`proof_claim_proof_state_must_remain_awaiting:${claim.claimId || "missing"}`);
  }

  const productRecord = governGeneratedProduct(evidence.productsRegistry);
  if (!productRecord) findings.push("generated_product_record_missing:mullu-govern");
  if (productRecord?.status !== "limited-preview") {
    findings.push(`generated_product_status_must_remain_limited_preview:${productRecord?.status || "missing"}`);
  }
  if (productRecord?.publicExposureAllowed !== false) {
    findings.push(`generated_product_public_exposure_must_remain_false:${productRecord?.publicExposureAllowed}`);
  }
  if (productRecord?.releaseGateState !== "blocked") {
    findings.push(`generated_product_release_gate_must_remain_blocked:${productRecord?.releaseGateState || "missing"}`);
  }

  const renderableClaims = evidence.claimRegistry?.renderableClaims || [];
  if (!Array.isArray(renderableClaims) || renderableClaims.length !== 0) {
    findings.push(`generated_renderable_claim_count_must_remain_zero:${Array.isArray(renderableClaims) ? renderableClaims.length : "missing"}`);
  }
  const generatedClaims = governGeneratedClaims(evidence.claimRegistry);
  const generatedClaimIds = generatedClaims.map((claim) => claim.claimId);
  if (!sameSet(generatedClaimIds, expectedBlockedClaims)) {
    findings.push(`generated_govern_claims_invalid:${generatedClaimIds.join(",") || "missing"}`);
  }
  for (const claim of generatedClaims) {
    if (claim.publicRenderAllowed !== false) findings.push(`generated_claim_public_render_must_remain_false:${claim.claimId}`);
    if (claim.renderDecision !== "block") findings.push(`generated_claim_render_decision_must_remain_block:${claim.claimId}`);
    if (claim.runtimeWitnessClosed !== false) findings.push(`generated_claim_runtime_witness_must_remain_open:${claim.claimId}`);
  }

  if (!evidence.approvalPacket.includes("public_write_route_allowed=false")) {
    findings.push("approval_packet_write_route_not_blocked");
  }
  if (lineValue(evidence.approvalPacket, "public_claim_update_ref") !== "missing") {
    findings.push(`approval_packet_public_claim_update_ref_must_remain_missing:${lineValue(evidence.approvalPacket, "public_claim_update_ref") || "missing"}`);
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
    witness,
  };
}

export function validateGovernPublicClaimUpdatePreflight(relativePath = defaultWitnessPath) {
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
      findings: [`unsupported_args:${invalidArgs.join(",")}`],
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
