/*
Purpose: test safe promotion behavior for the Mullusi domain-hardening preflight.
Governance scope: confirmation flags, dry-run default, derived mutation permissions, rollback on validation failure, and unsupported flag rejection.
Dependencies: Node.js standard library and scripts/promote-domain-hardening-preflight.mjs.
Invariants: tests do not promote the real preflight permanently and never provide DNS values, DKIM keys, credentials, or report payloads.
*/

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptsDir, "..");
const promoteScript = path.join(scriptsDir, "promote-domain-hardening-preflight.mjs");
const checkScript = path.join(scriptsDir, "check-domain-hardening-preflight.mjs");
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

function blockedPreflightFixture() {
  return `# Domain Security Preflight

\`\`\`text
domain_hardening_preflight=GovernanceBlocked
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
raw_secret_values=not_recorded
last_promoted=AwaitingEvidence
last_reviewed=2026-05-24
\`\`\`

STATUS:
  Completeness: 100%
  Self-attested invariants: mutation permissions are false, raw secrets not recorded, external evidence requirements explicit
  Open issues: Cloudflare CA set, DNS write authority, sender inventory, Google DKIM selector, report mailboxes, MTA-STS host
  Next action: fill only public-safe Pass/AwaitingEvidence states after admin-console confirmation, then run scripts/check-domain-hardening-preflight.mjs --require-ready
`;
}

function runPromote(preflightPath, args = []) {
  return spawnSync(process.execPath, [promoteScript, `--path=${preflightPath}`, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function runCheck(preflightPath, args = []) {
  return spawnSync(process.execPath, [checkScript, `--path=${preflightPath}`, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function withPreflightFixture(testFn) {
  const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "mullusi-domain-preflight-"));
  const preflightPath = path.join(fixtureDirectory, "domain-security-preflight.md");
  const before = blockedPreflightFixture();
  fs.writeFileSync(preflightPath, before, "utf8");
  try {
    testFn(before, preflightPath);
  } finally {
    fs.rmSync(fixtureDirectory, { force: true, recursive: true });
  }
}

function testDryRunWithoutFlagsDoesNotModifyPreflight() {
  withPreflightFixture((before, preflightPath) => {
    const result = runPromote(preflightPath, ["--date=2026-05-24"]);
    const after = fs.readFileSync(preflightPath, "utf8");

    assert.equal(result.status, 0);
    assert.match(result.stdout, /domain_hardening_preflight_promotable=false/);
    assert.match(result.stdout, /write=false/);
    assert.equal(after, before);
  });
}

function testDryRunWithFlagsDoesNotModifyPreflight() {
  withPreflightFixture((before, preflightPath) => {
    const result = runPromote(preflightPath, ["--active-cloudflare-ca-set", "--date=2026-05-24"]);
    const after = fs.readFileSync(preflightPath, "utf8");

    assert.equal(result.status, 0);
    assert.match(result.stdout, /domain_hardening_preflight_promotable=true/);
    assert.match(result.stdout, /write=false/);
    assert.equal(after, before);
  });
}

function testPartialWritePromotesOnlyEvidenceAndDerivedPermissions() {
  withPreflightFixture((_before, preflightPath) => {
    const result = runPromote(preflightPath, [
      "--active-cloudflare-ca-set",
      "--cloudflare-ca-source",
      "--dns-write-authority",
      "--date=2026-05-24",
      "--write",
    ]);
    const content = fs.readFileSync(preflightPath, "utf8");
    const check = runCheck(preflightPath, ["--expect-blocked"]);

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
  withPreflightFixture((_before, preflightPath) => {
    const result = runPromote(preflightPath, [...allConfirmationFlags, "--date=2026-05-24", "--write"]);
    const content = fs.readFileSync(preflightPath, "utf8");
    const check = runCheck(preflightPath, ["--require-ready"]);

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
  withPreflightFixture((before, preflightPath) => {
    const result = runPromote(preflightPath, ["--unsafe", "--date=2026-05-24"]);
    const after = fs.readFileSync(preflightPath, "utf8");

    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /unsupported_flag:--unsafe/);
    assert.equal(after, before);
  });
}

function testInvalidDateFails() {
  withPreflightFixture((before, preflightPath) => {
    const result = runPromote(preflightPath, ["--active-cloudflare-ca-set", "--date=05-24-2026"]);
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
