/*
Purpose: verify deterministic website-origin classification for Mullusi deployment evidence.
Governance scope: GitHub Pages fallback detection, Cloudflare origin candidate detection, and unknown-state handling.
Dependencies: Node.js standard library and scripts/check-website-origin.mjs.
Invariants: tests use fixed header fixtures and do not require network access.
*/

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyHeaders, classifyResponse, validateTargetUrl } from "./check-website-origin.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptsDir, "..");
const originScript = path.join(scriptsDir, "check-website-origin.mjs");

function runOriginCli(args) {
  return spawnSync(process.execPath, [originScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

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

function testWwwHostWithoutApexRedirectStaysPending() {
  const classification = classifyResponse(
    {
      finalUrl: "https://www.mullusi.com/",
      statusCode: 200,
      headers: {
        server: "cloudflare",
        "cf-ray": "example-IAD",
      },
    },
    "https://www.mullusi.com/",
  );

  assert.equal(classification.verdict, "CanonicalRedirectPending");
  assert.equal(classification.proofState, "Unknown");
  assert.equal(classification.cloudflareEdge, true);
  assert.equal(classification.githubOrigin, false);
}

function testWwwHostWithApexRedirectPasses() {
  const classification = classifyResponse(
    {
      finalUrl: "https://mullusi.com/",
      statusCode: 200,
      redirectHistory: [
        {
          from: "https://www.mullusi.com/",
          to: "https://mullusi.com/",
          statusCode: 301,
        },
      ],
      headers: {
        server: "cloudflare",
        "cf-ray": "example-IAD",
      },
    },
    "https://www.mullusi.com/",
  );

  assert.equal(classification.verdict, "CloudflareOriginCandidate");
  assert.equal(classification.proofState, "Pass");
  assert.equal(classification.cloudflareEdge, true);
  assert.equal(classification.githubOrigin, false);
}

function testWwwHostWithPathQueryPreservationPasses() {
  const classification = classifyResponse(
    {
      finalUrl: "https://mullusi.com/proof/?gate=www-canonical",
      statusCode: 200,
      redirectHistory: [
        {
          from: "https://www.mullusi.com/proof/?gate=www-canonical",
          to: "https://mullusi.com/proof/?gate=www-canonical",
          statusCode: 301,
        },
      ],
      headers: {
        server: "cloudflare",
        "cf-ray": "example-IAD",
      },
    },
    "https://www.mullusi.com/proof/?gate=www-canonical",
  );

  assert.equal(classification.verdict, "CloudflareOriginCandidate");
  assert.equal(classification.proofState, "Pass");
  assert.equal(classification.cloudflareEdge, true);
  assert.equal(classification.githubOrigin, false);
}

function testWwwHostWithPathQueryMismatchFails() {
  const classification = classifyResponse(
    {
      finalUrl: "https://mullusi.com/proof/",
      statusCode: 200,
      redirectHistory: [
        {
          from: "https://www.mullusi.com/proof/?gate=www-canonical",
          to: "https://mullusi.com/proof/",
          statusCode: 301,
        },
      ],
      headers: {
        server: "cloudflare",
        "cf-ray": "example-IAD",
      },
    },
    "https://www.mullusi.com/proof/?gate=www-canonical",
  );

  assert.equal(classification.verdict, "CanonicalRedirectShapeMismatch");
  assert.equal(classification.proofState, "Fail");
  assert.equal(classification.cloudflareEdge, true);
  assert.equal(classification.githubOrigin, false);
}

function testWwwHostWithApexFinalUrlButMissingRedirectHistoryFails() {
  const classification = classifyResponse(
    {
      finalUrl: "https://mullusi.com/",
      statusCode: 200,
      headers: {
        server: "cloudflare",
        "cf-ray": "example-IAD",
      },
    },
    "https://www.mullusi.com/",
  );

  assert.equal(classification.verdict, "CanonicalRedirectHistoryMissing");
  assert.equal(classification.proofState, "Fail");
  assert.equal(classification.cloudflareEdge, true);
  assert.equal(classification.githubOrigin, false);
}

function testWwwHostWithNonPermanentRedirectFails() {
  const classification = classifyResponse(
    {
      finalUrl: "https://mullusi.com/",
      statusCode: 200,
      redirectHistory: [
        {
          from: "https://www.mullusi.com/",
          to: "https://mullusi.com/",
          statusCode: 302,
        },
      ],
      headers: {
        server: "cloudflare",
        "cf-ray": "example-IAD",
      },
    },
    "https://www.mullusi.com/",
  );

  assert.equal(classification.verdict, "CanonicalRedirectStatusMismatch");
  assert.equal(classification.proofState, "Fail");
  assert.equal(classification.cloudflareEdge, true);
  assert.equal(classification.githubOrigin, false);
}

function testWwwHostWithIndirectApexRedirectFails() {
  const classification = classifyResponse(
    {
      finalUrl: "https://mullusi.com/",
      statusCode: 200,
      redirectHistory: [
        {
          from: "https://www.mullusi.com/",
          to: "https://www.mullusi.com/?canonical=1",
          statusCode: 301,
        },
        {
          from: "https://www.mullusi.com/?canonical=1",
          to: "https://mullusi.com/",
          statusCode: 301,
        },
      ],
      headers: {
        server: "cloudflare",
        "cf-ray": "example-IAD",
      },
    },
    "https://www.mullusi.com/",
  );

  assert.equal(classification.verdict, "CanonicalRedirectChainMismatch");
  assert.equal(classification.proofState, "Fail");
  assert.equal(classification.cloudflareEdge, true);
  assert.equal(classification.githubOrigin, false);
}

function testWwwHostWithExtraRedirectAfterApexFails() {
  const classification = classifyResponse(
    {
      finalUrl: "https://mullusi.com/",
      statusCode: 200,
      redirectHistory: [
        {
          from: "https://www.mullusi.com/",
          to: "https://mullusi.com/",
          statusCode: 301,
        },
        {
          from: "https://mullusi.com/",
          to: "https://mullusi.com/",
          statusCode: 301,
        },
      ],
      headers: {
        server: "cloudflare",
        "cf-ray": "example-IAD",
      },
    },
    "https://www.mullusi.com/",
  );

  assert.equal(classification.verdict, "CanonicalRedirectChainMismatch");
  assert.equal(classification.proofState, "Fail");
  assert.equal(classification.cloudflareEdge, true);
  assert.equal(classification.githubOrigin, false);
}

function testTargetUrlValidationAcceptsCanonicalWwwRedirectHost() {
  const validated = validateTargetUrl("https://www.mullusi.com/");

  assert.equal(validated, "https://www.mullusi.com/");
}

function testTargetUrlValidationAcceptsCanonicalWwwPathQueryWitness() {
  const validated = validateTargetUrl("https://www.mullusi.com/proof/?gate=www-canonical");

  assert.equal(validated, "https://www.mullusi.com/proof/?gate=www-canonical");
}

function testTargetUrlValidationBlocksUndeclaredWwwRoute() {
  assert.throws(
    () => validateTargetUrl("https://www.mullusi.com/proof/"),
    /target_www_route_invalid/,
  );
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

function testCliRejectsUnsupportedArgumentWithoutNetwork() {
  const result = runOriginCli(["--unexpected"]);

  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /verdict=UnsupportedArgument/);
  assert.match(result.stdout, /proof_state=Fail/);
  assert.match(result.stdout, /error=unsupported_args:--unexpected/);
}

function testCliRejectsUnsupportedArgumentAsJson() {
  const result = runOriginCli(["--json", "--unexpected"]);
  const body = JSON.parse(result.stdout);

  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  assert.equal(body[0].verdict, "UnsupportedArgument");
  assert.equal(body[0].proof_state, "Fail");
  assert.equal(body[0].error, "unsupported_args:--unexpected");
}

testGithubPagesOriginClassification();
testCloudflareOriginCandidateClassification();
testUnknownOriginClassification();
testCloudflareHeadersWithUnexpectedStatusBlocksPublication();
testWwwHostWithoutApexRedirectStaysPending();
testWwwHostWithApexRedirectPasses();
testWwwHostWithPathQueryPreservationPasses();
testWwwHostWithPathQueryMismatchFails();
testWwwHostWithApexFinalUrlButMissingRedirectHistoryFails();
testWwwHostWithNonPermanentRedirectFails();
testWwwHostWithIndirectApexRedirectFails();
testWwwHostWithExtraRedirectAfterApexFails();
testTargetUrlValidationAcceptsMullusiHttpsRoute();
testTargetUrlValidationAcceptsCanonicalWwwRedirectHost();
testTargetUrlValidationAcceptsCanonicalWwwPathQueryWitness();
testTargetUrlValidationBlocksUndeclaredWwwRoute();
testTargetUrlValidationBlocksNonHttpsRoute();
testTargetUrlValidationBlocksExternalHost();
testCliRejectsUnsupportedArgumentWithoutNetwork();
testCliRejectsUnsupportedArgumentAsJson();
console.log("website origin classification tests passed");
