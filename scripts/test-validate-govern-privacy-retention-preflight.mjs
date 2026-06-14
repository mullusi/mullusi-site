/*
Purpose: test the Mullu Govern privacy and retention preflight validator.
Governance scope: inactive privacy state, inactive retention state, approval ref fail-closed boundary, unsupported args, and no-secret pattern rejection.
Dependencies: Node.js standard library and scripts/validate-govern-privacy-retention-preflight.mjs.
Invariants: tests use public-safe repository evidence or synthetic fixtures only; they never inspect provider dashboards or raw user data.
*/

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatGovernPrivacyRetentionPreflightReport,
  validateGovernPrivacyRetentionPreflight,
  validateGovernPrivacyRetentionPreflightEvidence,
} from "./validate-govern-privacy-retention-preflight.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptsDir, "..");
const validatorScript = path.join(scriptsDir, "validate-govern-privacy-retention-preflight.mjs");

const dataClasses = [
  "policy_records",
  "evaluations",
  "traces",
  "proof_stamps",
  "audit_events",
];

function runValidator(args = []) {
  return spawnSync(process.execPath, [validatorScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function validEvidence(overrides = {}) {
  const witness = [
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
  ].join("\n");
  return {
    approvalPacket: "public_write_route_allowed=false\nprivacy_activation_ref=missing\nretention_activation_ref=missing\n",
    manifest: { data: { classes: [...dataClasses] } },
    policy: {
      productId: "mullu-govern",
      dataClasses: [...dataClasses],
      retentionPolicy: "privacy/govern.retention.json",
      collectionState: "not-active",
    },
    privateValueScanSources: {
      approvalPacket: "public_write_route_allowed=false\nprivacy_activation_ref=missing\nretention_activation_ref=missing\n",
      policy: JSON.stringify({ collectionState: "not-active" }),
      retention: JSON.stringify({ retention: dataClasses }),
      witness,
    },
    retention: {
      productId: "mullu-govern",
      retention: dataClasses.map((dataClass) => ({
        dataClass,
        state: "not-active",
        maximumDays: 0,
      })),
    },
    witness,
    ...overrides,
  };
}

function testCurrentPrivacyRetentionPreflightPasses() {
  const result = validateGovernPrivacyRetentionPreflight();
  const report = formatGovernPrivacyRetentionPreflightReport(result);

  assert.equal(result.solverOutcome, "SolvedVerified");
  assert.equal(result.proofState, "Pass");
  assert.equal(result.privacyRetentionPreflightState, "Ready");
  assert.equal(result.publicWriteRouteAllowed, false);
  assert.equal(result.collectionState, "not-active");
  assert.equal(result.retentionInactiveRowCount, 5);
  assert.equal(result.findings.length, 0);
  assert.match(report, /raw_user_data=not_recorded/);
}

function testSyntheticActivatedPrivacyFailsClosed() {
  const evidence = validEvidence({
    policy: {
      productId: "mullu-govern",
      dataClasses: [...dataClasses],
      retentionPolicy: "privacy/govern.retention.json",
      collectionState: "limited-preview",
    },
  });
  const result = validateGovernPrivacyRetentionPreflightEvidence(evidence);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.privacyRetentionPreflightState, "Blocked");
  assert.match(result.findings.join("\n"), /policy_collection_state_must_remain_not_active:limited-preview/);
}

function testSyntheticActivatedRetentionFailsClosed() {
  const evidence = validEvidence({
    retention: {
      productId: "mullu-govern",
      retention: dataClasses.map((dataClass, index) => ({
        dataClass,
        state: index === 0 ? "limited-preview" : "not-active",
        maximumDays: index === 0 ? 90 : 0,
      })),
    },
  });
  const result = validateGovernPrivacyRetentionPreflightEvidence(evidence);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.publicWriteRouteAllowed, false);
  assert.match(result.findings.join("\n"), /retention_state_must_remain_not_active:policy_records/);
  assert.match(result.findings.join("\n"), /retention_maximum_days_must_remain_zero:policy_records:90/);
}

function testSyntheticApprovalRefsFailClosed() {
  const evidence = validEvidence({
    approvalPacket: [
      "public_write_route_allowed=false",
      "privacy_activation_ref=ops/active-privacy.md",
      "retention_activation_ref=ops/active-retention.md",
    ].join("\n"),
  });
  const result = validateGovernPrivacyRetentionPreflightEvidence(evidence);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.match(result.findings.join("\n"), /approval_packet_privacy_activation_ref_must_remain_missing/);
  assert.match(result.findings.join("\n"), /approval_packet_retention_activation_ref_must_remain_missing/);
}

function testSyntheticSecretPatternFailsClosed() {
  const evidence = validEvidence({
    privateValueScanSources: {
      approvalPacket: "public_write_route_allowed=false\nprivacy_activation_ref=missing\nretention_activation_ref=missing\n",
      policy: "Bearer abcdefghijklmnopqrstuvwxyz123456",
      retention: "{}",
      witness: "privacy_retention_preflight_state=Ready",
    },
  });
  const result = validateGovernPrivacyRetentionPreflightEvidence(evidence);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.match(result.findings.join("\n"), /forbidden_private_value_pattern:policy:bearer_token/);
}

function testCliJsonAndUnsupportedArgs() {
  const jsonResult = runValidator(["--json"]);
  const payload = JSON.parse(jsonResult.stdout);
  assert.equal(jsonResult.status, 0);
  assert.equal(payload.solverOutcome, "SolvedVerified");
  assert.equal(payload.proofState, "Pass");

  const invalid = runValidator(["--unknown"]);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stdout, /unsupported_args:--unknown/);
  assert.match(invalid.stdout, /govern_privacy_retention_preflight=GovernanceBlocked/);
}

testCurrentPrivacyRetentionPreflightPasses();
testSyntheticActivatedPrivacyFailsClosed();
testSyntheticActivatedRetentionFailsClosed();
testSyntheticApprovalRefsFailClosed();
testSyntheticSecretPatternFailsClosed();
testCliJsonAndUnsupportedArgs();

console.log("govern privacy-retention preflight validator tests passed");
