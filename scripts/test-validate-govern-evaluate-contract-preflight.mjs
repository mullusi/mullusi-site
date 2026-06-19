/*
Purpose: test the Mullu Govern evaluate contract preflight validator.
Governance scope: bounded request schema, trace requirement, fail-closed execution ref, unsupported args, and no-secret pattern rejection.
Dependencies: Node.js standard library and scripts/validate-govern-evaluate-contract-preflight.mjs.
Invariants: tests use public-safe repository evidence or synthetic fixtures only; they never execute API calls or record raw request/response bodies.
*/

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatGovernEvaluateContractPreflightReport,
  validateGovernEvaluateContractPreflight,
  validateGovernEvaluateContractPreflightEvidence,
} from "./validate-govern-evaluate-contract-preflight.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptsDir, "..");
const validatorScript = path.join(scriptsDir, "validate-govern-evaluate-contract-preflight.mjs");

function runValidator(args = []) {
  return spawnSync(process.execPath, [validatorScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function validContract(overrides = {}) {
  return {
    $id: "https://mullusi.com/contracts/govern/evaluate.schema.json",
    additionalProperties: false,
    required: [
      "schema_version",
      "action",
      "constraints",
      "requested_outputs",
      "trace_required",
      "privacy_acknowledgement",
    ],
    properties: {
      schema_version: { const: "1.0.0" },
      action: {
        additionalProperties: false,
        properties: {
          kind: {
            enum: [
              "policy_evaluation",
              "deployment_decision",
              "runtime_promotion",
              "governance_review",
            ],
          },
          summary: { maxLength: 2000 },
        },
      },
      constraints: { maxItems: 20, items: { maxLength: 500 } },
      evidence_refs: {
        items: {
          pattern: "^(ops|docs|products|privacy|contracts|proof|control-plane):[A-Za-z0-9._:/#-]+$",
        },
      },
      requested_outputs: {
        items: {
          enum: ["decision", "proof_summary", "repair_actions", "audit_trace"],
        },
      },
      trace_required: { const: true },
      privacy_acknowledgement: { const: "no_raw_secret_or_unapproved_user_data" },
    },
    ...overrides,
  };
}

function validEvidence(overrides = {}) {
  const witness = [
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
  ].join("\n");
  return {
    approvalPacket: "public_write_route_allowed=false\napi_contract_test_ref=missing\n",
    contract: validContract(),
    manifest: {
      api: {
        routes: [{
          method: "POST",
          path: "/v1/govern/evaluate",
          contract: "contracts/govern/evaluate.schema.json",
        }],
      },
    },
    privateValueScanSources: {
      approvalPacket: "public_write_route_allowed=false\napi_contract_test_ref=missing\n",
      contract: JSON.stringify(validContract()),
      witness,
    },
    witness,
    ...overrides,
  };
}

function testCurrentContractPreflightPasses() {
  const result = validateGovernEvaluateContractPreflight();
  const report = formatGovernEvaluateContractPreflightReport(result);

  assert.equal(result.solverOutcome, "SolvedVerified");
  assert.equal(result.proofState, "Pass");
  assert.equal(result.contractPreflightState, "Ready");
  assert.equal(result.publicWriteRouteAllowed, false);
  assert.equal(result.findings.length, 0);
  assert.match(report, /raw_request_bodies=not_recorded/);
  assert.match(report, /raw_response_bodies=not_recorded/);
}

function testSyntheticUnboundedContractFailsClosed() {
  const evidence = validEvidence({
    contract: validContract({ additionalProperties: true }),
  });
  const result = validateGovernEvaluateContractPreflightEvidence(evidence);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.contractPreflightState, "Blocked");
  assert.match(result.findings.join("\n"), /contract_root_additional_properties_must_be_false/);
}

function testSyntheticFilledExecutionRefFailsClosed() {
  const evidence = validEvidence({
    approvalPacket: "public_write_route_allowed=false\napi_contract_test_ref=ops/live-contract-test.md\n",
  });
  const result = validateGovernEvaluateContractPreflightEvidence(evidence);
  const report = formatGovernEvaluateContractPreflightReport(result);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.publicWriteRouteAllowed, false);
  assert.match(result.findings.join("\n"), /approval_packet_api_contract_test_ref_must_remain_missing:redacted_value/);
  assert.doesNotMatch(report, /live-contract-test/);
}

function testSyntheticMissingWitnessTermUsesPublicLabel() {
  const evidence = validEvidence({
    witness: validEvidence().witness.replace("raw_request_body_recorded=false", ""),
  });
  evidence.privateValueScanSources.witness = evidence.witness;
  const result = validateGovernEvaluateContractPreflightEvidence(evidence);
  const report = formatGovernEvaluateContractPreflightReport(result);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.match(result.findings.join("\n"), /required_witness_term_missing:raw_request_body_recorded/);
  assert.doesNotMatch(report, /raw_request_body_recorded=false/);
}

function testSyntheticUnsafeContractValuesAreRedacted() {
  const evidence = validEvidence({
    contract: validContract({
      $id: "https://private.example.internal/contracts/evaluate.schema.json",
      properties: {
        ...validContract().properties,
        schema_version: { const: "private-version-2026" },
        privacy_acknowledgement: { const: "private-policy-value" },
        action: {
          ...validContract().properties.action,
          properties: {
            ...validContract().properties.action.properties,
            summary: { maxLength: "private-summary-length" },
          },
        },
        constraints: { maxItems: "private-max-items", items: { maxLength: "private-item-length" } },
      },
    }),
    manifest: {
      api: {
        routes: [{
          method: "POST",
          path: "/v1/govern/evaluate",
          contract: "private/contracts/evaluate.schema.json",
        }],
      },
    },
  });
  const result = validateGovernEvaluateContractPreflightEvidence(evidence);
  const report = formatGovernEvaluateContractPreflightReport(result);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.match(result.findings.join("\n"), /manifest_contract_ref_invalid:redacted_value/);
  assert.match(result.findings.join("\n"), /contract_id_invalid:redacted_value/);
  assert.match(result.findings.join("\n"), /contract_schema_version_const_invalid:redacted_value/);
  assert.match(result.findings.join("\n"), /contract_privacy_acknowledgement_invalid:redacted_value/);
  assert.match(result.findings.join("\n"), /contract_summary_max_length_invalid:redacted_value/);
  assert.match(result.findings.join("\n"), /contract_constraints_max_items_invalid:redacted_value/);
  assert.match(result.findings.join("\n"), /contract_constraints_item_max_length_invalid:redacted_value/);
  assert.doesNotMatch(report, /private\.example\.internal/);
  assert.doesNotMatch(report, /private-version-2026/);
  assert.doesNotMatch(report, /private-policy-value/);
  assert.doesNotMatch(report, /private-summary-length/);
  assert.doesNotMatch(report, /private-max-items/);
  assert.doesNotMatch(report, /private-item-length/);
  assert.doesNotMatch(report, /private\/contracts/);
}

function testSyntheticSecretPatternFailsClosed() {
  const evidence = validEvidence({
    privateValueScanSources: {
      approvalPacket: "public_write_route_allowed=false\napi_contract_test_ref=missing\n",
      contract: "Bearer abcdefghijklmnopqrstuvwxyz123456",
      witness: "contract_preflight_state=Ready",
    },
  });
  const result = validateGovernEvaluateContractPreflightEvidence(evidence);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.match(result.findings.join("\n"), /forbidden_private_value_pattern:contract:bearer_token/);
}

function testCliJsonAndUnsupportedArgs() {
  const jsonResult = runValidator(["--json"]);
  const payload = JSON.parse(jsonResult.stdout);
  assert.equal(jsonResult.status, 0);
  assert.equal(payload.solverOutcome, "SolvedVerified");
  assert.equal(payload.proofState, "Pass");

  const invalid = runValidator(["--unknown"]);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stdout, /unsupported_args_count:1/);
  assert.doesNotMatch(invalid.stdout, /--unknown/);
  assert.match(invalid.stdout, /govern_evaluate_contract_preflight=GovernanceBlocked/);
}

