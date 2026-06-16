/*
Purpose: validate public-safe privacy and retention preflight evidence for Mullu Govern.
Governance scope: inactive privacy state, inactive retention state, data-class alignment, approval-packet fail-closed refs, public write-route blocking, and no-secret evidence.
Dependencies: Node.js standard library, ops/mullu-govern-privacy-retention-preflight.md, product manifest, privacy policy, retention policy, and public-beta approval packet.
Invariants: read-only; does not activate collection, set retention, inspect provider dashboards, mutate DNS, publish routes, or print private values.
Test contract: run node scripts/test-validate-govern-privacy-retention-preflight.mjs.
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { scanForbiddenEvidencePatterns } from "./govern-live-evidence-ref-contract.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const repoRootPrefix = `${repoRoot}${path.sep}`;
const defaultWitnessPath = "ops/mullu-govern-privacy-retention-preflight.md";
const allowedArgs = new Set(["--json"]);

const expectedDataClasses = [
  "policy_records",
  "evaluations",
  "traces",
  "proof_stamps",
  "audit_events",
];

const requiredWitnessTerms = [
  "privacy_retention_preflight_state=Ready",
  "solver_outcome=SolvedVerified",
  "proof_state=Pass",
  "public_write_route_allowed=false",
  "collection_state_current=not-active",
  "retention_state_current=not-active",
  "privacy_activation_allowed=false",
  "retention_activation_allowed=false",
  "route_publication_action=none",
  "dns_mutation=none",
  "runtime_mutation=none",
  "secret_rotation_required=false",
  "raw_user_data_recorded=false",
  "privacy_activation_ref=missing",
  "retention_activation_ref=missing",
  "STATUS:",
];

function blockedResult(finding) {
  return {
    collectionState: "Unknown",
    findingCount: 1,
    findings: [finding],
    privacyRetentionPreflightState: "Blocked",
    proofState: "Fail",
    publicWriteRouteAllowed: false,
    retentionInactiveRowCount: 0,
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
  const result = readUtf8Result(relativePath, "privacy_retention_evidence");
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

function sameOrderedValues(observed, expected) {
  return Array.isArray(observed)
    && observed.length === expected.length
    && observed.every((value, index) => value === expected[index]);
}

export function validateGovernPrivacyRetentionPreflightEvidence(evidence) {
  const findings = [];

  for (const term of requiredWitnessTerms) {
    if (!evidence.witness.includes(term)) findings.push(`required_witness_term_missing:${term}`);
  }

  for (const [source, content] of Object.entries(evidence.privateValueScanSources)) {
    findings.push(...scanForbiddenEvidencePatterns(source, content));
  }

  const manifestClasses = evidence.manifest?.data?.classes;
  const policyClasses = evidence.policy?.dataClasses;
  const retentionRows = Array.isArray(evidence.retention?.retention) ? evidence.retention.retention : [];
  const retentionClasses = retentionRows.map((row) => row.dataClass);

  if (!sameOrderedValues(manifestClasses, expectedDataClasses)) {
    findings.push(`manifest_data_classes_invalid:${Array.isArray(manifestClasses) ? manifestClasses.join(",") : "missing"}`);
  }
  if (!sameOrderedValues(policyClasses, expectedDataClasses)) {
    findings.push(`policy_data_classes_invalid:${Array.isArray(policyClasses) ? policyClasses.join(",") : "missing"}`);
  }
  if (!sameOrderedValues(retentionClasses, expectedDataClasses)) {
    findings.push(`retention_data_classes_invalid:${retentionClasses.length > 0 ? retentionClasses.join(",") : "missing"}`);
  }

  if (evidence.policy?.productId !== "mullu-govern") {
    findings.push(`policy_product_id_invalid:${evidence.policy?.productId || "missing"}`);
  }
  if (evidence.retention?.productId !== "mullu-govern") {
    findings.push(`retention_product_id_invalid:${evidence.retention?.productId || "missing"}`);
  }
  if (evidence.policy?.retentionPolicy !== "privacy/govern.retention.json") {
    findings.push(`policy_retention_ref_invalid:${evidence.policy?.retentionPolicy || "missing"}`);
  }
  if (evidence.policy?.collectionState !== "not-active") {
    findings.push(`policy_collection_state_must_remain_not_active:${evidence.policy?.collectionState || "missing"}`);
  }

  for (const row of retentionRows) {
    if (row.state !== "not-active") {
      findings.push(`retention_state_must_remain_not_active:${row.dataClass || "missing"}`);
    }
    if (row.maximumDays !== 0) {
      findings.push(`retention_maximum_days_must_remain_zero:${row.dataClass || "missing"}:${row.maximumDays}`);
    }
  }

  if (!evidence.approvalPacket.includes("public_write_route_allowed=false")) {
    findings.push("approval_packet_write_route_not_blocked");
  }
  if (lineValue(evidence.approvalPacket, "privacy_activation_ref") !== "missing") {
    findings.push(`approval_packet_privacy_activation_ref_must_remain_missing:${lineValue(evidence.approvalPacket, "privacy_activation_ref") || "missing"}`);
  }
  if (lineValue(evidence.approvalPacket, "retention_activation_ref") !== "missing") {
    findings.push(`approval_packet_retention_activation_ref_must_remain_missing:${lineValue(evidence.approvalPacket, "retention_activation_ref") || "missing"}`);
  }

  return {
    findingCount: findings.length,
    findings,
    proofState: findings.length === 0 ? "Pass" : "Fail",
    publicWriteRouteAllowed: evidence.approvalPacket.includes("public_write_route_allowed=true"),
    solverOutcome: findings.length === 0 ? "SolvedVerified" : "GovernanceBlocked",
    collectionState: evidence.policy?.collectionState || "Unknown",
    privacyRetentionPreflightState: findings.length === 0 ? "Ready" : "Blocked",
    retentionInactiveRowCount: retentionRows.filter((row) => row.state === "not-active" && row.maximumDays === 0).length,
  };
}

export function collectGovernPrivacyRetentionPreflightEvidence(relativePath = defaultWitnessPath) {
  const witness = readUtf8(relativePath);
  return {
    approvalPacket: readUtf8("ops/mullu-govern-public-beta-approval-packet.md"),
    manifest: readJson("products/mullu-govern/product.manifest.json"),
    policy: readJson("privacy/govern.policy.json"),
    retention: readJson("privacy/govern.retention.json"),
    privateValueScanSources: {
      approvalPacket: readUtf8("ops/mullu-govern-public-beta-approval-packet.md"),
      policy: readUtf8("privacy/govern.policy.json"),
      retention: readUtf8("privacy/govern.retention.json"),
      witness,
    },
    witness,
  };
}

export function validateGovernPrivacyRetentionPreflight(relativePath = defaultWitnessPath) {
  const witnessRead = readUtf8Result(relativePath, "privacy_retention_preflight");
  if (witnessRead.finding) {
    return blockedResult(witnessRead.finding);
  }

  return validateGovernPrivacyRetentionPreflightEvidence(collectGovernPrivacyRetentionPreflightEvidence(relativePath));
}

export function formatGovernPrivacyRetentionPreflightReport(result) {
  return [
    `govern_privacy_retention_preflight=${result.solverOutcome}`,
    `proof_state=${result.proofState}`,
    `privacy_retention_preflight_state=${result.privacyRetentionPreflightState}`,
    `public_write_route_allowed=${result.publicWriteRouteAllowed ? "true" : "false"}`,
    `collection_state=${result.collectionState}`,
    `retention_inactive_row_count=${result.retentionInactiveRowCount}`,
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
      collectionState: "Unknown",
      findingCount: invalidArgs.length,
      findings: [`unsupported_args_count:${invalidArgs.length}`],
      privacyRetentionPreflightState: "Blocked",
      proofState: "Fail",
      publicWriteRouteAllowed: false,
      retentionInactiveRowCount: 0,
      solverOutcome: "GovernanceBlocked",
    };
    if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
    else console.log(formatGovernPrivacyRetentionPreflightReport(result));
    process.exit(1);
    return;
  }

  const result = validateGovernPrivacyRetentionPreflight();
  if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
  else console.log(formatGovernPrivacyRetentionPreflightReport(result));
  if (result.findings.length > 0) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
