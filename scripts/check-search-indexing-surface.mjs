/*
Purpose: evaluate live Mullusi search-indexing surfaces against the local sitemap contract.
Governance scope: public crawl access, sitemap freshness, canonical route reachability, and noindex blockers.
Dependencies: Node.js standard library, local sitemap.xml, public HTTPS response bodies.
Invariants: evidence is deterministic, public-safe, and exits nonzero on blocking live search-surface drift unless --allow-pending is set.
Test contract: run node scripts/test-check-search-indexing-surface.mjs.
*/

import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const defaultBaseUrl = "https://mullusi.com";
const allowedHostnames = new Set(["mullusi.com", "www.mullusi.com"]);
const maxBodyBytes = 1_000_000;

function normalizedHeaderValue(value) {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  return value ?? "";
}

function normalizedHeaders(headers) {
  const normalized = {};
  for (const [key, value] of Object.entries(headers ?? {})) {
    normalized[key.toLowerCase()] = normalizedHeaderValue(value);
  }
  return normalized;
}

function decodeXmlEntities(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'");
}

export function normalizeUrlForComparison(url) {
  const parsed = new URL(url);
  parsed.hash = "";
  if (parsed.pathname === "/" && parsed.search === "") {
    return `${parsed.origin}/`;
  }
  return parsed.toString();
}

export function parseSitemapEntries(xml) {
  const entries = [];
  for (const urlBlock of xml.matchAll(/<url\b[^>]*>([\s\S]*?)<\/url>/g)) {
    const block = urlBlock[1];
    const loc = block.match(/<loc>([\s\S]*?)<\/loc>/)?.[1]?.trim();
    if (!loc) {
      continue;
    }
    const lastmod = block.match(/<lastmod>([\s\S]*?)<\/lastmod>/)?.[1]?.trim() ?? "";
    entries.push({
      loc: normalizeUrlForComparison(decodeXmlEntities(loc)),
      lastmod: decodeXmlEntities(lastmod),
    });
  }
  return entries;
}

function sitemapEntryMap(entries) {
  return new Map(entries.map((entry) => [entry.loc, entry]));
}

export function compareSitemapEntries(localEntries, liveEntries) {
  const findings = [];
  const localByLoc = sitemapEntryMap(localEntries);
  const liveByLoc = sitemapEntryMap(liveEntries);

  for (const localEntry of localEntries) {
    const liveEntry = liveByLoc.get(localEntry.loc);
    if (!liveEntry) {
      findings.push(`live_sitemap_loc_missing:${localEntry.loc}`);
      continue;
    }
    if (localEntry.lastmod && liveEntry.lastmod && localEntry.lastmod !== liveEntry.lastmod) {
      findings.push(`live_sitemap_lastmod_stale:${localEntry.loc}:local=${localEntry.lastmod}:live=${liveEntry.lastmod}`);
    }
  }

  for (const liveEntry of liveEntries) {
    if (!localByLoc.has(liveEntry.loc)) {
      findings.push(`live_sitemap_loc_untracked:${liveEntry.loc}`);
    }
  }

  return findings;
}

function hasNoindexDirective(value) {
  return /\bnoindex\b/i.test(value);
}

