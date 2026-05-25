/*
Purpose: verify that the live Mullusi edge serves public files matching the live status manifest.
Governance scope: deployed public-file integrity, status-manifest consistency, local-to-live deployment drift evidence, and public-safe output.
Dependencies: Node.js standard library, local status.json, and public HTTPS responses from mullusi.com.
Invariants: records hashes as pass/fail states only, never records response bodies, raw response headers, provider account IDs, tokens, credentials, or DNS target values.
Test contract: run node scripts/test-check-live-deployment-integrity.mjs.
*/

import fs from "node:fs";
import crypto from "node:crypto";
import https from "node:https";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const defaultBaseUrl = "https://mullusi.com";
const allowedHostnames = new Set(["mullusi.com"]);
const maxBodyBytes = 2_000_000;
const cloudflareBeaconPattern = /<script defer src="https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js[\s\S]*?<\/script>\s*/g;
const cloudflareEmailDecodeScriptPattern =
  /<script data-cfasync="false" src="\/cdn-cgi\/scripts\/[^"]+\/cloudflare-static\/email-decode\.min\.js"><\/script>\s*/g;
const cloudflareProtectedEmailLinkPattern =
  /<a href="\/cdn-cgi\/l\/email-protection#([a-f0-9]+)"><span class="__cf_email__" data-cfemail="([a-f0-9]+)">\[email&#160;protected\]<\/span><\/a>/gi;
const cloudflareEmailResiduePattern = /\/cdn-cgi\/l\/email-protection|__cf_email__|email-decode\.min\.js/;
const governedHashPaths = [
  "index.html",
  "data/site.json",
  "data/generated/products.json",
  "data/manual/public-surfaces.json",
  "data/generated/homepage-product-registry.json",
  "data/generated/claim-registry.json",
  "data/generated/runtime-witness-index.json",
];
const routeSentinels = [
  {
    id: "browse_docs_route",
    urlPath: "/browse/",
    requiredTerms: ["https://docs.mullusi.com/"],
    forbiddenTerms: ["https://docs.mullusi.com/browse"],
  },
  {
    id: "search_docs_route",
    urlPath: "/search/",
    requiredTerms: ["https://docs.mullusi.com/docs/search.html"],
    forbiddenTerms: ["https://docs.mullusi.com/search\""],
  },
];

function sha256Hex(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function canonicalJsonValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalJsonValue(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalJsonValue(value[key])]),
    );
  }
  return value;
}

function decodeCloudflareEmailHex(hexValue) {
  if (!/^[a-f0-9]+$/i.test(hexValue) || hexValue.length < 4 || hexValue.length % 2 !== 0) {
    throw new Error(`cloudflare_email_hex_invalid:${hexValue}`);
  }
  const key = Number.parseInt(hexValue.slice(0, 2), 16);
  const decodedBytes = [];
  for (let index = 2; index < hexValue.length; index += 2) {
    decodedBytes.push(Number.parseInt(hexValue.slice(index, index + 2), 16) ^ key);
  }
  return Buffer.from(decodedBytes).toString("utf8");
}

function normalizeCloudflareEdgeTransforms(content) {
  const normalized = String(content)
    .replace(cloudflareEmailDecodeScriptPattern, "")
    .replace(cloudflareProtectedEmailLinkPattern, (_match, hrefHex, spanHex) => {
      const hrefEmailAddress = decodeCloudflareEmailHex(hrefHex);
      const spanEmailAddress = decodeCloudflareEmailHex(spanHex);
      if (hrefEmailAddress !== spanEmailAddress) {
        throw new Error(`cloudflare_email_decode_mismatch:${hrefEmailAddress}:${spanEmailAddress}`);
      }
      return `<a href="mailto:${spanEmailAddress}">${spanEmailAddress}</a>`;
    })
    .replace(cloudflareBeaconPattern, "");
  if (cloudflareEmailResiduePattern.test(normalized)) {
    throw new Error("cloudflare_email_obfuscation_unhandled");
  }
  return normalized;
}

function canonicalText(content) {
  return normalizeCloudflareEdgeTransforms(content).replace(/\r\n/g, "\n");
}

export function canonicalTextContentHash(content) {
  return `sha256:${sha256Hex(canonicalText(content))}`;
}

export function canonicalJsonContentHash(content) {
  const parsed = JSON.parse(content);
  if (parsed?.meta && typeof parsed.meta === "object") {
    delete parsed.meta.content_hash;
  }
  return `sha256:${sha256Hex(JSON.stringify(canonicalJsonValue(parsed)))}`;
}

