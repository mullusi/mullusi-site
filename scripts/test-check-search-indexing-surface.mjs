/*
Purpose: verify live search-surface gate behavior without network access.
Governance scope: sitemap comparison, robots policy evaluation, route reachability, canonical/noindex checks, and report formatting.
Dependencies: Node.js standard library and scripts/check-search-indexing-surface.mjs.
Invariants: tests are deterministic, dependency-free, and fail closed when indexing blocker detection regresses.
*/

import assert from "node:assert/strict";
import {
  compareSitemapEntries,
  evaluateRobotsResponse,
  evaluateRouteResponse,
  evaluateSearchIndexingEvidence,
  formatResult,
  parseSitemapEntries,
} from "./check-search-indexing-surface.mjs";

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

testSitemapComparisonDetectsDrift();
testRobotsEvaluationKeepsSearchAccessExplicit();
testRouteEvaluationDetectsCanonicalAndIndexingBlockers();
testEvidenceEvaluationProducesBlockingVerdict();
console.log("search indexing surface tests passed");
