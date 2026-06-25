/*
Purpose: validate the public-safe Mullusi release readiness summary.
Governance scope: static website status, API gateway boundary, product runtime release denial, domain hardening state, and no-secret evidence.
Dependencies: Node.js standard library, ops/release-readiness-summary.md, scripts/report-ops-next-action.mjs, and the governed live-evidence ref scanner.
Invariants: read-only; does not contact live endpoints, provider dashboards, DNS APIs, mailboxes, private recovery files, host addresses, database URLs, or secret values.
Test contract: run node scripts/test-validate-release-readiness-summary.mjs.
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { scanForbiddenEvidencePatterns } from "./govern-live-evidence-ref-contract.mjs";
import {
  collectOpsNextEvidence,
  decideOpsNextAction,
  formatOpsNextReport,
} from "./report-ops-next-action.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const defaultSummaryPath = "ops/release-readiness-summary.md";
const allowedArgs = new Set(["--json"]);

const requiredSummaryTerms = [
  { id: "title", text: "Release Readiness Summary" },
  { id: "website_static_deployment_integrity", text: "website_static_deployment_integrity=SolvedVerified" },
  { id: "live_status_manifest", text: "live_status_manifest=Pass" },
  { id: "local_status_manifest_match", text: "local_status_manifest_match=Pass" },
  { id: "api_exposure_state", text: "api_exposure_state=SolvedVerified" },
  { id: "api_dns_publication_allowed", text: "api_dns_publication_allowed=true" },
  { id: "api_production_readiness_state", text: "api_production_readiness_state=ReadyForDns" },
  { id: "product_runtime_release_witness", text: "product_runtime_release_witness=AwaitingEvidence" },
  { id: "product_runtime_claims_allowed", text: "product_runtime_claims_allowed=false" },
  { id: "public_product_release_allowed", text: "public_product_release_allowed=false" },
  { id: "recovery_witness_state", text: "recovery_witness_state=ReadyForProvisioning" },
  { id: "api_provisioning_allowed", text: "api_provisioning_allowed=true" },
  { id: "domain_security_state", text: "domain_security_state=SolvedVerified" },
  { id: "domain_hardening_preflight", text: "domain_hardening_preflight=SolvedVerified" },
  { id: "static_website_public", text: "static_website_public=true" },
  { id: "static_website_integrity", text: "static_website_integrity=SolvedVerified" },
  { id: "product_runtime_release", text: "product_runtime_release=false" },
  { id: "api_gateway_public", text: "api_gateway_public=true" },
  { id: "runtime_claims_allowed", text: "runtime_claims_allowed=false" },
  { id: "domain_hardening_mutation_allowed", text: "domain_hardening_mutation_allowed=true" },
  { id: "raw_secret_values", text: "raw_secret_values=not_recorded" },
  { id: "private_recovery_values", text: "private_recovery_values=not_read" },
  { id: "status_block", text: "STATUS:" },
];

const reporterMirrorKeys = [
  "api_exposure_state",
  "api_dns_publication_allowed",
  "api_production_readiness_state",
  "product_runtime_claims_allowed",
  "public_product_release_allowed",
  "recovery_witness_state",
  "api_provisioning_allowed",
  "domain_hardening_preflight",
];

const publicReleaseReadinessAllowedScalars = new Set([
  "AwaitingEvidence",
  "Blocked",
  "GovernanceBlocked",
  "Pass",
  "Ready",
  "ReadyForDns",
  "ReadyForProvisioning",
  "SolvedVerified",
  "false",
  "missing",
  "not_read",
  "not_recorded",
  "true",
]);

function publicReleaseReadinessScalarLabel(value) {
  if (value === undefined || value === null || value === "") return "missing";
  const scalar = String(value);
  if (publicReleaseReadinessAllowedScalars.has(scalar)) return scalar;
  if (/^\d+$/.test(scalar)) return "number";
  return "redacted_value";
}

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

export function validateReleaseReadinessSummaryEvidence(evidence) {
  const findings = [];

  for (const term of requiredSummaryTerms) {
    if (!evidence.summary.includes(term.text)) findings.push(`required_summary_term_missing:${term.id}`);
  }

  findings.push(...scanForbiddenEvidencePatterns("releaseReadinessSummary", evidence.summary));

  for (const key of reporterMirrorKeys) {
    const summaryValue = lineValue(evidence.summary, key);
    const reporterValue = lineValue(evidence.opsNextReport, key);
    if (summaryValue !== reporterValue) {
      findings.push(`ops_report_mirror_mismatch:${key}:${publicReleaseReadinessScalarLabel(summaryValue)}:${publicReleaseReadinessScalarLabel(reporterValue)}`);
    }
  }

  if (lineValue(evidence.summary, "product_runtime_release") !== "false") {
    findings.push("product_runtime_release_must_remain_false");
  }
  if (lineValue(evidence.summary, "runtime_claims_allowed") !== "false") {
    findings.push("runtime_claims_allowed_must_remain_false");
  }

  return {
    findingCount: findings.length,
    findings,
    proofState: findings.length === 0 ? "Pass" : "Fail",
    publicProductReleaseAllowed: lineValue(evidence.summary, "public_product_release_allowed") === "true",
    productRuntimeClaimsAllowed: lineValue(evidence.summary, "product_runtime_claims_allowed") === "true",
    releaseReadinessState: findings.length === 0 ? "Ready" : "Blocked",
    solverOutcome: findings.length === 0 ? "SolvedVerified" : "GovernanceBlocked",
  };
}

export function collectReleaseReadinessSummaryEvidence(relativePath = defaultSummaryPath) {
  const opsEvidence = collectOpsNextEvidence();
  const opsDecision = decideOpsNextAction(opsEvidence);
  return {
    opsNextReport: formatOpsNextReport(opsEvidence, opsDecision),
    summary: readUtf8(relativePath),
  };
}

export function validateReleaseReadinessSummary(relativePath = defaultSummaryPath) {
  return validateReleaseReadinessSummaryEvidence(collectReleaseReadinessSummaryEvidence(relativePath));
}

export function formatReleaseReadinessSummaryReport(result) {
  return [
    `release_readiness_summary=${result.solverOutcome}`,
    `proof_state=${result.proofState}`,
    `release_readiness_state=${result.releaseReadinessState}`,
    `product_runtime_claims_allowed=${result.productRuntimeClaimsAllowed ? "true" : "false"}`,
    `public_product_release_allowed=${result.publicProductReleaseAllowed ? "true" : "false"}`,
    `finding_count=${result.findingCount}`,
    ...result.findings.map((finding) => `finding=${finding}`),
    "secret_values=not_recorded",
    "host_addresses=not_recorded",
    "database_urls=not_recorded",
    "private_recovery_values=not_read",
  ].join("\n");
}

function main() {
  const args = process.argv.slice(2);
  const invalidArgs = unsupportedArgs(args);
  if (invalidArgs.length > 0) {
    const result = {
      findingCount: invalidArgs.length,
      findings: [`unsupported_args_count:${invalidArgs.length}`],
      proofState: "Fail",
      publicProductReleaseAllowed: false,
      productRuntimeClaimsAllowed: false,
      releaseReadinessState: "Blocked",
      solverOutcome: "GovernanceBlocked",
    };
    if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
    else console.log(formatReleaseReadinessSummaryReport(result));
    process.exit(1);
    return;
  }

  const result = validateReleaseReadinessSummary();
  if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
  else console.log(formatReleaseReadinessSummaryReport(result));
  if (result.findings.length > 0) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
