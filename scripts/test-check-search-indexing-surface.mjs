/*
Purpose: verify live search-surface gate behavior without network access.
Governance scope: sitemap comparison, robots policy evaluation, route reachability, canonical/noindex checks, and report formatting.
Dependencies: Node.js standard library and scripts/check-search-indexing-surface.mjs.
Invariants: tests are deterministic, dependency-free, and fail closed when indexing blocker detection regresses.
*/

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  compareSitemapEntries,
  evaluateRobotsResponse,
  evaluateRouteResponse,
  evaluateSearchIndexingEvidence,
  formatResult,
  parseSitemapEntries,
  publicErrorCode,
} from "./check-search-indexing-surface.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptsDir, "..");
const checkerScript = path.join(scriptsDir, "check-search-indexing-surface.mjs");

const localSitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://mullusi.com/</loc>
    <lastmod>2026-05-24</lastmod>
  </url>
  <url>
    <loc>https://mullusi.com/doctrine/</loc>
    <lastmod>2026-05-24</lastmod>
  </url>
</urlset>`;

function htmlResponse(url, canonicalUrl = url) {
  return {
    finalUrl: url,
    statusCode: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    body: `<html><head><link rel="canonical" href="${canonicalUrl}" /></head><body>Mullusi</body></html>`,
  };
}

function runChecker(args) {
  return spawnSync(process.execPath, [checkerScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function testSitemapComparisonDetectsDrift() {
  const localEntries = parseSitemapEntries(localSitemap);
  const liveEntries = parseSitemapEntries(`<?xml version="1.0" encoding="UTF-8"?>
  <urlset>
    <url>
      <loc>https://mullusi.com/</loc>
      <lastmod>2026-05-16</lastmod>
    </url>
    <url>
      <loc>https://mullusi.com/old/</loc>
      <lastmod>2026-05-16</lastmod>
    </url>
  </urlset>`);
  const findings = compareSitemapEntries(localEntries, liveEntries);

  assert.equal(localEntries.length, 2);
  assert.equal(liveEntries.length, 2);
  assert.ok(findings.includes("live_sitemap_loc_missing:https://mullusi.com/doctrine/"));
  assert.ok(findings.includes("live_sitemap_lastmod_stale:https://mullusi.com/:local=2026-05-24:live=2026-05-16"));
  assert.ok(findings.includes("live_sitemap_loc_untracked:https://mullusi.com/old/"));
}

function testSitemapComparisonRedactsUnsafeLocAndLastmod() {
  const findings = compareSitemapEntries(
    [
      { loc: "https://private.example.internal/page", lastmod: "private-local-date" },
      { loc: "https://private.example.internal/stale", lastmod: "private-local-date" },
    ],
    [
      { loc: "https://private.example.internal/old", lastmod: "private-live-date" },
      { loc: "https://private.example.internal/stale", lastmod: "private-live-date" },
    ],
  );
  const serialized = JSON.stringify(findings);

  assert.ok(findings.includes("live_sitemap_loc_missing:redacted_url"));
  assert.ok(findings.includes("live_sitemap_lastmod_stale:redacted_url:local=redacted_value:live=redacted_value"));
  assert.ok(findings.includes("live_sitemap_loc_untracked:redacted_url"));
  assert.doesNotMatch(serialized, /private\.example\.internal|private-local-date|private-live-date/);
}

function testRobotsEvaluationKeepsSearchAccessExplicit() {
  const validFindings = evaluateRobotsResponse({
    statusCode: 200,
    headers: {},
    body: "User-agent: *\nAllow: /\nSitemap: https://mullusi.com/sitemap.xml\n",
  }, "https://mullusi.com/sitemap.xml");
  const blockedFindings = evaluateRobotsResponse({
    statusCode: 403,
    headers: { "x-robots-tag": "noindex" },
    body: "User-agent: ExampleBot\nDisallow: /\n",
  }, "https://mullusi.com/sitemap.xml");

  assert.deepEqual(validFindings, []);
  assert.ok(blockedFindings.includes("robots_status_invalid:403"));
  assert.ok(blockedFindings.includes("robots_x_robots_noindex"));
  assert.ok(blockedFindings.includes("robots_user_agent_wildcard_missing"));
  assert.ok(blockedFindings.includes("robots_allow_root_missing"));
  assert.ok(blockedFindings.includes("robots_sitemap_missing:https://mullusi.com/sitemap.xml"));
}

function testRouteEvaluationDetectsCanonicalAndIndexingBlockers() {
  const routeUrl = "https://mullusi.com/doctrine/";
  const validFindings = evaluateRouteResponse(routeUrl, htmlResponse(routeUrl));
  const statusFindings = evaluateRouteResponse(routeUrl, {
    finalUrl: routeUrl,
    statusCode: 404,
    headers: { "content-type": "text/html" },
    body: "<html></html>",
  });
  const noindexFindings = evaluateRouteResponse(routeUrl, {
    finalUrl: routeUrl,
    statusCode: 200,
    headers: { "content-type": "text/html", "x-robots-tag": "noindex" },
    body: '<html><head><meta name="robots" content="noindex"><link rel="canonical" href="https://mullusi.com/wrong/" /></head></html>',
  });

  assert.deepEqual(validFindings, []);
  assert.ok(statusFindings.includes("live_route_status_invalid:https://mullusi.com/doctrine/:404"));
  assert.ok(noindexFindings.includes("live_route_x_robots_noindex:https://mullusi.com/doctrine/"));
  assert.ok(noindexFindings.includes("live_route_meta_noindex:https://mullusi.com/doctrine/"));
  assert.ok(noindexFindings.includes("live_route_canonical_mismatch:https://mullusi.com/doctrine/:https://mullusi.com/wrong/"));
}

function testRouteEvaluationRedactsUnsafeCanonicalHref() {
  const routeUrl = "https://mullusi.com/doctrine/";
  const findings = evaluateRouteResponse(routeUrl, htmlResponse(routeUrl, "https://private.example.internal/path?trace=bounded"));
  const serialized = JSON.stringify(findings);

  assert.ok(findings.includes("live_route_canonical_mismatch:https://mullusi.com/doctrine/:redacted_url"));
  assert.doesNotMatch(serialized, /private\.example\.internal|trace=bounded/);
}

function testRouteEvaluationRedactsUnsafeRouteAndFinalUrls() {
  const routeUrl = "https://private.example.internal/private-route";
  const statusFindings = evaluateRouteResponse(routeUrl, {
    finalUrl: routeUrl,
    statusCode: 503,
    headers: { "content-type": "text/html" },
    body: "<html></html>",
  });
  const finalUrlFindings = evaluateRouteResponse(routeUrl, {
    finalUrl: "https://private.example.internal/private-final",
    statusCode: 200,
    headers: { "content-type": "text/html", "x-robots-tag": "noindex" },
    body: '<html><head><meta name="robots" content="noindex"><link rel="canonical" href="https://private.example.internal/private-canonical" /></head></html>',
  });
  const serialized = JSON.stringify([...statusFindings, ...finalUrlFindings]);

  assert.ok(statusFindings.includes("live_route_status_invalid:redacted_url:503"));
  assert.ok(finalUrlFindings.includes("live_route_final_url_mismatch:redacted_url:redacted_url"));
  assert.ok(finalUrlFindings.includes("live_route_x_robots_noindex:redacted_url"));
  assert.ok(finalUrlFindings.includes("live_route_meta_noindex:redacted_url"));
  assert.ok(finalUrlFindings.includes("live_route_canonical_mismatch:redacted_url:redacted_url"));
  assert.doesNotMatch(serialized, /private\.example\.internal|private-route|private-final|private-canonical/);
}

function testEvidenceEvaluationProducesBlockingVerdict() {
  const routeResponses = new Map([
    ["https://mullusi.com/", htmlResponse("https://mullusi.com/")],
    ["https://mullusi.com/doctrine/", {
      finalUrl: "https://mullusi.com/doctrine/",
      statusCode: 404,
      headers: { "content-type": "text/html" },
      body: "<html></html>",
    }],
  ]);
  const result = evaluateSearchIndexingEvidence({
    localSitemapXml: localSitemap,
    liveRobotsResponse: {
      statusCode: 200,
      headers: {},
      body: "User-agent: *\nAllow: /\nSitemap: https://mullusi.com/sitemap.xml\n",
    },
    liveSitemapResponse: {
      statusCode: 200,
      headers: { "content-type": "application/xml" },
      body: `<?xml version="1.0" encoding="UTF-8"?>
      <urlset>
        <url>
          <loc>https://mullusi.com/</loc>
          <lastmod>2026-05-16</lastmod>
        </url>
      </urlset>`,
    },
    routeResponses,
  });
  const formatted = formatResult(result);

  assert.equal(result.verdict, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.localSitemapLocCount, 2);
  assert.equal(result.liveSitemapLocCount, 1);
  assert.ok(result.findings.includes("live_sitemap_loc_missing:https://mullusi.com/doctrine/"));
  assert.ok(result.findings.includes("live_route_status_invalid:https://mullusi.com/doctrine/:404"));
  assert.match(formatted, /verdict=GovernanceBlocked/);
}

function testCliRejectsUnsupportedArgumentWithoutNetwork() {
  const result = runChecker(["--unexpected"]);

  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /verdict=GovernanceBlocked/);
  assert.match(result.stdout, /proof_state=Fail/);
  assert.match(result.stdout, /error=unsupported_args_count:1/);
  assert.doesNotMatch(result.stdout, /--unexpected/);
}

function testCliRejectsUnsupportedArgumentAsJson() {
  const result = runChecker(["--json", "--unexpected"]);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  assert.equal(payload.verdict, "GovernanceBlocked");
  assert.equal(payload.proof_state, "Fail");
  assert.equal(payload.error, "unsupported_args_count:1");
  assert.equal(JSON.stringify(payload).includes("--unexpected"), false);
}

function testPublicErrorCodeRedactsRawExceptionValues() {
  const timeout = publicErrorCode(new Error("request_timeout:https://mullusi.com/sitemap.xml"));
  const host = publicErrorCode(new Error("target_host_invalid:private.example.internal"));
  const network = publicErrorCode(new Error("getaddrinfo ENOTFOUND private.example.internal"));
  const invalidUrl = publicErrorCode(new Error("Invalid URL: private input"));
  const fallback = publicErrorCode(new Error("unexpected private path D:\\secret\\sitemap.xml"));

  assert.equal(timeout, "search_indexing_request_timeout");
  assert.equal(host, "search_indexing_target_host_invalid");
  assert.equal(network, "search_indexing_network_unavailable");
  assert.equal(invalidUrl, "search_indexing_url_invalid");
  assert.equal(fallback, "search_indexing_unavailable");
  assert.doesNotMatch([timeout, host, network, invalidUrl, fallback].join("\n"), /mullusi\.com|private|secret|sitemap\.xml/);
}

testSitemapComparisonDetectsDrift();
testSitemapComparisonRedactsUnsafeLocAndLastmod();
testRobotsEvaluationKeepsSearchAccessExplicit();
testRouteEvaluationDetectsCanonicalAndIndexingBlockers();
testRouteEvaluationRedactsUnsafeCanonicalHref();
testRouteEvaluationRedactsUnsafeRouteAndFinalUrls();
testEvidenceEvaluationProducesBlockingVerdict();
testCliRejectsUnsupportedArgumentWithoutNetwork();
testCliRejectsUnsupportedArgumentAsJson();
testPublicErrorCodeRedactsRawExceptionValues();
console.log("search indexing surface tests passed");