function testPathBoundaryFailsClosedWithoutEcho() {
  const outsideResult = validateGovernEvaluateContractPreflight(path.join("..", "private-contract-preflight.md"));
  const outsideReport = formatGovernEvaluateContractPreflightReport(outsideResult);

  assert.equal(outsideResult.solverOutcome, "GovernanceBlocked");
  assert.equal(outsideResult.proofState, "Fail");
  assert.equal(outsideResult.contractPreflightState, "Blocked");
  assert.equal(outsideResult.publicWriteRouteAllowed, false);
  assert.deepEqual(outsideResult.findings, ["evaluate_contract_preflight_path_outside_repo"]);
  assert.doesNotMatch(outsideReport, /private-contract-preflight/);

  const unreadableResult = validateGovernEvaluateContractPreflight(path.join("ops", "missing-private-contract-preflight.md"));
  const unreadableReport = formatGovernEvaluateContractPreflightReport(unreadableResult);

  assert.equal(unreadableResult.solverOutcome, "GovernanceBlocked");
  assert.equal(unreadableResult.proofState, "Fail");
  assert.equal(unreadableResult.contractPreflightState, "Blocked");
  assert.equal(unreadableResult.publicWriteRouteAllowed, false);
  assert.deepEqual(unreadableResult.findings, ["evaluate_contract_preflight_unreadable"]);
  assert.doesNotMatch(unreadableReport, /missing-private-contract-preflight/);
}

testCurrentContractPreflightPasses();
testSyntheticUnboundedContractFailsClosed();
testSyntheticFilledExecutionRefFailsClosed();
testSyntheticMissingWitnessTermUsesPublicLabel();
testSyntheticUnsafeContractValuesAreRedacted();
testSyntheticSecretPatternFailsClosed();
testCliJsonAndUnsupportedArgs();
testPathBoundaryFailsClosedWithoutEcho();

console.log("govern evaluate contract preflight validator tests passed");
