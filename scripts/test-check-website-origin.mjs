/*
Purpose: verify deterministic website-origin classification for Mullusi deployment evidence.
Governance scope: GitHub Pages fallback detection, Cloudflare origin candidate detection, and unknown-state handling.
Dependencies: Node.js standard library and scripts/check-website-origin.mjs.
Invariants: tests use fixed header fixtures and do not require network access.
*/

import assert from "node:assert/strict";
import { classifyHeaders, classifyResponse, validateTargetUrl } from "./check-website-origin.mjs";

function testGithubPagesOriginClassification() {
  const classification = classifyHeaders({
    server: "cloudflare",
    "cf-ray": "example-IAD",
    "x-github-request-id": "1234",
    "x-fastly-request-id": "abcd",
    via: "1.1 varnish",
  });

  assert.equal(classification.verdict, "GitHubPagesOrigin");
  assert.equal(classification.proofState, "Fail");
  assert.equal(classification.cloudflareEdge, true);
  assert.equal(classification.githubOrigin, true);
  assert.ok(classification.markers.includes("x-github-request-id"));
}

function testCloudflareOriginCandidateClassification() {
  const classification = classifyHeaders({
    server: "cloudflare",
    "cf-ray": "example-IAD",
    "cf-cache-status": "HIT",
  });

  assert.equal(classification.verdict, "CloudflareOriginCandidate");
  assert.equal(classification.proofState, "Pass");
  assert.equal(classification.cloudflareEdge, true);
  assert.equal(classification.githubOrigin, false);
  assert.deepEqual(classification.markers, ["cf-ray", "cf-cache-status"]);
}

function testUnknownOriginClassification() {
  const classification = classifyHeaders({
    server: "example",
    "cache-control": "max-age=600",
  });

  assert.equal(classification.verdict, "UnknownOrigin");
  assert.equal(classification.proofState, "Unknown");
  assert.equal(classification.cloudflareEdge, false);
  assert.equal(classification.githubOrigin, false);
  assert.deepEqual(classification.markers, []);
}

function testCloudflareHeadersWithUnexpectedStatusBlocksPublication() {
  const classification = classifyResponse({
    statusCode: 404,
    headers: {
      server: "cloudflare",
      "cf-ray": "example-IAD",
    },
  });

  assert.equal(classification.verdict, "UnexpectedStatus");
  assert.equal(classification.proofState, "Fail");
  assert.equal(classification.cloudflareEdge, true);
  assert.equal(classification.githubOrigin, false);
  assert.ok(classification.summary.includes("404"));
}

function testTargetUrlValidationAcceptsMullusiHttpsRoute() {
  const validated = validateTargetUrl("https://mullusi.com/proof/");

  assert.equal(validated, "https://mullusi.com/proof/");
}

function testTargetUrlValidationBlocksNonHttpsRoute() {
  assert.throws(
    () => validateTargetUrl("http://mullusi.com/"),
    /target_protocol_invalid/,
  );
}

function testTargetUrlValidationBlocksExternalHost() {
  assert.throws(
    () => validateTargetUrl("https://example.com/"),
    /target_host_invalid/,
  );
}

testGithubPagesOriginClassification();
testCloudflareOriginCandidateClassification();
testUnknownOriginClassification();
testCloudflareHeadersWithUnexpectedStatusBlocksPublication();
testTargetUrlValidationAcceptsMullusiHttpsRoute();
testTargetUrlValidationBlocksNonHttpsRoute();
testTargetUrlValidationBlocksExternalHost();
console.log("website origin classification tests passed");
