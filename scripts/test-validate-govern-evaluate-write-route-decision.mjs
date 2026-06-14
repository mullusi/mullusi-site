/*
Purpose: test the Mullu Govern evaluate write-route decision validator.
Governance scope: public write-route denial, privacy/retention inactive boundaries, runtime witness alignment, unsupported args, and no-secret pattern rejection.
Dependencies: Node.js standard library and scripts/validate-govern-evaluate-write-route-decision.mjs.
Invariants: tests use public-safe repository evidence or synthetic fixtures only; they never probe endpoints, provider dashboards, DNS APIs, private recovery files, or mailboxes.
*/

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatGovernEvaluateWriteRouteDecisionReport,
  validateGovernEvaluateWriteRouteDecision,
  validateGovernEvaluateWriteRouteDecisionEvidence,
} from "./validate-govern-evaluate-write-route-decision.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptsDir, "..");
const validatorScript = path.join(scriptsDir, "validate-govern-evaluate-write-route-decision.mjs");

function runValidator(args = []) {
  return spawnSync(process.execPath, [validatorScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function validDecisionRecord(overrides = {}) {
  const values = {
    decision_state: "KeepBlocked",
    public_write_route_allowed: "false",
    product_status: "limited-preview",
    runtime_witness_closure_allowed: "false",
    route_publication_action: "none",
    dns_mutation: "none",
    secret_rotation_required: "false",
    rollback_triggered: "false",
    ...overrides,
  };

  return [
    "# Mullu Govern Evaluate Write Route Decision",
    "product_id=mullu-govern",
    "route=POST /v1/govern/evaluate",
    `decision_state=${values.decision_state}`,
    "solver_outcome=AwaitingEvidence",
    "proof_state=Unknown",
    `public_write_route_allowed=${values.public_write_route_allowed}`,
    `product_status=${values.product_status}`,
    "api_gateway_exposure_state=SolvedVerified",
    `runtime_witness_closure_allowed=${values.runtime_witness_closure_allowed}`,
    "approval_packet=ops/mullu-govern-public-beta-approval-packet.md",
    "Public route guard | route remains closed before approval | `POST /v1/govern/evaluate` returns 404 | pass",
    "Runtime witness | `SolvedVerified` for product runtime | `AwaitingEvidence` | block",
    "Operator approval | explicit public write-route approval ref | missing | block",
    "approval_ref=none",
    `route_publication_action=${values.route_publication_action}`,
    `dns_mutation=${values.dns_mutation}`,
    `secret_rotation_required=${values.secret_rotation_required}`,
    `rollback_triggered=${values.rollback_triggered}`,
    "rollback_action=remove /v1/govern/evaluate from the public gateway allowlist",
    "preserve_routes=/v1/health,/v1/version",
    "preserve_dns=api.mullusi.com",
    "STATUS:",
  ].join("\n");
}

function validRetentionPolicy(overrides = {}) {
  return {
    retention: [
      { dataClass: "policy_records", state: "not-active", maximumDays: 0, ...overrides },
    ],
  };
}

function validRuntimeRegistry(overrides = {}) {
  return {
    witnesses: [
      {
        productId: "mullu-govern",
        proofState: "AwaitingEvidence",
        publicExposure: { allowed: false },
        ...overrides,
      },
    ],
  };
}

function validEvidence(overrides = {}) {
  return {
    approvalPacket: "packet_state=AwaitingEvidence\napproval_state=NotApproved\npublic_write_route_allowed=false\n",
    decisionRecord: validDecisionRecord(),
    manifest: {
      api: { exposure: "planned" },
      status: "limited-preview",
    },
    privacyPolicy: { collectionState: "not-active" },
    privateValueScanSources: {
      approvalPacket: "packet_state=AwaitingEvidence\napproval_state=NotApproved\npublic_write_route_allowed=false\n",
      decisionRecord: validDecisionRecord(),
    },
    retentionPolicy: validRetentionPolicy(),
    runtimeRegistry: validRuntimeRegistry(),
    ...overrides,
  };
}

function testCurrentGovernEvaluateWriteRouteDecisionPasses() {
  const result = validateGovernEvaluateWriteRouteDecision();
  const report = formatGovernEvaluateWriteRouteDecisionReport(result);

  assert.equal(result.solverOutcome, "SolvedVerified");
  assert.equal(result.proofState, "Pass");
  assert.equal(result.decisionState, "KeepBlocked");
  assert.equal(result.publicWriteRouteAllowed, false);
  assert.equal(result.productStatus, "limited-preview");
  assert.equal(result.routePublicationAction, "none");
  assert.equal(result.findings.length, 0);
  assert.match(report, /provider_values=not_recorded/);
  assert.match(report, /raw_payloads=not_recorded/);
}

function testSyntheticRouteExposureFailsClosed() {
  const evidence = validEvidence({
    decisionRecord: validDecisionRecord({
      decision_state: "Approve",
      public_write_route_allowed: "true",
      route_publication_action: "publish",
    }),
  });
  const result = validateGovernEvaluateWriteRouteDecisionEvidence(evidence);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.publicWriteRouteAllowed, true);
  assert.match(result.findings.join("\n"), /required_decision_term_missing:decision_state=KeepBlocked/);
  assert.match(result.findings.join("\n"), /decision_state_must_remain_keep_blocked:Approve/);
  assert.match(result.findings.join("\n"), /decision_public_write_route_allowed_must_remain_false:true/);
}

function testSyntheticPrivacyRetentionActivationFailsClosed() {
  const evidence = validEvidence({
    privacyPolicy: { collectionState: "active" },
    retentionPolicy: validRetentionPolicy({ state: "active", maximumDays: 365 }),
  });
  const result = validateGovernEvaluateWriteRouteDecisionEvidence(evidence);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.publicWriteRouteAllowed, false);
  assert.match(result.findings.join("\n"), /privacy_collection_state_must_remain_not_active:active/);
  assert.match(result.findings.join("\n"), /retention_state_must_remain_not_active:policy_records:active/);
  assert.match(result.findings.join("\n"), /retention_maximum_days_must_remain_zero:policy_records:365/);
}

function testSyntheticRuntimeRegistryPromotionFailsClosed() {
  const evidence = validEvidence({
    runtimeRegistry: validRuntimeRegistry({
      proofState: "SolvedVerified",
      publicExposure: { allowed: true },
    }),
  });
  const result = validateGovernEvaluateWriteRouteDecisionEvidence(evidence);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.publicWriteRouteAllowed, false);
  assert.match(result.findings.join("\n"), /runtime_registry_proof_state_must_remain_awaiting:SolvedVerified/);
  assert.match(result.findings.join("\n"), /runtime_registry_public_exposure_must_remain_blocked/);
}