export function publicFileContentHash(relativePath, content) {
  return relativePath.endsWith(".json")
    ? canonicalJsonContentHash(content)
    : canonicalTextContentHash(content);
}

function isValidGovernedHashPath(relativePath) {
  if (typeof relativePath !== "string" || relativePath.length === 0) return false;
  if (relativePath.startsWith("/") || relativePath.includes("\\") || relativePath.includes("?") || relativePath.includes("#")) {
    return false;
  }
  return !relativePath.split("/").some((segment) => segment === "" || segment === "." || segment === "..");
}

function livePathForGovernedFile(relativePath) {
  return relativePath === "index.html" ? "/" : `/${relativePath}`;
}

function liveUrlForPath(urlPath) {
  return `${defaultBaseUrl}${urlPath}`;
}

function normalizeManifestHashes(hashes) {
  if (!hashes || typeof hashes !== "object" || Array.isArray(hashes)) return {};
  return Object.fromEntries(
    Object.entries(hashes)
      .filter(([key, value]) => typeof key === "string" && typeof value === "string")
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function manifestHashesEqual(left, right) {
  return JSON.stringify(normalizeManifestHashes(left)) === JSON.stringify(normalizeManifestHashes(right));
}

function hasKnownCloudflareHtmlTransform(content) {
  return content.includes("/cdn-cgi/l/email-protection")
    || content.includes("cloudflareinsights.com")
    || content.includes("beacon.min.js");
}

function normalizedHeaderValue(value) {
  if (Array.isArray(value)) return value.join(", ");
  return value ?? "";
}

function validateTargetUrl(targetUrl) {
  const parsed = new URL(targetUrl);
  if (parsed.protocol !== "https:") throw new Error(`target_protocol_invalid:${parsed.protocol}`);
  if (!allowedHostnames.has(parsed.hostname)) throw new Error(`target_host_invalid:${parsed.hostname}`);
  return parsed.toString();
}

function requestGet(targetUrl, redirectBudget = 5) {
  const safeUrl = validateTargetUrl(targetUrl);
  return new Promise((resolve, reject) => {
    const request = https.request(safeUrl, { method: "GET", headers: { "User-Agent": "mullusi-deployment-integrity-check/1" } }, (response) => {
      const statusCode = response.statusCode ?? 0;
      const location = normalizedHeaderValue(response.headers.location);
      if (statusCode >= 300 && statusCode < 400 && location && redirectBudget > 0) {
        const redirectedUrl = validateTargetUrl(new URL(location, safeUrl).toString());
        response.resume();
        requestGet(redirectedUrl, redirectBudget - 1).then(resolve, reject);
        return;
      }

      const chunks = [];
      let receivedBytes = 0;
      response.on("data", (chunk) => {
        receivedBytes += chunk.length;
        if (receivedBytes <= maxBodyBytes) chunks.push(chunk);
      });
      response.on("end", () => {
        resolve({
          finalUrl: safeUrl,
          statusCode,
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
    });
    request.setTimeout(15_000, () => request.destroy(new Error(`request_timeout:${safeUrl}`)));
    request.on("error", reject);
    request.end();
  });
}

function parseJsonBody(body, label, hardFindings) {
  try {
    return JSON.parse(body);
  } catch {
    hardFindings.push(`${label}_json_invalid`);
    return {};
  }
}

export function evaluateDeploymentIntegrityEvidence(evidence) {
  const hardFindings = [];
  const softFindings = [];
  const acceptedFindings = [];
  const liveStatusCode = evidence.liveStatusResponse?.statusCode ?? 0;
  const liveStatusBody = evidence.liveStatusResponse?.body ?? "";
  if (liveStatusCode < 200 || liveStatusCode >= 300) {
    hardFindings.push(`live_status_status_invalid:${liveStatusCode}`);
  }
  const liveStatus = parseJsonBody(liveStatusBody, "live_status", hardFindings);
  const liveHashes = normalizeManifestHashes(liveStatus.content_hashes);
  const localStatus = parseJsonBody(evidence.localStatusJson ?? "{}", "local_status", hardFindings);
  const localHashes = normalizeManifestHashes(localStatus.content_hashes);
  const governedPathSet = new Set(governedHashPaths);
  const routeSentinelResults = [];

  if (liveStatus.site !== "mullusi.com") hardFindings.push(`live_status_site_invalid:${liveStatus.site || ""}`);
  if (liveStatus.public_state !== "Published") hardFindings.push(`live_status_public_state_invalid:${liveStatus.public_state || ""}`);

  for (const relativePath of governedHashPaths) {
    if (!liveHashes[relativePath]) softFindings.push(`live_status_hash_missing:${relativePath}`);
  }

  const liveHashPaths = Object.keys(liveHashes);
  for (const relativePath of liveHashPaths) {
    if (!isValidGovernedHashPath(relativePath)) {
      hardFindings.push(`live_status_hash_path_invalid:${relativePath}`);
      continue;
    }
    if (!governedPathSet.has(relativePath)) softFindings.push(`live_status_hash_path_unexpected:${relativePath}`);
  }

  for (const relativePath of liveHashPaths) {
    if (!liveHashes[relativePath] || !isValidGovernedHashPath(relativePath)) continue;
    const response = evidence.liveFileResponses?.get(relativePath);
    const statusCode = response?.statusCode ?? 0;
    if (statusCode < 200 || statusCode >= 300) {
      hardFindings.push(`live_file_status_invalid:${relativePath}:${statusCode}`);
      continue;
    }
    const expectedFinalUrl = `${defaultBaseUrl}${livePathForGovernedFile(relativePath)}`;
    if (response.finalUrl && response.finalUrl !== expectedFinalUrl) {
      hardFindings.push(`live_file_final_url_mismatch:${relativePath}`);
    }
    const responseBody = response.body ?? "";
    const edgeTransformFinding = `live_html_edge_transform_observed:${relativePath}`;
    const edgeTransformSeen = relativePath === "index.html" && hasKnownCloudflareHtmlTransform(responseBody);
    try {
      const actualHash = publicFileContentHash(relativePath, responseBody);
      if (actualHash !== liveHashes[relativePath]) {
        hardFindings.push(`live_content_hash_mismatch:${relativePath}`);
      } else if (edgeTransformSeen && !acceptedFindings.includes(edgeTransformFinding)) {
        acceptedFindings.push(edgeTransformFinding);
      }
    } catch {
      hardFindings.push(`live_content_hash_unreadable:${relativePath}`);
    }
  }

  if (!manifestHashesEqual(localHashes, liveHashes)) softFindings.push("local_status_manifest_mismatch");

  for (const sentinel of routeSentinels) {
    const response = evidence.routeSentinelResponses?.get(sentinel.id);
    const statusCode = response?.statusCode ?? 0;
    const missingRequiredTerms = sentinel.requiredTerms.filter((term) => !(response?.body ?? "").includes(term));
    const presentForbiddenTerms = sentinel.forbiddenTerms.filter((term) => (response?.body ?? "").includes(term));
    let passed = true;
    if (statusCode < 200 || statusCode >= 300) {
      hardFindings.push(`route_sentinel_status_invalid:${sentinel.id}:${statusCode}`);
      passed = false;
    }
    const expectedFinalUrl = liveUrlForPath(sentinel.urlPath);
    if (response?.finalUrl && response.finalUrl !== expectedFinalUrl) {
      hardFindings.push(`route_sentinel_final_url_mismatch:${sentinel.id}`);
      passed = false;
    }
    for (const term of missingRequiredTerms) {
      hardFindings.push(`route_sentinel_required_term_missing:${sentinel.id}:${term}`);
      passed = false;
    }
    for (const term of presentForbiddenTerms) {
      hardFindings.push(`route_sentinel_forbidden_term_present:${sentinel.id}:${term}`);
      passed = false;
    }
    routeSentinelResults.push({
      id: sentinel.id,
      statusCode,
      missingRequiredCount: missingRequiredTerms.length,
      presentForbiddenCount: presentForbiddenTerms.length,
      passed,
    });
  }

  const hasHardFindings = hardFindings.length > 0;
  const hasSoftFindings = softFindings.length > 0;
  const hasAcceptedFindings = acceptedFindings.length > 0;
  const localManifestMismatch = softFindings.includes("local_status_manifest_mismatch");
  return {
    verdict: hasHardFindings ? "GovernanceBlocked" : hasSoftFindings ? "AwaitingEvidence" : hasAcceptedFindings ? "SolvedUnverified" : "SolvedVerified",
    proofState: hasHardFindings ? "Fail" : hasSoftFindings ? "Unknown" : "Pass",
    liveDeploymentIntegrityState: hasHardFindings ? "GovernanceBlocked" : hasSoftFindings ? "AwaitingEvidence" : hasAcceptedFindings ? "SolvedUnverified" : "SolvedVerified",
    liveStatusManifest: hasHardFindings ? "Fail" : "Pass",
    liveContentHashes: hardFindings.some((finding) => finding.startsWith("live_content_hash_") || finding.startsWith("live_file_"))
      ? "Fail"
      : "Pass",
    localStatusManifestMatch: localManifestMismatch ? "AwaitingEvidence" : "Pass",
    edgeHtmlTransform: hasAcceptedFindings ? "AcceptedBoundary" : "Pass",
    routeSentinels: routeSentinelResults.every((record) => record.passed) ? "Pass" : "Fail",
    governedFileCount: liveHashPaths.length,
    routeSentinelCount: routeSentinelResults.length,
    routeSentinelResults,
    hardFindings,
    softFindings,
    acceptedFindings,
  };
}

async function collectLiveEvidence() {
  const localStatusJson = fs.readFileSync(path.join(repoRoot, "status.json"), "utf8");
  const liveStatusResponse = await requestGet(`${defaultBaseUrl}/status.json`);
  const liveStatus = JSON.parse(liveStatusResponse.body);
  const liveHashes = normalizeManifestHashes(liveStatus.content_hashes);
  const liveFileResponses = new Map();
  for (const relativePath of Object.keys(liveHashes)) {
    if (!liveHashes[relativePath]) continue;
    liveFileResponses.set(relativePath, await requestGet(`${defaultBaseUrl}${livePathForGovernedFile(relativePath)}`));
  }
  const routeSentinelResponses = new Map();
  for (const sentinel of routeSentinels) {
    routeSentinelResponses.set(sentinel.id, await requestGet(liveUrlForPath(sentinel.urlPath)));
  }
  return { localStatusJson, liveStatusResponse, liveFileResponses, routeSentinelResponses };
}

export function formatResult(result) {
  const findingLines = result.hardFindings.length > 0
    ? result.hardFindings.map((finding) => `finding=${finding}`)
    : ["finding=none"];
  const localFindingLines = result.softFindings.length > 0
    ? result.softFindings.map((finding) => `local_finding=${finding}`)
    : ["local_finding=none"];
  const acceptedFindingLines = result.acceptedFindings.length > 0
    ? result.acceptedFindings.map((finding) => `accepted_finding=${finding}`)
    : ["accepted_finding=none"];
  return [
    `verdict=${result.verdict}`,
    `proof_state=${result.proofState}`,
    `live_deployment_integrity_state=${result.liveDeploymentIntegrityState}`,
    `live_status_manifest=${result.liveStatusManifest}`,
    `live_content_hashes=${result.liveContentHashes}`,
    `local_status_manifest_match=${result.localStatusManifestMatch}`,
    `edge_html_transform=${result.edgeHtmlTransform}`,
    `route_sentinels=${result.routeSentinels}`,
    `governed_file_count=${result.governedFileCount}`,
    `route_sentinel_count=${result.routeSentinelCount}`,
    ...result.routeSentinelResults.map((record) => `route_sentinel=${record.id}:${record.passed ? "Pass" : "Fail"}:${record.statusCode}`),
    ...findingLines,
    ...localFindingLines,
    ...acceptedFindingLines,
    "raw_response_bodies=not_recorded",
    "raw_response_headers=not_recorded",
  ].join("\n");
}

function unsupportedOptions(args) {
  const allowedOptions = new Set(["--require-local-match", "--allow-pending", "--help", "-h"]);
  return args.filter((arg) => arg.startsWith("--") && !allowedOptions.has(arg));
}

function usage() {
  return [
    "Usage:",
    "  node scripts/check-live-deployment-integrity.mjs [--require-local-match] [--allow-pending]",
    "",
    "Validates live status-manifest hash consistency without printing response bodies or headers.",
  ].join("\n");
}

async function runCli() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage());
    return;
  }
  const invalidOptions = unsupportedOptions(args);
  if (invalidOptions.length > 0) {
    console.log(`verdict=GovernanceBlocked\nproof_state=Fail\nerror=unsupported_args:${invalidOptions.join(",")}`);
    process.exit(1);
    return;
  }
  const requireLocalMatch = args.includes("--require-local-match");

  try {
    const evidence = await collectLiveEvidence();
    const result = evaluateDeploymentIntegrityEvidence(evidence);
    console.log(formatResult(result));
    if (result.proofState === "Fail" || (requireLocalMatch && result.localStatusManifestMatch !== "Pass")) {
      process.exit(1);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`verdict=AwaitingEvidence\nproof_state=Unknown\nlive_deployment_integrity_state=AwaitingEvidence\nerror=${message}\nraw_response_bodies=not_recorded\nraw_response_headers=not_recorded`);
    if (!args.includes("--allow-pending")) process.exit(1);
  }
}

export { governedHashPaths };

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
