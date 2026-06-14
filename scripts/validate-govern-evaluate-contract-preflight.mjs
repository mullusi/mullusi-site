/*
Purpose: validate public-safe API contract preflight evidence for Mullu Govern evaluate route.
Governance scope: request schema specificity, trace requirement, privacy acknowledgement, fail-closed execution ref, public write-route blocking, and no-secret evidence.
Dependencies: Node.js standard library, ops/mullu-govern-evaluate-contract-preflight.md, contracts/govern/evaluate.schema.json, product manifest, and public-beta approval packet.
Invariants: read-only; does not publish routes, execute API calls, activate collection, mutate DNS, or print private values.
Test contract: run node scripts/test-validate-govern-evaluate-contract-preflight.mjs.
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { scanForbiddenEvidencePatterns } from "./govern-live-evidence-ref-contract.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const defaultWitnessPath = "ops/mullu-govern-evaluate-contract-preflight.md";
const contractPath = "contracts/govern/evaluate.schema.json";
const allowedArgs = new Set(["--json"]);

const expectedActionKinds = [
  "policy_evaluation",
  "deployment_decision",
  "runtime_promotion",
  "governance_review",
];

const expectedOutputs = [
  "decision",
  "proof_summary",
  "repair_actions",
  "audit_trace",
];

const requiredWitnessTerms = [
  "contract_preflight_state=Ready",
  "solver_outcome=SolvedVerified",
  "proof_state=Pass",
  "public_write_route_allowed=false",
  "contract_execution_allowed=false",
  "api_contract_test_ref=missing",
  "route_publication_action=none",
  "dns_mutation=none",
  "runtime_mutation=none",
  "secret_rotation_required=false",
  "raw_request_body_recorded=false",
  "raw_response_body_recorded=false",
  "accepted_case_execution=AwaitingEvidence",
  "rejected_case_execution=AwaitingEvidence",
  "malformed_case_execution=AwaitingEvidence",
  "unauthorized_case_execution=AwaitingEvidence",
  "rate_limited_case_execution=AwaitingEvidence",
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

function sameValues(observed, expected) {
  return Array.isArray(observed)
    && observed.length === expected.length
    && expected.every((value) => observed.includes(value));
}

export function validateGovernEvaluateContractPreflightEvidence(evidence) {
  const findings = [];

  for (const term of requiredWitnessTerms) {
    if (!evidence.witness.includes(term)) findings.push(`required_witness_term_missing:${term}`);
  }

  for (const [source, content] of Object.entries(evidence.privateValueScanSources)) {
    findings.push(...scanForbiddenEvidencePatterns(source, content));
  }

  const route = evidence.manifest?.api?.routes?.find((candidate) => (
    candidate.method === "POST" && candidate.path === "/v1/govern/evaluate"
  ));
  if (!route) findings.push("manifest_evaluate_route_missing");
  if (route?.contract !== contractPath) {
    findings.push(`manifest_contract_ref_invalid:${route?.contract || "missing"}`);
  }

  if (evidence.contract?.$id !== "https://mullusi.com/contracts/govern/evaluate.schema.json") {
    findings.push(`contract_id_invalid:${evidence.contract?.$id || "missing"}`);
  }
  if (evidence.contract?.additionalProperties !== false) {
    findings.push("contract_root_additional_properties_must_be_false");
  }

  const required = evidence.contract?.required || [];
  for (const key of ["schema_version", "action", "constraints", "requested_outputs", "trace_required", "privacy_acknowledgement"]) {
    if (!required.includes(key)) findings.push(`contract_required_key_missing:${key}`);
  }

  const properties = evidence.contract?.properties || {};
  if (properties.schema_version?.const !== "1.0.0") {
    findings.push(`contract_schema_version_const_invalid:${properties.schema_version?.const || "missing"}`);
  }
  if (properties.trace_required?.const !== true) {
    findings.push("contract_trace_required_const_invalid");
  }
  if (properties.privacy_acknowledgement?.const !== "no_raw_secret_or_unapproved_user_data") {
    findings.push(`contract_privacy_acknowledgement_invalid:${properties.privacy_acknowledgement?.const || "missing"}`);
  }

  const action = properties.action || {};
  if (action.additionalProperties !== false) {
    findings.push("contract_action_additional_properties_must_be_false");
  }
  if (!sameValues(action.properties?.kind?.enum, expectedActionKinds)) {
    findings.push("contract_action_kind_enum_invalid");
  }
  if (action.properties?.summary?.maxLength !== 2000) {
    findings.push(`contract_summary_max_length_invalid:${action.properties?.summary?.maxLength || "missing"}`);
  }
  if (properties.constraints?.maxItems !== 20) {
    findings.push(`contract_constraints_max_items_invalid:${properties.constraints?.maxItems || "missing"}`);
  }
  if (properties.constraints?.items?.maxLength !== 500) {
    findings.push(`contract_constraints_item_max_length_invalid:${properties.constraints?.items?.maxLength || "missing"}`);
  }
  if (!sameValues(properties.requested_outputs?.items?.enum, expectedOutputs)) {
    findings.push("contract_requested_outputs_enum_invalid");
  }
  if (properties.evidence_refs?.items?.pattern !== "^(ops|docs|products|privacy|contracts|proof|control-plane):[A-Za-z0-9._:/#-]+$") {
    findings.push("contract_evidence_ref_pattern_invalid");
  }

  if (!evidence.approvalPacket.includes("public_write_route_allowed=false")) {
    findings.push("approval_packet_write_route_not_blocked");
  }
  if (lineValue(evidence.approvalPacket, "api_contract_test_ref") !== "missing") {
    findings.push(`approval_packet_api_contract_test_ref_must_remain_missing:${lineValue(evidence.approvalPacket, "api_contract_test_ref") || "missing"}`);
  }

  return {
    contractPreflightState: findings.length === 0 ? "Ready" : "Blocked",
    findingCount: findings.length,
    findings,
    proofState: findings.length === 0 ? "Pass" : "Fail",
    publicWriteRouteAllowed: evidence.approvalPacket.includes("public_write_route_allowed=true"),
    solverOutcome: findings.length === 0 ? "SolvedVerified" : "GovernanceBlocked",
  };
}

export function collectGovernEvaluateContractPreflightEvidence(relativePath = defaultWitnessPath) {
  const witness = readUtf8(relativePath);
  const contract = readUtf8(contractPath);
  return {
    approvalPacket: readUtf8("ops/mullu-govern-public-beta-approval-packet.md"),
    contract: JSON.parse(contract),
    manifest: readJson("products/mullu-govern/product.manifest.json"),
    privateValueScanSources: {
      approvalPacket: readUtf8("ops/mullu-govern-public-beta-approval-packet.md"),
      contract,
      witness,
    },
    witness,
  };
}

export function validateGovernEvaluateContractPreflight(relativePath = defaultWitnessPath) {
  return validateGovernEvaluateContractPreflightEvidence(collectGovernEvaluateContractPreflightEvidence(relativePath));
}

export function formatGovernEvaluateContractPreflightReport(result) {
  return [
    `govern_evaluate_contract_preflight=${result.solverOutcome}`,
    `proof_state=${result.proofState}`,
    `contract_preflight_state=${result.contractPreflightState}`,
    `public_write_route_allowed=${result.publicWriteRouteAllowed ? "true" : "false"}`,
    `finding_count=${result.findingCount}`,
    ...result.findings.map((finding) => `finding=${finding}`),
    "secret_values=not_recorded",
    "host_addresses=not_recorded",
    "database_urls=not_recorded",
    "raw_request_bodies=not_recorded",
    "raw_response_bodies=not_recorded",
  ].join("\n");
}

function main() {
  const args = process.argv.slice(2);
  const invalidArgs = unsupportedArgs(args);
  if (invalidArgs.length > 0) {
    const result = {
      contractPreflightState: "Blocked",
      findingCount: invalidArgs.length,
      findings: [`unsupported_args:${invalidArgs.join(",")}`],
      proofState: "Fail",
      publicWriteRouteAllowed: false,
      solverOutcome: "GovernanceBlocked",
    };
    if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
    else console.log(formatGovernEvaluateContractPreflightReport(result));
    process.exit(1);
    return;
  }

  const result = validateGovernEvaluateContractPreflight();
  if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
  else console.log(formatGovernEvaluateContractPreflightReport(result));
  if (result.findings.length > 0) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
