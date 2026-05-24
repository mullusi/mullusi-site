/*
Purpose: verify domain-hardening preflight behavior without DNS or admin access.
Governance scope: mutation permission dependencies, fail-closed readiness, boundary scanning, and CLI modes.
Dependencies: Node.js standard library and scripts/check-domain-hardening-preflight.mjs.
Invariants: tests use fixed fixtures and never mutate DNS.
*/

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateDomainHardeningPreflight,
  formatResult,
} from "./check-domain-hardening-preflight.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptsDir, "..");
const preflightScript = path.join(scriptsDir, "check-domain-hardening-preflight.mjs");

function blockedFixture() {
  return `domain_hardening_preflight=GovernanceBlocked
active_cloudflare_ca_set=AwaitingEvidence
cloudflare_ca_source=AwaitingEvidence
dns_write_authority=AwaitingEvidence
sender_inventory=AwaitingEvidence
google_workspace_dkim_selector=AwaitingEvidence
dmarc_report_mailbox=AwaitingEvidence
mta_sts_https_policy_host=AwaitingEvidence
tls_rpt_report_mailbox=AwaitingEvidence
manual_caa_allowed=false
dkim_publication_allowed=false
spf_hardfail_allowed=false
dmarc_enforcement_allowed=false
mta_sts_enforce_allowed=false
tls_rpt_publication_allowed=false
raw_secret_values=not_recorded`;
}

function readyFixture() {
  return `domain_hardening_preflight=SolvedVerified
active_cloudflare_ca_set=Pass
cloudflare_ca_source=Pass
dns_write_authority=Pass
sender_inventory=Pass
google_workspace_dkim_selector=Pass
dmarc_report_mailbox=Pass
mta_sts_https_policy_host=Pass
tls_rpt_report_mailbox=Pass
manual_caa_allowed=true
dkim_publication_allowed=true
spf_hardfail_allowed=true
dmarc_enforcement_allowed=true
mta_sts_enforce_allowed=true
tls_rpt_publication_allowed=true
raw_secret_values=not_recorded`;
}

function runPreflightCli(args) {
  return spawnSync(process.execPath, [preflightScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function testBlockedFixtureIsExpectedState() {
  const result = evaluateDomainHardeningPreflight(blockedFixture());
  const formatted = formatResult(result);

  assert.equal(result.verdict, "GovernanceBlocked");
  assert.equal(result.proofState, "Unknown");
  assert.equal(result.preflightState, "GovernanceBlocked");
  assert.equal(result.ready, false);
  assert.match(formatted, /finding=preflight_waiting_for_external_evidence/);
}

function testReadyFixturePasses() {
  const result = evaluateDomainHardeningPreflight(readyFixture());

  assert.equal(result.verdict, "SolvedVerified");
  assert.equal(result.proofState, "Pass");
  assert.equal(result.preflightState, "SolvedVerified");
  assert.equal(result.ready, true);
  assert.deepEqual(result.findings, []);
}

function testPermissionWithoutEvidenceBlocks() {
  const fixture = blockedFixture().replace("manual_caa_allowed=false", "manual_caa_allowed=true");
  const result = evaluateDomainHardeningPreflight(fixture);

  assert.equal(result.verdict, "GovernanceBlocked");
  assert.equal(result.proofState, "Unknown");
  assert.ok(result.findings.includes("permission_without_evidence:manual_caa_allowed"));
}

function testSolvedWithoutEvidenceFails() {
  const fixture = blockedFixture().replace("domain_hardening_preflight=GovernanceBlocked", "domain_hardening_preflight=SolvedVerified");
  const result = evaluateDomainHardeningPreflight(fixture);

  assert.equal(result.verdict, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.ok(result.findings.includes("preflight_solved_without_required_evidence"));
}

function testBoundaryViolationFails() {
  const fixture = `${blockedFixture()}\nprivate_key=-----BEGIN PRIVATE KEY-----`;
  const result = evaluateDomainHardeningPreflight(fixture);

  assert.equal(result.verdict, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.ok(result.findings.includes("preflight_boundary_invalid:private_key"));
}

function testCliRequireReadyFailsForCurrentPreflight() {
  const result = runPreflightCli(["--require-ready"]);

  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /domain_hardening_preflight=GovernanceBlocked/);
}

function testCliExpectBlockedPassesForCurrentPreflight() {
  const result = runPreflightCli(["--expect-blocked"]);

  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /domain_hardening_preflight=GovernanceBlocked/);
}

function testCliRejectsUnsupportedArgument() {
  const result = runPreflightCli(["--unexpected"]);

  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /error=unsupported_args:--unexpected/);
}

testBlockedFixtureIsExpectedState();
testReadyFixturePasses();
testPermissionWithoutEvidenceBlocks();
testSolvedWithoutEvidenceFails();
testBoundaryViolationFails();
testCliRequireReadyFailsForCurrentPreflight();
testCliExpectBlockedPassesForCurrentPreflight();
testCliRejectsUnsupportedArgument();

console.log("domain hardening preflight tests passed");
