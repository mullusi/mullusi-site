/*
Purpose: test the Mullusi API exposure gate without DNS mutation or private evidence access.
Governance scope: recovery dependency, DNS publication block, live exposure fail-closed behavior, and CLI modes.
Dependencies: Node.js standard library and scripts/check-api-exposure-gate.mjs.
Invariants: tests use fixed fixtures, never print host addresses, and never touch DNS settings.
*/

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateApiExposureEvidence,
  formatResult,
  parseApiExposureDocuments,
  publicExposureScalarLabel,
} from "./check-api-exposure-gate.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptsDir, "..");
const gateScript = path.join(scriptsDir, "check-api-exposure-gate.mjs");

function recoveryWitness({ state = "AwaitingEvidence", allowed = "false" } = {}) {
  return `recovery_witness_state=${state}
api_provisioning_allowed=${allowed}`;
}

function exposureWitness({
  exposureState = "GovernanceBlocked",
  dnsAllowed = "false",
  runtimeState = "AwaitingEvidence",
  recoveryState = "AwaitingEvidence",
  provisioningAllowed = "false",
} = {}) {
  return `api_exposure_state=${exposureState}
api_dns_publication_allowed=${dnsAllowed}
api_runtime_public_state=${runtimeState}
recovery_witness_state=${recoveryState}
api_provisioning_allowed=${provisioningAllowed}
node scripts/check-api-exposure-gate.mjs
STATUS:`;
}

function apiGateFixture() {
  return `no_gateway_runtime_evidence -> no_api_dns
ops/recovery-completion-witness.md
ReadyForDns
Post-DNS Evidence
Rollback Rule`;
}

function runtimeHostPathFixture() {
  return "If the host is not ready, keep `api.mullusi.com` absent\nexternal managed PostgreSQL\nStrict-Transport-Security: max-age=86400\nRollback";
}

function documentState(overrides = {}) {
  return parseApiExposureDocuments({
    recoveryWitness: recoveryWitness(overrides.recovery ?? {}),
    exposureWitness: exposureWitness(overrides.exposure ?? {}),
    apiGate: apiGateFixture(),
    runtimeHostPath: runtimeHostPathFixture(),
  });
}

function liveState(overrides = {}) {
  return {
    dnsState: "NotRequested",
    dnsRecordCount: 0,
    httpsState: "NotRequested",
    ...overrides,
  };
}

