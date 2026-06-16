/*
Purpose: verify live security-header checker behavior without network access.
Governance scope: browser-control header requirements, fail-closed target validation, and public-safe output.
Dependencies: Node.js standard library and scripts/check-live-security-headers.mjs.
Invariants: tests use fixed evidence fixtures and never contact public infrastructure.
*/

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateSecurityHeaderEvidence,
  formatResult,
  publicErrorCode,
  validateTargetUrl,
} from "./check-live-security-headers.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptsDir, "..");
const headerScript = path.join(scriptsDir, "check-live-security-headers.mjs");

function passingHeaders(overrides = {}) {
  return {
    "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'none'; upgrade-insecure-requests",
    "strict-transport-security": "max-age=31536000; includeSubDomains; preload",
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-resource-policy": "same-site",
    "x-dns-prefetch-control": "off",
    "x-permitted-cross-domain-policies": "none",
    "permissions-policy": "accelerometer=(), camera=(), geolocation=(), microphone=(), payment=(), usb=()",
    ...overrides,
  };
}

function targetRecord(targetUrl, overrides = {}) {
  return {
    targetUrl,
    statusCode: 200,
    headers: passingHeaders(),
    ...overrides,
  };
}

function passingRecords() {
  return [
    targetRecord("https://mullusi.com/"),
    targetRecord("https://mullusi.com/security/"),
    targetRecord("https://mullusi.com/.well-known/security.txt"),
  ];
}

function runHeaderCli(args) {
  return spawnSync(process.execPath, [headerScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function testAllSecurityHeadersPass() {
  const result = evaluateSecurityHeaderEvidence(passingRecords());
  const formatted = formatResult(result);

  assert.equal(result.verdict, "SolvedVerified");
  assert.equal(result.proofState, "Pass");
  assert.equal(result.targetCount, 3);
  assert.match(formatted, /security_header_state=SolvedVerified/);
  assert.match(formatted, /raw_response_headers=not_recorded/);
}

function testMissingContentSecurityPolicyBlocks() {
  const records = passingRecords();
  records[0] = targetRecord("https://mullusi.com/", { headers: passingHeaders({ "content-security-policy": "" }) });
  const result = evaluateSecurityHeaderEvidence(records);

  assert.equal(result.verdict, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.securityHeaderState, "GovernanceBlocked");
  assert.ok(result.findings.includes("header_missing:content-security-policy:https://mullusi.com/"));
}

function testHeaderValueMismatchBlocks() {
  const records = passingRecords();
  records[1] = targetRecord("https://mullusi.com/security/", { headers: passingHeaders({ "x-frame-options": "SAMEORIGIN" }) });
  const result = evaluateSecurityHeaderEvidence(records);

  assert.equal(result.verdict, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.targetResults[1].passed, false);
  assert.ok(result.findings.includes("header_value_mismatch:x-frame-options:https://mullusi.com/security/"));
}

function testRequiredHeaderTermMissingBlocks() {
  const records = passingRecords();
  records[2] = targetRecord("https://mullusi.com/.well-known/security.txt", {
    headers: passingHeaders({ "strict-transport-security": "max-age=31536000" }),
  });
  const result = evaluateSecurityHeaderEvidence(records);

  assert.equal(result.verdict, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.targetResults[2].passed, false);
  assert.ok(result.findings.includes("header_term_missing:strict-transport-security:includeSubDomains,preload:https://mullusi.com/.well-known/security.txt"));
}

function testStatusAndRequestErrorsBlock() {
  const records = [
    targetRecord("https://mullusi.com/", { statusCode: 503 }),
    { targetUrl: "https://mullusi.com/security/", error: "request_timeout:https://mullusi.com/security/" },
  ];
  const result = evaluateSecurityHeaderEvidence(records);

  assert.equal(result.verdict, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.ok(result.findings.includes("target_status_invalid:https://mullusi.com/:503"));
  assert.ok(result.findings.includes("target_request_error:https://mullusi.com/security/:live_security_headers_request_timeout"));
}

function testTargetValidationBlocksUnsafeTargets() {
  const validTarget = validateTargetUrl("https://mullusi.com/status/");

  assert.equal(validTarget, "https://mullusi.com/status/");
  assert.throws(() => validateTargetUrl("http://mullusi.com/"), /target_protocol_invalid/);
  assert.throws(() => validateTargetUrl("https://example.com/"), /target_host_invalid/);
  assert.throws(() => validateTargetUrl("not a url"), /target_url_invalid/);
}

function testCliRejectsUnsupportedArgumentWithoutNetwork() {
  const result = runHeaderCli(["--unexpected"]);

  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /verdict=GovernanceBlocked/);
  assert.match(result.stdout, /proof_state=Fail/);
  assert.match(result.stdout, /error=unsupported_args_count:1/);
  assert.doesNotMatch(result.stdout, /--unexpected/);
}

function testPublicErrorCodeRedactsRawExceptionValues() {
  const timeout = publicErrorCode(new Error("request_timeout:https://mullusi.com/security/"));
  const host = publicErrorCode(new Error("target_host_invalid:private.example.internal"));
  const url = publicErrorCode(new Error("target_url_invalid:not a private url"));
  const network = publicErrorCode(new Error("getaddrinfo ENOTFOUND private.example.internal"));
  const fallback = publicErrorCode(new Error("unexpected private path D:\\secret\\headers.txt"));

  assert.equal(timeout, "live_security_headers_request_timeout");
  assert.equal(host, "live_security_headers_target_host_invalid");
  assert.equal(url, "live_security_headers_target_url_invalid");
  assert.equal(network, "live_security_headers_network_unavailable");
  assert.equal(fallback, "live_security_headers_unavailable");
  assert.doesNotMatch([timeout, host, url, network, fallback].join("\n"), /mullusi\.com|private|secret|headers\.txt/);
}

testAllSecurityHeadersPass();
testMissingContentSecurityPolicyBlocks();
testHeaderValueMismatchBlocks();
testRequiredHeaderTermMissingBlocks();
testStatusAndRequestErrorsBlock();
testTargetValidationBlocksUnsafeTargets();
testCliRejectsUnsupportedArgumentWithoutNetwork();
testPublicErrorCodeRedactsRawExceptionValues();

console.log("live security header tests passed");
