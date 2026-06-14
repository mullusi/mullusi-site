/*
Purpose: validate public-safe product-status promotion preflight evidence for Mullu Govern.
Governance scope: limited-preview preservation, release-gate ordering, approval-packet fail-closed refs, public write-route blocking, and no-secret evidence.
Dependencies: Node.js standard library, ops/mullu-govern-product-status-preflight.md, product manifest, and public-beta approval packet.
Invariants: read-only; does not promote product status, publish routes, activate privacy or retention, mutate DNS, or print private values.
Test contract: run node scripts/test-validate-govern-product-status-preflight.mjs.
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { scanForbiddenEvidencePatterns } from "./govern-live-evidence-ref-contract.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
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
  "product_status_preflight_state=Ready",
  "solver_outcome=SolvedVerified",
  "proof_state=Pass",
  "product_status_current=limited-preview",
  "product_status_target=public-beta",
  "product_status_promotion_allowed=false",
  "product_status_promotion_ref=missing",
  "public_write_route_allowed=false",
  "route_publication_action=none",
  "dns_mutation=none",
  "runtime_mutation=none",
  "secret_rotation_required=false",
  "public_beta_claim_allowed=false",
  "STATUS:",
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

function sameOrderedValues(observed, expected) {
  return Array.isArray(observed)
    && observed.length === expected.length
    && observed.every((value, index) => value === expected[index]);
}

function includesAll(observed, expected) {
  return Array.isArray(observed) && expected.every((value) => observed.includes(value));
}

export function validateGovernProductStatusPreflightEvidence(evidence) {
  const findings = [];

  for (const term of requiredWitnessTerms) {
    if (!evidence.witness.includes(term)) findings.push(`required_witness_term_missing:${term}`);
  }

  for (const [source, content] of Object.entries(evidence.privateValueScanSources)) {
    findings.push(...scanForbiddenEvidencePatterns(source, content));
  }

  if (evidence.manifest?.id !== "mullu-govern") {
    findings.push(`manifest_id_invalid:${evidence.manifest?.id || "missing"}`);
  }
  if (evidence.manifest?.status !== "limited-preview") {
    findings.push(`manifest_status_must_remain_limited_preview:${evidence.manifest?.status || "missing"}`);
  }
  if (!sameOrderedValues(evidence.manifest?.releaseGate?.promotionPath, expectedPromotionPath)) {
    findings.push(`manifest_promotion_path_invalid:${Array.isArray(evidence.manifest?.releaseGate?.promotionPath) ? evidence.manifest.releaseGate.promotionPath.join(">") : "missing"}`);
  }
  if (!includesAll(evidence.manifest?.releaseGate?.required, requiredReleaseGates)) {
    findings.push("manifest_required_release_gates_incomplete");
  }

  const route = evidence.manifest?.api?.routes?.find((candidate) => (
    candidate.method === "POST" && candidate.path === "/v1/govern/evaluate"
  ));
  if (!route) findings.push("manifest_evaluate_route_missing");
  if (evidence.manifest?.api?.exposure !== "planned") {
    findings.push(`manifest_api_exposure_must_remain_planned:${evidence.manifest?.api?.exposure || "missing"}`);
  }

  if (!evidence.approvalPacket.includes("public_write_route_allowed=false")) {
    findings.push("approval_packet_write_route_not_blocked");
  }
  if (lineValue(evidence.approvalPacket, "product_status_current") !== "limited-preview") {
    findings.push(`approval_packet_product_status_current_invalid:${lineValue(evidence.approvalPacket, "product_status_current") || "missing"}`);
  }
  if (lineValue(evidence.approvalPacket, "product_status_target") !== "public-beta") {
    findings.push(`approval_packet_product_status_target_invalid:${lineValue(evidence.approvalPacket, "product_status_target") || "missing"}`);
  }
  if (lineValue(evidence.approvalPacket, "product_status_promotion_ref") !== "missing") {
    findings.push(`approval_packet_product_status_promotion_ref_must_remain_missing:${lineValue(evidence.approvalPacket, "product_status_promotion_ref") || "missing"}`);
  }

  return {
    findingCount: findings.length,
    findings,
    manifestStatus: evidence.manifest?.status || "Unknown",
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
    witness,
  };
}

export function validateGovernProductStatusPreflight(relativePath = defaultWitnessPath) {
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
      findings: [`unsupported_args:${invalidArgs.join(",")}`],
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
