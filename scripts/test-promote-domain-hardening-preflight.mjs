/*
Purpose: test safe promotion behavior for the Mullusi domain-hardening preflight.
Governance scope: confirmation flags, dry-run default, derived mutation permissions, rollback on validation failure, and unsupported flag rejection.
Dependencies: Node.js standard library and scripts/promote-domain-hardening-preflight.mjs.
Invariants: tests do not promote the real preflight permanently and never provide DNS values, DKIM keys, credentials, or report payloads.
*/

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptsDir, "..");
const promoteScript = path.join(scriptsDir, "promote-domain-hardening-preflight.mjs");
const checkScript = path.join(scriptsDir, "check-domain-hardening-preflight.mjs");
const preflightPath = path.join(repoRoot, "ops", "domain-security-preflight.md");

const allConfirmationFlags = [
  "--active-cloudflare-ca-set",
  "--cloudflare-ca-source",
  "--dns-write-authority",
  "--sender-inventory",
  "--google-dkim-selector",
  "--dmarc-report-mailbox",
  "--mta-sts-host",
  "--tls-rpt-mailbox",
];

function runPromote(args = []) {
  return spawnSync(process.execPath, [promoteScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function runCheck(args = []) {
  return spawnSync(process.execPath, [checkScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function withPreflightRestore(testFn) {
  const before = fs.readFileSync(preflightPath, "utf8");
  try {
    testFn(before);
  } finally {
    fs.writeFileSync(preflightPath, before, "utf8");
  }
}

function testDryRunWithoutFlagsDoesNotModifyPreflight() {
  withPreflightRestore((before) => {
    const result = runPromote(["--date=2026-05-24"]);
    const after = fs.readFileSync(preflightPath, "utf8");

    assert.equal(result.status, 0);
    assert.match(result.stdout, /domain_hardening_preflight_promotable=false/);
    assert.match(result.stdout, /write=false/);
    assert.equal(after, before);
  });
}

function testDryRunWithFlagsDoesNotModifyPreflight() {
  withPreflightRestore((before) => {
    const result = runPromote(["--active-cloudflare-ca-set", "--date=2026-05-24"]);
    const after = fs.readFileSync(preflightPath, "utf8");

    assert.equal(result.status, 0);
    assert.match(result.stdout, /domain_hardening_preflight_promotable=true/);
    assert.match(result.stdout, /write=false/);
    assert.equal(after, before);
  });
}

function testPartialWritePromotesOnlyEvidenceAndDerivedPermissions() {
  withPreflightRestore(() => {
    const result = runPromote([
      "--active-cloudflare-ca-set",
      "--cloudflare-ca-source",
      "--dns-write-authority",
      "--date=2026-05-24",
      "--write",
    ]);
    const content = fs.readFileSync(preflightPath, "utf8");
    const check = runCheck(["--expect-blocked"]);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /domain_hardening_preflight_promoted=true/);
    assert.match(content, /^active_cloudflare_ca_set=Pass$/m);
    assert.match(content, /^cloudflare_ca_source=Pass$/m);
    assert.match(content, /^dns_write_authority=Pass$/m);
    assert.match(content, /^manual_caa_allowed=true$/m);
    assert.match(content, /^dkim_publication_allowed=false$/m);
    assert.match(content, /^domain_hardening_preflight=GovernanceBlocked$/m);
    assert.equal(check.status, 0);
  });
}

function testFullWritePromotesReadyState() {
  withPreflightRestore(() => {
    const result = runPromote([...allConfirmationFlags, "--date=2026-05-24", "--write"]);
    const content = fs.readFileSync(preflightPath, "utf8");
    const check = runCheck(["--require-ready"]);

    assert.equal(result.status, 0);
    assert.match(content, /^domain_hardening_preflight=SolvedVerified$/m);
    assert.match(content, /^manual_caa_allowed=true$/m);
    assert.match(content, /^dkim_publication_allowed=true$/m);
    assert.match(content, /^spf_hardfail_allowed=true$/m);
    assert.match(content, /^dmarc_enforcement_allowed=true$/m);
    assert.match(content, /^mta_sts_enforce_allowed=true$/m);
    assert.match(content, /^tls_rpt_publication_allowed=true$/m);
    assert.match(content, /^last_promoted=2026-05-24$/m);
    assert.equal(check.status, 0);
  });
}

function testUnsupportedFlagFails() {
  withPreflightRestore((before) => {
    const result = runPromote(["--unsafe", "--date=2026-05-24"]);
    const after = fs.readFileSync(preflightPath, "utf8");

    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /unsupported_flag:--unsafe/);
    assert.equal(after, before);
  });
}

function testInvalidDateFails() {
  withPreflightRestore((before) => {
    const result = runPromote(["--active-cloudflare-ca-set", "--date=05-24-2026"]);
    const after = fs.readFileSync(preflightPath, "utf8");

    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /invalid_review_date:05-24-2026/);
    assert.equal(after, before);
  });
}

testDryRunWithoutFlagsDoesNotModifyPreflight();
testDryRunWithFlagsDoesNotModifyPreflight();
testPartialWritePromotesOnlyEvidenceAndDerivedPermissions();
testFullWritePromotesReadyState();
testUnsupportedFlagFails();
testInvalidDateFails();

console.log("domain hardening preflight promotion tests passed");