function canonicalHrefForHtml(html) {
  const match = html.match(/<link\b[^>]*rel=["'][^"']*\bcanonical\b[^"']*["'][^>]*>/i);
  if (!match) {
    return "";
  }
  return match[0].match(/\bhref=["']([^"']+)["']/i)?.[1] ?? "";
}

function routeUrlMatchesCanonical(routeUrl, canonicalUrl) {
  if (!canonicalUrl) {
    return false;
  }
  let route;
  let canonical;
  try {
    route = normalizeUrlForComparison(routeUrl);
    canonical = normalizeUrlForComparison(canonicalUrl);
  } catch {
    return false;
  }
  if (route === canonical) {
    return true;
  }
  return route === `${canonical}/` || `${route}/` === canonical;
}

function publicCanonicalHrefLabel(canonicalHref) {
  try {
    return validateTargetUrl(canonicalHref);
  } catch {
    return "redacted_url";
  }
}

export function publicErrorCode(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith("search_indexing_")) {
    return message;
  }
  if (message.startsWith("request_timeout:")) {
    return "search_indexing_request_timeout";
  }
  if (message.startsWith("target_protocol_invalid:")) {
    return "search_indexing_target_protocol_invalid";
  }
  if (message.startsWith("target_host_invalid:")) {
    return "search_indexing_target_host_invalid";
  }
  if (/ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN/.test(message)) {
    return "search_indexing_network_unavailable";
  }
  if (error instanceof SyntaxError || /Invalid URL/.test(message)) {
    return "search_indexing_url_invalid";
  }
  return "search_indexing_unavailable";
}

export function evaluateRobotsResponse(response, expectedSitemapUrl) {
  const findings = [];
  const statusCode = response?.statusCode ?? 0;
  const body = response?.body ?? "";
  const headers = normalizedHeaders(response?.headers);
  const hasWildcardAgent = /^User-agent:\s*\*\s*$/im.test(body);
  const hasAllowRoot = /^Allow:\s*\/\s*$/im.test(body);
  const hasWildcardDisallowRoot = /^User-agent:\s*\*\s*$/im.test(body) && /^Disallow:\s*\/\s*$/im.test(body);

  if (statusCode < 200 || statusCode >= 300) {
    findings.push(`robots_status_invalid:${statusCode}`);
  }
  if (hasNoindexDirective(headers["x-robots-tag"] ?? "")) {
    findings.push("robots_x_robots_noindex");
  }
  if (!hasWildcardAgent) {
    findings.push("robots_user_agent_wildcard_missing");
  }
  if (!hasAllowRoot) {
    findings.push("robots_allow_root_missing");
  }
  if (!body.includes(`Sitemap: ${expectedSitemapUrl}`)) {
    findings.push(`robots_sitemap_missing:${expectedSitemapUrl}`);
  }
  if (hasWildcardDisallowRoot && !hasAllowRoot) {
    findings.push("robots_wildcard_disallow_root");
  }

  return findings;
}

export function evaluateRouteResponse(routeUrl, response) {
  const findings = [];
  const statusCode = response?.statusCode ?? 0;
  const headers = normalizedHeaders(response?.headers);
  const contentType = headers["content-type"] ?? "";
  const body = response?.body ?? "";

  if (statusCode < 200 || statusCode >= 300) {
    findings.push(`live_route_status_invalid:${routeUrl}:${statusCode}`);
    return findings;
  }
  if (response.finalUrl && normalizeUrlForComparison(response.finalUrl) !== normalizeUrlForComparison(routeUrl)) {
    findings.push(`live_route_final_url_mismatch:${routeUrl}:${response.finalUrl}`);
  }
  if (hasNoindexDirective(headers["x-robots-tag"] ?? "")) {
    findings.push(`live_route_x_robots_noindex:${routeUrl}`);
  }
  if (/text\/html/i.test(contentType)) {
    if (/<meta\b[^>]*name=["']robots["'][^>]*content=["'][^"']*\bnoindex\b/i.test(body)) {
      findings.push(`live_route_meta_noindex:${routeUrl}`);
    }
    const canonicalHref = canonicalHrefForHtml(body);
    if (!canonicalHref) {
      findings.push(`live_route_canonical_missing:${routeUrl}`);
    } else if (!routeUrlMatchesCanonical(routeUrl, canonicalHref)) {
      findings.push(`live_route_canonical_mismatch:${routeUrl}:${publicCanonicalHrefLabel(canonicalHref)}`);
    }
  }

  return findings;
}

export function evaluateSearchIndexingEvidence(evidence) {
  const localEntries = parseSitemapEntries(evidence.localSitemapXml);
  const liveEntries = parseSitemapEntries(evidence.liveSitemapResponse.body ?? "");
  const sitemapUrl = `${defaultBaseUrl}/sitemap.xml`;
  const findings = [
    ...evaluateRobotsResponse(evidence.liveRobotsResponse, sitemapUrl),
    ...compareSitemapEntries(localEntries, liveEntries),
  ];

  const liveSitemapStatus = evidence.liveSitemapResponse?.statusCode ?? 0;
  if (liveSitemapStatus < 200 || liveSitemapStatus >= 300) {
    findings.push(`live_sitemap_status_invalid:${liveSitemapStatus}`);
  }
  if (hasNoindexDirective(normalizedHeaders(evidence.liveSitemapResponse?.headers)["x-robots-tag"] ?? "")) {
    findings.push("live_sitemap_x_robots_noindex");
  }

  const routeResponses = evidence.routeResponses ?? new Map();
  for (const localEntry of localEntries) {
    findings.push(...evaluateRouteResponse(localEntry.loc, routeResponses.get(localEntry.loc)));
  }

  return {
    verdict: findings.length === 0 ? "SolvedVerified" : "GovernanceBlocked",
    proofState: findings.length === 0 ? "Pass" : "Fail",
    localSitemapLocCount: localEntries.length,
    liveSitemapLocCount: liveEntries.length,
    findings,
  };
}

function validateTargetUrl(targetUrl) {
  const parsed = new URL(targetUrl);
  if (parsed.protocol !== "https:") {
    throw new Error(`target_protocol_invalid:${parsed.protocol}`);
  }
  if (!allowedHostnames.has(parsed.hostname)) {
    throw new Error(`target_host_invalid:${parsed.hostname}`);
  }
  return parsed.toString();
}

function requestGet(targetUrl, redirectBudget = 5, redirectHistory = []) {
  const safeUrl = validateTargetUrl(targetUrl);
  return new Promise((resolve, reject) => {
    const request = https.request(safeUrl, { method: "GET", headers: { "User-Agent": "mullusi-search-surface-check/1" } }, (response) => {
      const statusCode = response.statusCode ?? 0;
      const location = normalizedHeaderValue(response.headers.location);
      if (statusCode >= 300 && statusCode < 400 && location && redirectBudget > 0) {
        const redirectedUrl = validateTargetUrl(new URL(location, safeUrl).toString());
        response.resume();
        requestGet(redirectedUrl, redirectBudget - 1, [
          ...redirectHistory,
          { from: safeUrl, to: redirectedUrl, statusCode },
        ]).then(resolve, reject);
        return;
      }

      const chunks = [];
      let receivedBytes = 0;
      response.on("data", (chunk) => {
        receivedBytes += chunk.length;
        if (receivedBytes <= maxBodyBytes) {
          chunks.push(chunk);
        }
      });
      response.on("end", () => {
        resolve({
          finalUrl: safeUrl,
          statusCode,
          headers: response.headers,
          body: Buffer.concat(chunks).toString("utf8"),
          redirectHistory,
        });
      });
    });
    request.setTimeout(15_000, () => {
      request.destroy(new Error(`request_timeout:${safeUrl}`));
    });
    request.on("error", reject);
    request.end();
  });
}

async function collectLiveEvidence() {
  const localSitemapXml = fs.readFileSync(path.join(repoRoot, "sitemap.xml"), "utf8");
  const localEntries = parseSitemapEntries(localSitemapXml);
  const liveRobotsResponse = await requestGet(`${defaultBaseUrl}/robots.txt`);
  const liveSitemapResponse = await requestGet(`${defaultBaseUrl}/sitemap.xml`);
  const routeResponses = new Map();
  for (const entry of localEntries) {
    routeResponses.set(entry.loc, await requestGet(entry.loc));
  }
  return {
    localSitemapXml,
    liveRobotsResponse,
    liveSitemapResponse,
    routeResponses,
  };
}

function formatResult(result) {
  const findingLines = result.findings.length > 0
    ? result.findings.map((finding) => `finding=${finding}`)
    : ["finding=none"];
  return [
    `verdict=${result.verdict}`,
    `proof_state=${result.proofState}`,
    `local_sitemap_loc_count=${result.localSitemapLocCount}`,
    `live_sitemap_loc_count=${result.liveSitemapLocCount}`,
    ...findingLines,
  ].join("\n");
}

function unsupportedOptions(args) {
  const allowedOptions = new Set(["--allow-pending", "--json"]);
  return args.filter((arg) => arg.startsWith("--") && !allowedOptions.has(arg));
}

async function runCli() {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes("--json");
  const allowPending = args.includes("--allow-pending");
  const invalidOptions = unsupportedOptions(args);
  if (invalidOptions.length > 0) {
    const error = `unsupported_args_count:${invalidOptions.length}`;
    if (jsonOutput) {
      console.log(JSON.stringify({ verdict: "GovernanceBlocked", proof_state: "Fail", error }, null, 2));
    } else {
      console.log(`verdict=GovernanceBlocked\nproof_state=Fail\nerror=${error}`);
    }
    process.exit(1);
    return;
  }

  try {
    const evidence = await collectLiveEvidence();
    const result = evaluateSearchIndexingEvidence(evidence);
    if (jsonOutput) {
      console.log(JSON.stringify({
        verdict: result.verdict,
        proof_state: result.proofState,
        local_sitemap_loc_count: result.localSitemapLocCount,
        live_sitemap_loc_count: result.liveSitemapLocCount,
        findings: result.findings,
      }, null, 2));
    } else {
      console.log(formatResult(result));
    }
    if (result.verdict !== "SolvedVerified" && !allowPending) {
      process.exit(1);
    }
  } catch (error) {
    if (jsonOutput) {
      console.log(JSON.stringify({ verdict: "AwaitingEvidence", proof_state: "Unknown", error: publicErrorCode(error) }, null, 2));
    } else {
      console.log(`verdict=AwaitingEvidence\nproof_state=Unknown\nerror=${publicErrorCode(error)}`);
    }
    if (!allowPending) {
      process.exit(1);
    }
  }
}

export { formatResult };

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
