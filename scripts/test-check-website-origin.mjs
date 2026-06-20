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
import {
  classifyHeaders,
  classifyResponse,
  formatReport,
  publicErrorCode,
  validateTargetUrl,
  witnessRecord,
} from "./check-website-origin.mjs";

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
  assert.match(result.stdout, /error=unsupported_args_count:1/);
  assert.doesNotMatch(result.stdout, /--unexpected/);
}

function testCliRejectsUnsupportedArgumentAsJson() {
  const result = runOriginCli(["--json", "--unexpected"]);
  const body = JSON.parse(result.stdout);

  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  assert.equal(body[0].verdict, "UnsupportedArgument");
  assert.equal(body[0].proof_state, "Fail");
  assert.equal(body[0].error, "unsupported_args_count:1");
  assert.equal(JSON.stringify(body).includes("--unexpected"), false);
}

function testPublicErrorCodeRedactsRawExceptionValues() {
  const timeout = publicErrorCode(new Error("request_timeout:https://mullusi.com/assets/app.js"));
  const host = publicErrorCode(new Error("target_host_invalid:private.example.internal"));
  const route = publicErrorCode(new Error("target_www_route_invalid:https://www.mullusi.com/private/"));
  const network = publicErrorCode(new Error("getaddrinfo ENOTFOUND private.example.internal"));
  const fallback = publicErrorCode(new Error("unexpected private path D:\\secret\\origin.txt"));

  assert.equal(timeout, "origin_check_request_timeout");
  assert.equal(host, "origin_check_target_host_invalid");
  assert.equal(route, "origin_check_target_www_route_invalid");
  assert.equal(network, "origin_check_network_unavailable");
  assert.equal(fallback, "origin_check_unavailable");
  assert.doesNotMatch([timeout, host, route, network, fallback].join("\n"), /mullusi\.com|private|secret|origin\.txt/);
}

function testOriginReportRedactsPrivateResponseUrls() {
  const classification = {
    verdict: "CanonicalRedirectPending",
    proofState: "Unknown",
    summary: "Synthetic private URL fixture.",
  };
  const response = {
    finalUrl: "https://private.example.invalid/final?private_id=hidden",
    statusCode: 200,
    headers: {
      server: "cloudflare",
    },
    redirectHistory: [
      {
        to: "https://mullusi.com/private/?auth=hidden",
        statusCode: 302,
      },
    ],
  };
  const report = formatReport("https://mullusi.com/private/?auth=hidden", response, classification);
  const record = witnessRecord("https://mullusi.com/private/?auth=hidden", response, classification);
  const serialized = JSON.stringify(record);

  assert.match(report, /^target=redacted_url$/m);
  assert.match(report, /^final_url=redacted_url$/m);
  assert.match(report, /^first_redirect_url=redacted_url$/m);
  assert.equal(record.target, "redacted_url");
  assert.equal(record.final_url, "redacted_url");
  assert.equal(record.first_redirect_url, "redacted_url");
  assert.doesNotMatch(`${report}\n${serialized}`, /private\.example\.invalid|private_id=hidden|auth=hidden/);
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
testPublicErrorCodeRedactsRawExceptionValues();
testOriginReportRedactsPrivateResponseUrls();
console.log("website origin classification tests passed");
