/*
Purpose: validate public-safe dashboard operator readiness preflight evidence for Mullu Govern.
Governance scope: reserved dashboard route, blocked dashboard readiness claim, approval-packet fail-closed refs, public write-route blocking, and no-secret evidence.
Dependencies: Node.js standard library, ops/mullu-govern-dashboard-operator-readiness-preflight.md, product manifest, and public-beta approval packet.
Invariants: read-only; does not inspect provider dashboards, publish dashboard access, mutate auth, mutate DNS, publish routes, or print private values.
Test contract: run node scripts/test-validate-govern-dashboard-operator-readiness-preflight.mjs.
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { scanForbiddenEvidencePatterns } from "./govern-live-evidence-ref-contract.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const repoRootPrefix = `${repoRoot}${path.sep}`;
const defaultWitnessPath = "ops/mullu-govern-dashboard-operator-readiness-preflight.md";
const allowedArgs = new Set(["--json"]);
const dashboardRoute = "https://dashboard.mullusi.com/govern";

const requiredWitnessTerms = [
  { id: "dashboard_operator_readiness_preflight_state", text: "dashboard_operator_readiness_preflight_state=Ready" },
  { id: "solver_outcome", text: "solver_outcome=SolvedVerified" },
  { id: "proof_state", text: "proof_state=Pass" },
  { id: "dashboard_route", text: `dashboard_route=${dashboardRoute}` },
  { id: "dashboard_route_reserved", text: "dashboard_route_reserved=true" },
  { id: "dashboard_live_claim_allowed", text: "dashboard_live_claim_allowed=false" },
  { id: "dashboard_operator_readiness_ref", text: "dashboard_operator_readiness_ref=missing" },
  { id: "public_write_route_allowed", text: "public_write_route_allowed=false" },
  { id: "route_publication_action", text: "route_publication_action=none" },
  { id: "dns_mutation", text: "dns_mutation=none" },
  { id: "runtime_mutation", text: "runtime_mutation=none" },
  { id: "dashboard_auth_mutation", text: "dashboard_auth_mutation=none" },
  { id: "secret_rotation_required", text: "secret_rotation_required=false" },
  { id: "provider_dashboard_values_recorded", text: "provider_dashboard_values_recorded=false" },
  { id: "status_block", text: "STATUS:" },
];

const publicDashboardAllowedScalars = new Set([
  "missing",
  "false",
  "true",
  "planned",
  "mullu-govern",
  "SolvedVerified",
  "GovernanceBlocked",
  "Pass",
  "Fail",
  dashboardRoute,
]);

function blockedResult(finding) {
  return {
    dashboardOperatorReadinessPreflightState: "Blocked",
    dashboardRoute: "Unknown",
    findingCount: 1,
    findings: [finding],
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
  const result = readUtf8Result(relativePath, "dashboard_operator_readiness_evidence");
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

export function publicDashboardReadinessScalarLabel(value) {
  if (value === undefined || value === null || value === "" || value === "Unknown") return "missing";
  if (typeof value === "boolean") return `boolean:${value ? "true" : "false"}`;
  if (typeof value === "string" && publicDashboardAllowedScalars.has(value)) return value;
  if (typeof value === "string") return "redacted_value";
  if (typeof value === "number") return "number";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  return typeof value;
}

export function validateGovernDashboardOperatorReadinessPreflightEvidence(evidence) {
  const findings = [];

  for (const term of requiredWitnessTerms) {
    if (!evidence.witness.includes(term.text)) findings.push(`required_witness_term_missing:${term.id}`);
  }

  for (const [source, content] of Object.entries(evidence.privateValueScanSources)) {
    findings.push(...scanForbiddenEvidencePatterns(source, content));
  }

  if (evidence.manifest?.id !== "mullu-govern") {
    findings.push(`manifest_id_invalid:${publicDashboardReadinessScalarLabel(evidence.manifest?.id)}`);
  }
  if (evidence.manifest?.surfaces?.dashboardRoute !== dashboardRoute) {
    findings.push(`manifest_dashboard_route_invalid:${publicDashboardReadinessScalarLabel(evidence.manifest?.surfaces?.dashboardRoute)}`);
  }
  if (!Array.isArray(evidence.manifest?.proof?.claimsBlockedUntilVerified)
    || !evidence.manifest.proof.claimsBlockedUntilVerified.includes("dashboard operator readiness")) {
    findings.push("manifest_dashboard_operator_readiness_claim_not_blocked");
  }
  if (evidence.manifest?.api?.exposure !== "planned") {
    findings.push(`manifest_api_exposure_must_remain_planned:${publicDashboardReadinessScalarLabel(evidence.manifest?.api?.exposure)}`);
  }

  if (!evidence.approvalPacket.includes("public_write_route_allowed=false")) {
    findings.push("approval_packet_write_route_not_blocked");
  }
  if (lineValue(evidence.approvalPacket, "dashboard_operator_readiness_ref") !== "missing") {
    findings.push(`approval_packet_dashboard_operator_readiness_ref_must_remain_missing:${publicDashboardReadinessScalarLabel(lineValue(evidence.approvalPacket, "dashboard_operator_readiness_ref"))}`);
  }

  return {
    dashboardOperatorReadinessPreflightState: findings.length === 0 ? "Ready" : "Blocked",
    dashboardRoute: publicDashboardReadinessScalarLabel(evidence.manifest?.surfaces?.dashboardRoute),
    findingCount: findings.length,
    findings,
    proofState: findings.length === 0 ? "Pass" : "Fail",
    publicWriteRouteAllowed: evidence.approvalPacket.includes("public_write_route_allowed=true"),
    solverOutcome: findings.length === 0 ? "SolvedVerified" : "GovernanceBlocked",
  };
}

export function collectGovernDashboardOperatorReadinessPreflightEvidence(relativePath = defaultWitnessPath) {
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

export function validateGovernDashboardOperatorReadinessPreflight(relativePath = defaultWitnessPath) {
  const witnessRead = readUtf8Result(relativePath, "dashboard_operator_readiness_preflight");
  if (witnessRead.finding) {
    return blockedResult(witnessRead.finding);
  }

  return validateGovernDashboardOperatorReadinessPreflightEvidence(
    collectGovernDashboardOperatorReadinessPreflightEvidence(relativePath),
  );
}

export function formatGovernDashboardOperatorReadinessPreflightReport(result) {
  return [
    `govern_dashboard_operator_readiness_preflight=${result.solverOutcome}`,
    `proof_state=${result.proofState}`,
    `dashboard_operator_readiness_preflight_state=${result.dashboardOperatorReadinessPreflightState}`,
    `dashboard_route=${result.dashboardRoute}`,
    "dashboard_live_claim_allowed=false",
    `public_write_route_allowed=${result.publicWriteRouteAllowed ? "true" : "false"}`,
    `finding_count=${result.findingCount}`,
    ...result.findings.map((finding) => `finding=${finding}`),
    "secret_values=not_recorded",
    "host_addresses=not_recorded",
    "database_urls=not_recorded",
    "provider_dashboard_values=not_recorded",
  ].join("\n");
}

function main() {
  const args = process.argv.slice(2);
  const invalidArgs = unsupportedArgs(args);
  if (invalidArgs.length > 0) {
    const result = {
      dashboardOperatorReadinessPreflightState: "Blocked",
      dashboardRoute: "Unknown",
      findingCount: invalidArgs.length,
      findings: [`unsupported_args_count:${invalidArgs.length}`],
      proofState: "Fail",
      publicWriteRouteAllowed: false,
      solverOutcome: "GovernanceBlocked",
    };
    if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
    else console.log(formatGovernDashboardOperatorReadinessPreflightReport(result));
    process.exit(1);
    return;
  }

  const result = validateGovernDashboardOperatorReadinessPreflight();
  if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
  else console.log(formatGovernDashboardOperatorReadinessPreflightReport(result));
  if (result.findings.length > 0) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
