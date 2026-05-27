/*
Purpose: test Mullusi security.txt metadata checker behavior without network access.
Governance scope: disclosure contact fields, expiration bounds, canonical policy routing, CLI fail-closed behavior, and public-safe output.
Dependencies: Node.js standard library and scripts/check-security-txt.mjs.
Invariants: tests use fixed clocks and temporary files, never contact public infrastructure, and never store secrets.
*/

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  evaluateSecurityTxtContent,
  formatResult,
} from "./check-security-txt.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptsDir, "..");
const checkerScript = path.join(scriptsDir, "check-security-txt.mjs");
const fixedNow = new Date("2026-05-27T00:00:00.000Z");

function securityTxt(overrides = {}) {
  return [
    `Contact: ${overrides.supportContact ?? "mailto:support@mullusi.com"}`,
    `Contact: ${overrides.researchContact ?? "mailto:research@mullusi.com"}`,
    `Expires: ${overrides.expires ?? "2027-05-16T00:00:00.000Z"}`,
    `Preferred-Languages: ${overrides.languages ?? "en, am"}`,
    `Canonical: ${overrides.canonical ?? "https://mullusi.com/.well-known/security.txt"}`,
    `Policy: ${overrides.policy ?? "https://mullusi.com/responsible-disclosure/"}`,
  ].join("\n") + "\n";
}

function runChecker(args) {
  return spawnSync(process.execPath, [checkerScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function withTempSecurityTxt(content, testFn) {
  const tempDirectory = fs.mkdtempSync(path.join(repoRoot, ".tmp-mullusi-security-txt-"));
  const tempFile = path.join(tempDirectory, "security.txt");
  try {
    fs.writeFileSync(tempFile, content, "utf8");
    testFn(tempFile);
  } finally {
    fs.rmSync(tempDirectory, { force: true, recursive: true });
  }
}

function testValidSecurityTxtPasses() {
  const result = evaluateSecurityTxtContent(securityTxt(), { now: fixedNow });
  const formatted = formatResult(result);

  assert.equal(result.verdict, "SolvedVerified");
  assert.equal(result.proofState, "Pass");
  assert.equal(result.securityTxtState, "SolvedVerified");
  assert.equal(result.contactCount, 2);
  assert.equal(result.expiresDaysRemaining > 300, true);
  assert.match(formatted, /^finding=none$/m);
  assert.match(formatted, /^raw_secret_values=not_read$/m);
}

function testMissingRequiredFieldsBlock() {
  const content = [
    "Contact: mailto:support@mullusi.com",
    "Expires: 2027-05-16T00:00:00.000Z",
  ].join("\n");
  const result = evaluateSecurityTxtContent(content, { now: fixedNow });

  assert.equal(result.verdict, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.ok(result.findings.includes("contact_missing:mailto:research@mullusi.com"));
  assert.ok(result.findings.includes("policy_missing"));
  assert.ok(result.findings.includes("canonical_missing"));
  assert.ok(result.findings.includes("preferred_language_missing:en"));
}

function testExpirationBoundsBlock() {
  const nearExpiry = evaluateSecurityTxtContent(securityTxt({ expires: "2026-06-10T00:00:00.000Z" }), { now: fixedNow });
  const tooFar = evaluateSecurityTxtContent(securityTxt({ expires: "2028-01-01T00:00:00.000Z" }), { now: fixedNow });
  const invalid = evaluateSecurityTxtContent(securityTxt({ expires: "not-a-date" }), { now: fixedNow });
  const impossibleDate = evaluateSecurityTxtContent(securityTxt({ expires: "2027-02-29T00:00:00.000Z" }), { now: fixedNow });

  assert.equal(nearExpiry.verdict, "GovernanceBlocked");
  assert.ok(nearExpiry.findings.some((finding) => finding.startsWith("expires_too_soon:")));
  assert.equal(tooFar.verdict, "GovernanceBlocked");
  assert.ok(tooFar.findings.some((finding) => finding.startsWith("expires_too_far:")));
  assert.equal(invalid.verdict, "GovernanceBlocked");
  assert.ok(invalid.findings.includes("expires_invalid"));
  assert.equal(impossibleDate.verdict, "GovernanceBlocked");
  assert.ok(impossibleDate.findings.includes("expires_invalid"));
}

function testDuplicateExpiresAndMalformedLinesBlock() {
  const content = [
    "Contact: mailto:support@mullusi.com",
    "Contact: mailto:research@mullusi.com",
    "Expires: 2027-05-16T00:00:00.000Z",
    "Expires: 2027-06-16T00:00:00.000Z",
    "Preferred-Languages: en, am",
    "Canonical: https://mullusi.com/.well-known/security.txt",
    "Policy: https://mullusi.com/responsible-disclosure/",
    "Broken line without separator",
  ].join("\n");
  const result = evaluateSecurityTxtContent(content, { now: fixedNow });

  assert.equal(result.verdict, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.ok(result.findings.includes("expires_duplicate:2"));
  assert.ok(result.findings.includes("field_malformed:line_8"));
}

function testCliUsesExplicitClockAndPath() {
  withTempSecurityTxt(securityTxt(), (tempFile) => {
    const result = runChecker([`--path=${tempFile}`, "--now=2026-05-27"]);

    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
    assert.match(result.stdout, /^security_txt_state=SolvedVerified$/m);
    assert.match(result.stdout, /^observed_at=2026-05-27$/m);
  });
}

function testCliRejectsUnsupportedArguments() {
  const result = runChecker(["--unsafe"]);
  const outsidePath = path.join(os.tmpdir(), "security.txt");
  const outsidePathResult = runChecker([`--path=${outsidePath}`]);
  const wrongFileNameResult = runChecker(["--path=package.json"]);

  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /^verdict=GovernanceBlocked$/m);
  assert.match(result.stdout, /^error=unsupported_arg:--unsafe$/m);
  assert.equal(outsidePathResult.status, 1);
  assert.equal(outsidePathResult.stderr, "");
  assert.match(outsidePathResult.stdout, /^error=path_outside_repo$/m);
  assert.equal(wrongFileNameResult.status, 1);
  assert.equal(wrongFileNameResult.stderr, "");
  assert.match(wrongFileNameResult.stdout, /^error=path_not_security_txt$/m);
}

testValidSecurityTxtPasses();
testMissingRequiredFieldsBlock();
testExpirationBoundsBlock();
testDuplicateExpiresAndMalformedLinesBlock();
testCliUsesExplicitClockAndPath();
testCliRejectsUnsupportedArguments();

console.log("security.txt tests passed");