function runGateCli(args) {
  return spawnSync(process.execPath, [gateScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function testBlockedFixtureIsExpectedState() {
  const result = evaluateApiExposureEvidence({
    documentState: documentState(),
    liveState: liveState(),
  });
  const formatted = formatResult(result);

  assert.equal(result.verdict, "GovernanceBlocked");
  assert.equal(result.proofState, "Unknown");
  assert.equal(result.blocked, true);
  assert.match(formatted, /blocker=api_exposure_blocked_until_recovery_ready/);
  assert.match(formatted, /raw_host_values=not_recorded/);
}

function testReadyFixturePassesBeforeDnsPublication() {
  const result = evaluateApiExposureEvidence({
    documentState: documentState({
      recovery: { state: "ReadyForProvisioning", allowed: "true" },
      exposure: {
        exposureState: "ReadyForDns",
        dnsAllowed: "true",
        runtimeState: "ReadyForDns",
        recoveryState: "ReadyForProvisioning",
        provisioningAllowed: "true",
      },
    }),
    liveState: liveState({ dnsState: "Absent", httpsState: "SkippedDnsAbsent" }),
  });

  assert.equal(result.verdict, "ReadyForDns");
  assert.equal(result.proofState, "Pass");
  assert.equal(result.ready, true);
  assert.equal(result.readyForDns, true);
  assert.equal(result.configuredDnsAllowed, true);
  assert.equal(result.softFindings.length, 0);
}

function testReadyFixtureWithDnsPresentAwaitsPostDnsWitness() {
  const result = evaluateApiExposureEvidence({
    documentState: documentState({
      recovery: { state: "ReadyForProvisioning", allowed: "true" },
      exposure: {
        exposureState: "ReadyForDns",
        dnsAllowed: "true",
        runtimeState: "ReadyForDns",
        recoveryState: "ReadyForProvisioning",
        provisioningAllowed: "true",
      },
    }),
    liveState: liveState({ dnsState: "Present", dnsRecordCount: 1, httpsState: "Reachable" }),
  });

  assert.equal(result.verdict, "AwaitingEvidence");
  assert.equal(result.proofState, "Unknown");
  assert.equal(result.ready, false);
  assert.equal(result.apiDnsPublicationAllowed, false);
  assert.ok(result.softFindings.includes("api_dns_present_before_post_dns_witness"));
}

function testSolvedVerifiedFixtureWithDnsProbePasses() {
  const result = evaluateApiExposureEvidence({
    documentState: documentState({
      recovery: { state: "ReadyForProvisioning", allowed: "true" },
      exposure: {
        exposureState: "SolvedVerified",
        dnsAllowed: "true",
        runtimeState: "SolvedVerified",
        recoveryState: "ReadyForProvisioning",
        provisioningAllowed: "true",
      },
    }),
    liveState: liveState({ dnsState: "Present", dnsRecordCount: 1, httpsState: "Reachable" }),
  });

  assert.equal(result.verdict, "SolvedVerified");
  assert.equal(result.proofState, "Pass");
  assert.equal(result.solvedVerified, true);
  assert.equal(result.ready, true);
  assert.equal(result.apiDnsPublicationAllowed, true);
}

function testDnsPresentWhileBlockedFailsClosed() {
  const result = evaluateApiExposureEvidence({
    documentState: documentState(),
    liveState: liveState({ dnsState: "Present", dnsRecordCount: 2, httpsState: "Unavailable" }),
  });

  assert.equal(result.verdict, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.apiDnsPublicationAllowed, false);
  assert.ok(result.hardFindings.includes("api_dns_present_while_blocked"));
  assert.ok(result.blockers.includes("api_exposure_blocked_until_recovery_ready"));
}

function testHttpsReachableWhileBlockedFailsClosed() {
  const result = evaluateApiExposureEvidence({
    documentState: documentState(),
    liveState: liveState({ dnsState: "Present", dnsRecordCount: 1, httpsState: "Reachable" }),
  });

  assert.equal(result.verdict, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.ok(result.hardFindings.includes("api_dns_present_while_blocked"));
  assert.ok(result.hardFindings.includes("api_https_reachable_while_blocked"));
}

function testDocumentMismatchFails() {
  const result = evaluateApiExposureEvidence({
    documentState: documentState({
      exposure: {
        recoveryState: "ReadyForProvisioning",
        provisioningAllowed: "true",
      },
    }),
    liveState: liveState(),
  });

  assert.equal(result.verdict, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.ok(result.hardFindings.includes("api_exposure_recovery_state_mismatch"));
  assert.ok(result.hardFindings.includes("api_exposure_provisioning_flag_mismatch"));
}

function testCurrentCliDefaultsAwaitRuntimeEvidence() {
  const result = runGateCli([]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /^api_exposure_state=AwaitingEvidence$/m);
  assert.match(result.stdout, /^recovery_witness_state=ReadyForProvisioning$/m);
  assert.match(result.stdout, /^api_provisioning_allowed=true$/m);
  assert.match(result.stdout, /^configured_exposure_state=AwaitingEvidence$/m);
  assert.match(result.stdout, /^configured_dns_allowed=false$/m);
  assert.match(result.stdout, /^api_runtime_public_state=AwaitingEvidence$/m);
  assert.match(result.stdout, /^soft_finding=none$/m);
  assert.match(result.stdout, /^blocker=none$/m);
  assert.match(result.stdout, /^raw_host_values=not_recorded$/m);
  assert.match(result.stdout, /^private_recovery_values=not_read$/m);
}

function testCurrentCliRequireReadyFailsClosed() {
  const result = runGateCli(["--require-ready"]);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /^api_exposure_state=AwaitingEvidence$/m);
  assert.match(result.stdout, /^proof_state=Unknown$/m);
  assert.match(result.stdout, /^configured_exposure_state=AwaitingEvidence$/m);
  assert.match(result.stdout, /^blocker=none$/m);
}

function testCurrentCliRejectsUnsupportedArgs() {
  const result = runGateCli(["--unsupported"]);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /^api_exposure_state=GovernanceBlocked$/m);
  assert.match(result.stdout, /^proof_state=Fail$/m);
  assert.match(result.stdout, /^finding=unsupported_args_count:1$/m);
  assert.doesNotMatch(result.stdout, /--unsupported/);
}

function testInvalidExposureStateValuesAreRedacted() {
  const result = evaluateApiExposureEvidence({
    documentState: documentState({
      recovery: {
        state: "private/recovery-state",
        allowed: "postgres://user:password@private.example/db",
      },
      exposure: {
        exposureState: "private/exposure-state",
        dnsAllowed: "private/dns-flag",
        runtimeState: "private/runtime-state",
        recoveryState: "private/recovery-state",
        provisioningAllowed: "postgres://user:password@private.example/db",
      },
    }),
    liveState: liveState(),
  });
  const formatted = formatResult(result);
  const serialized = `${JSON.stringify(result)}\n${formatted}`;

  assert.ok(result.hardFindings.includes("recovery_witness_state_invalid:redacted_value"));
  assert.ok(result.hardFindings.includes("api_provisioning_allowed_invalid:redacted_value"));
  assert.ok(result.hardFindings.includes("api_exposure_state_invalid:redacted_value"));
  assert.ok(result.hardFindings.includes("api_dns_publication_allowed_invalid:redacted_value"));
  assert.ok(result.hardFindings.includes("api_runtime_public_state_invalid:redacted_value"));
  assert.doesNotMatch(serialized, /private\/recovery-state|postgres:\/\/user:password@private\.example\/db|private\/exposure-state|private\/dns-flag|private\/runtime-state/);
}

function testDocumentPrivateValuePatternsFailClosed() {
  const parsed = parseApiExposureDocuments({
    recoveryWitness: `${recoveryWitness({ state: "ReadyForProvisioning", allowed: "true" })}\nAuthorization: Bearer abcdefghijklmnopqrstuvwxyz123456`,
    exposureWitness: exposureWitness({
      exposureState: "ReadyForDns",
      dnsAllowed: "true",
      runtimeState: "ReadyForDns",
      recoveryState: "ReadyForProvisioning",
      provisioningAllowed: "true",
    }),
    apiGate: `${apiGateFixture()}\npostgres://user:password@private.example/db`,
    runtimeHostPath: runtimeHostPathFixture(),
  });
  const result = evaluateApiExposureEvidence({
    documentState: parsed,
    liveState: liveState({ dnsState: "Absent", httpsState: "SkippedDnsAbsent" }),
  });
  const formatted = formatResult(result);
  const serialized = `${JSON.stringify(result)}\n${formatted}`;

  assert.equal(result.verdict, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.ok(result.hardFindings.includes("forbidden_private_value_pattern:recoveryWitness:bearer_token"));
  assert.ok(result.hardFindings.includes("forbidden_private_value_pattern:recoveryWitness:raw_header_authorization"));
  assert.ok(result.hardFindings.includes("forbidden_private_value_pattern:apiProductionReadinessGate:postgres_url"));
  assert.doesNotMatch(serialized, /abcdefghijklmnopqrstuvwxyz123456|postgres:\/\/user:password|private\.example/);
}

function testPublicExposureScalarLabelRedactsUnsafeValues() {
  assert.equal(publicExposureScalarLabel("SolvedVerified"), "SolvedVerified");
  assert.equal(publicExposureScalarLabel("private/exposure state"), "redacted_value");
  assert.equal(publicExposureScalarLabel(""), "missing");
}

testBlockedFixtureIsExpectedState();
testReadyFixturePassesBeforeDnsPublication();
testReadyFixtureWithDnsPresentAwaitsPostDnsWitness();
testSolvedVerifiedFixtureWithDnsProbePasses();
testDnsPresentWhileBlockedFailsClosed();
testHttpsReachableWhileBlockedFailsClosed();
testDocumentMismatchFails();
testCurrentCliDefaultsAwaitRuntimeEvidence();
testCurrentCliRequireReadyFailsClosed();
testCurrentCliRejectsUnsupportedArgs();
testInvalidExposureStateValuesAreRedacted();
testDocumentPrivateValuePatternsFailClosed();
testPublicExposureScalarLabelRedactsUnsafeValues();

console.log("api exposure gate tests passed");