function testSyntheticSecretPatternFailsClosed() {
  const decisionRecord = `${validDecisionRecord()}\nBearer abcdefghijklmnopqrstuvwxyz123456`;
  const evidence = validEvidence({
    decisionRecord,
    privateValueScanSources: {
      approvalPacket: "packet_state=AwaitingEvidence\napproval_state=NotApproved\npublic_write_route_allowed=false\n",
      decisionRecord,
    },
  });
  const result = validateGovernEvaluateWriteRouteDecisionEvidence(evidence);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.publicWriteRouteAllowed, false);
  assert.match(result.findings.join("\n"), /forbidden_private_value_pattern:decisionRecord:bearer_token/);
}

function testCliJsonAndUnsupportedArgs() {
  const jsonResult = runValidator(["--json"]);
  const payload = JSON.parse(jsonResult.stdout);
  assert.equal(jsonResult.status, 0);
  assert.equal(payload.solverOutcome, "SolvedVerified");
  assert.equal(payload.publicWriteRouteAllowed, false);
  assert.equal(payload.decisionState, "KeepBlocked");

  const invalid = runValidator(["--unknown"]);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stdout, /unsupported_args:--unknown/);
  assert.match(invalid.stdout, /govern_evaluate_write_route_decision=GovernanceBlocked/);
}

testCurrentGovernEvaluateWriteRouteDecisionPasses();
testSyntheticRouteExposureFailsClosed();
testSyntheticPrivacyRetentionActivationFailsClosed();
testSyntheticRuntimeRegistryPromotionFailsClosed();
testSyntheticSecretPatternFailsClosed();
testCliJsonAndUnsupportedArgs();

console.log("govern evaluate write-route decision validator tests passed");
