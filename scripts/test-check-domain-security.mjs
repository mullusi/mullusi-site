/*
Purpose: verify domain-security checker behavior without network access.
Governance scope: DNSSEC, CAA, MX, SPF, DMARC, DKIM, MTA-STS, and TLS-RPT evaluation.
Dependencies: Node.js standard library and scripts/check-domain-security.mjs.
Invariants: tests use fixed DNS fixtures and never contact public resolvers.
*/

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateDomainSecurityEvidence,
  formatResult,
} from "./check-domain-security.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptsDir, "..");
const domainSecurityScript = path.join(scriptsDir, "check-domain-security.mjs");

function passingEvidence(overrides = {}) {
  return {
    dsRecords: ["2371 ECDSAP256SHA256 2 exampledigest"],
    caaRecords: ["0 issue \"pki.goog; cansignhttpexchanges=yes\""],
    mxRecords: ["1 smtp.google.com."],
    rootTxtRecords: ["v=spf1 include:_spf.google.com -all"],
    dmarcRecords: ["v=DMARC1; p=reject; rua=mailto:dmarc@mullusi.com; pct=100; adkim=s; aspf=s"],
    googleDkimRecords: ["v=DKIM1; k=rsa; p=example"],
    mtaStsRecords: ["v=STSv1; id=20260524"],
    tlsRptRecords: ["v=TLSRPTv1; rua=mailto:tlsrpt@mullusi.com"],
    ...overrides,
  };
}

function runDomainSecurityCli(args) {
  return spawnSync(process.execPath, [domainSecurityScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function testAllDomainSecurityControlsPass() {
  const result = evaluateDomainSecurityEvidence(passingEvidence());
  const formatted = formatResult(result);

  assert.equal(result.verdict, "SolvedVerified");
  assert.equal(result.proofState, "Pass");
  assert.equal(result.domainSecurityState, "SolvedVerified");
  assert.equal(result.dnssecState, "Pass");
  assert.equal(result.caaState, "Pass");
  assert.equal(result.dmarcEnforcement, "Pass");
  assert.match(formatted, /finding=none/);
  assert.match(formatted, /raw_dns_values=not_recorded/);
}

function testCurrentHardeningGapsRemainAwaitingEvidence() {
  const result = evaluateDomainSecurityEvidence(passingEvidence({
    caaRecords: [],
    rootTxtRecords: ["v=spf1 include:_spf.google.com ~all"],
    dmarcRecords: ["v=DMARC1; p=none; rua=mailto:tamirat@mullusi.com"],
    googleDkimRecords: [],
    mtaStsRecords: [],
    tlsRptRecords: [],
  }));

  assert.equal(result.verdict, "AwaitingEvidence");
  assert.equal(result.proofState, "Unknown");
  assert.equal(result.caaState, "AwaitingEvidence");
  assert.equal(result.spfEnforcement, "AwaitingEvidence");
  assert.equal(result.dmarcPolicy, "none");
  assert.ok(result.hardeningGaps.includes("caa_record_missing"));
  assert.ok(result.hardeningGaps.includes("spf_not_hardfail"));
  assert.ok(result.hardeningGaps.includes("dmarc_policy_monitoring_only"));
  assert.ok(result.hardeningGaps.includes("known_google_dkim_selector_missing"));
  assert.ok(result.hardeningGaps.includes("mta_sts_policy_missing"));
  assert.ok(result.hardeningGaps.includes("tls_rpt_record_missing"));
}

function testMissingBaseControlsBlock() {
  const result = evaluateDomainSecurityEvidence(passingEvidence({
    dsRecords: [],
    mxRecords: [],
    rootTxtRecords: [],
    dmarcRecords: [],
  }));

  assert.equal(result.verdict, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.ok(result.blockers.includes("dnssec_ds_missing"));
  assert.ok(result.blockers.includes("google_workspace_mx_missing"));
  assert.ok(result.blockers.includes("spf_record_missing"));
  assert.ok(result.blockers.includes("dmarc_record_missing"));
}

function testInvalidDmarcPolicyBlocks() {
  const result = evaluateDomainSecurityEvidence(passingEvidence({
    dmarcRecords: ["v=DMARC1; p=monitor; rua=mailto:dmarc@mullusi.com"],
  }));

  assert.equal(result.verdict, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.ok(result.blockers.includes("dmarc_policy_invalid"));
}

function testCliRejectsUnsupportedArgumentWithoutNetwork() {
  const result = runDomainSecurityCli(["--unexpected"]);

  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /verdict=GovernanceBlocked/);
  assert.match(result.stdout, /proof_state=Fail/);
  assert.match(result.stdout, /error=unsupported_args:--unexpected/);
}

testAllDomainSecurityControlsPass();
testCurrentHardeningGapsRemainAwaitingEvidence();
testMissingBaseControlsBlock();
testInvalidDmarcPolicyBlocks();
testCliRejectsUnsupportedArgumentWithoutNetwork();

console.log("domain security tests passed");
