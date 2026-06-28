/*
Purpose: classify the live Mullusi website delivery path from response headers.
Governance scope: deployment evidence, GitHub Pages fallback detection, and Cloudflare origin verification.
Dependencies: Node.js standard library HTTPS client and public response headers.
Invariants: classification is deterministic, evidence-backed, and exits nonzero on blocked or unknown origin states unless --allow-pending is set.
Test contract: run node scripts/test-check-website-origin.mjs.
*/

import https from "node:https";
import { pathToFileURL } from "node:url";

const defaultTargets = [
  "https://mullusi.com/",
  "https://www.mullusi.com/",
  "https://www.mullusi.com/proof/?gate=www-canonical",
  "https://mullusi.com/assets/app.js",
  "https://mullusi.com/data/site.json",
  "https://mullusi.com/.well-known/security.txt",
];
const githubOriginHeaders = ["x-github-request-id", "x-fastly-request-id", "x-served-by"];
const cloudflareEdgeHeaders = ["cf-ray", "cf-cache-status"];
const allowedTargetHostnames = new Set(["mullusi.com", "www.mullusi.com"]);
const allowedWwwTargetUrls = new Set([
  "https://www.mullusi.com/",
  "https://www.mullusi.com/proof/?gate=www-canonical",
]);

function normalizeHeaderValue(value) {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  return value ?? "";
}

function normalizedHeaders(headers) {
  const normalized = {};
  for (const [key, value] of Object.entries(headers)) {
    normalized[key.toLowerCase()] = normalizeHeaderValue(value);
  }
  return normalized;
}

function unsupportedOptions(args) {
  const allowedOptions = new Set(["--allow-pending", "--json"]);
  return args.filter((arg) => arg.startsWith("--") && !allowedOptions.has(arg));
}

function printCliFailure({ verdict, proofState, error, jsonOutput }) {
  if (jsonOutput) {
    console.log(JSON.stringify([{ verdict, proof_state: proofState, error }], null, 2));
    return;
  }
  console.log(`verdict=${verdict}\nproof_state=${proofState}\nerror=${error}`);
}

function publicMullusiUrlLabel(value) {
  if (!value) {
    return "";
  }
  try {
    const parsedUrl = new URL(value);
    const hasPrivateQueryKey = Array.from(parsedUrl.searchParams.keys()).some((key) => /token|secret|key|auth|account|credential|password/i.test(key));
    if (parsedUrl.protocol === "https:" && allowedTargetHostnames.has(parsedUrl.hostname) && !hasPrivateQueryKey) {
      return parsedUrl.toString();
    }
  } catch {
    return "redacted_url";
  }
  return "redacted_url";
}

function publicHeaderPresenceLabel(value) {
  return value ? "present" : "";
}

export function publicErrorCode(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith("origin_check_")) {
    return message;
  }
  if (message.startsWith("request_timeout:")) {
    return "origin_check_request_timeout";
  }
  if (message.startsWith("target_url_invalid:")) {
    return "origin_check_target_url_invalid";
  }
  if (message.startsWith("target_protocol_invalid:")) {
    return "origin_check_target_protocol_invalid";
  }
  if (message.startsWith("target_host_invalid:")) {
    return "origin_check_target_host_invalid";
  }
  if (message.startsWith("target_www_route_invalid:")) {
    return "origin_check_target_www_route_invalid";
  }
  if (/ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN/.test(message)) {
    return "origin_check_network_unavailable";
  }
  return "origin_check_unavailable";
}

export function validateTargetUrl(targetUrl) {
  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    throw new Error(`target_url_invalid:${targetUrl}`);
  }
  if (parsedUrl.protocol !== "https:") {
    throw new Error(`target_protocol_invalid:${parsedUrl.protocol}`);
  }
  if (!allowedTargetHostnames.has(parsedUrl.hostname)) {
    throw new Error(`target_host_invalid:${parsedUrl.hostname}`);
  }
  if (parsedUrl.hostname === "www.mullusi.com" && !allowedWwwTargetUrls.has(parsedUrl.toString())) {
    throw new Error(`target_www_route_invalid:${parsedUrl.toString()}`);
  }
  return parsedUrl.toString();
}

export function classifyHeaders(headers) {
  const normalized = normalizedHeaders(headers);
  const presentGithubMarkers = githubOriginHeaders.filter((headerName) => normalized[headerName]);
  const presentCloudflareMarkers = cloudflareEdgeHeaders.filter((headerName) => normalized[headerName]);
  const serverHeader = normalized.server ?? "";
  const viaHeader = normalized.via ?? "";
  const cloudflareEdge = /cloudflare/i.test(serverHeader) || presentCloudflareMarkers.length > 0;
  const githubOrigin = presentGithubMarkers.length > 0 || /varnish/i.test(viaHeader);

  if (githubOrigin) {
    return {
      verdict: "GitHubPagesOrigin",
      proofState: "Fail",
      cloudflareEdge,
      githubOrigin,
      markers: [...presentGithubMarkers, viaHeader ? "via" : ""].filter(Boolean),
      summary: "Cloudflare is in front, but GitHub Pages/Fastly still serves the origin.",
    };
  }

  if (cloudflareEdge) {
    return {
      verdict: "CloudflareOriginCandidate",
      proofState: "Pass",
      cloudflareEdge,
      githubOrigin,
      markers: presentCloudflareMarkers,
      summary: "No GitHub Pages origin markers were found in the response headers.",
    };
  }

  return {
    verdict: "UnknownOrigin",
    proofState: "Unknown",
    cloudflareEdge,
    githubOrigin,
    markers: [],
    summary: "Response headers do not identify Cloudflare edge or a known static origin.",
  };
}

export function classifyResponse(response, targetUrl = "") {
  const headerClassification = classifyHeaders(response.headers);
  const statusCode = response.statusCode ?? 0;
  if (statusCode < 200 || statusCode >= 300) {
    return {
      verdict: "UnexpectedStatus",
      proofState: "Fail",
      cloudflareEdge: headerClassification.cloudflareEdge,
      githubOrigin: headerClassification.githubOrigin,
      markers: headerClassification.markers,
      summary: `Response status ${statusCode} is outside the required 2xx publication boundary.`,
    };
  }
  const targetHost = targetUrl ? new URL(targetUrl).hostname : "";
  const target = targetUrl ? new URL(targetUrl) : null;
  const final = response.finalUrl ? new URL(response.finalUrl) : null;
  if (targetHost === "www.mullusi.com" && final?.hostname !== "mullusi.com") {
    return {
      verdict: "CanonicalRedirectPending",
      proofState: "Unknown",
      cloudflareEdge: headerClassification.cloudflareEdge,
      githubOrigin: headerClassification.githubOrigin,
      markers: headerClassification.markers,
      summary: "The www host is reachable but has not redirected to the apex Mullusi host.",
    };
  }
  const redirectHistory = response.redirectHistory ?? [];
  const firstRedirect = redirectHistory[0] ?? null;
  if (targetHost === "www.mullusi.com" && !firstRedirect) {
    return {
      verdict: "CanonicalRedirectHistoryMissing",
      proofState: "Fail",
      cloudflareEdge: headerClassification.cloudflareEdge,
      githubOrigin: headerClassification.githubOrigin,
      markers: headerClassification.markers,
      summary: "The www target reached the apex host without a recorded 301 redirect witness.",
    };
  }
  if (targetHost === "www.mullusi.com" && redirectHistory.length !== 1) {
    return {
      verdict: "CanonicalRedirectChainMismatch",
      proofState: "Fail",
      cloudflareEdge: headerClassification.cloudflareEdge,
      githubOrigin: headerClassification.githubOrigin,
      markers: headerClassification.markers,
      summary: `The www redirect used ${redirectHistory.length} redirect hops instead of the required single 301 hop.`,
    };
  }
  if (targetHost === "www.mullusi.com" && firstRedirect?.statusCode !== 301) {
    return {
      verdict: "CanonicalRedirectStatusMismatch",
      proofState: "Fail",
      cloudflareEdge: headerClassification.cloudflareEdge,
      githubOrigin: headerClassification.githubOrigin,
      markers: headerClassification.markers,
      summary: `The www redirect used status ${firstRedirect?.statusCode ?? "unknown"} instead of required status 301.`,
    };
  }
  const firstRedirectUrl = firstRedirect ? new URL(firstRedirect.to) : null;
  if (targetHost === "www.mullusi.com" && target && firstRedirectUrl && (firstRedirectUrl.hostname !== "mullusi.com" || firstRedirectUrl.pathname !== target.pathname || firstRedirectUrl.search !== target.search)) {
    return {
      verdict: "CanonicalRedirectShapeMismatch",
      proofState: "Fail",
      cloudflareEdge: headerClassification.cloudflareEdge,
      githubOrigin: headerClassification.githubOrigin,
      markers: headerClassification.markers,
      summary: "The www redirect did not point directly to the matching apex host path and query.",
    };
  }
  if (targetHost === "www.mullusi.com" && target && final && (final.pathname !== target.pathname || final.search !== target.search)) {
    return {
      verdict: "CanonicalRedirectShapeMismatch",
      proofState: "Fail",
      cloudflareEdge: headerClassification.cloudflareEdge,
      githubOrigin: headerClassification.githubOrigin,
      markers: headerClassification.markers,
      summary: "The www redirect reached the apex host but did not preserve the request path and query.",
    };
  }
  return headerClassification;
}

function requestHead(url, redirectBudget = 5, redirectHistory = []) {
  return new Promise((resolve, reject) => {
    const request = https.request(url, { method: "HEAD", headers: { "User-Agent": "mullusi-origin-check/1" } }, (response) => {
      const statusCode = response.statusCode ?? 0;
      const location = normalizeHeaderValue(response.headers.location);
      if (statusCode >= 300 && statusCode < 400 && location && redirectBudget > 0) {
        const redirectedUrl = validateTargetUrl(new URL(location, url).toString());
        const nextRedirectHistory = [
          ...redirectHistory,
          {
            from: url,
            to: redirectedUrl,
            statusCode,
          },
        ];
        response.resume();
        requestHead(redirectedUrl, redirectBudget - 1, nextRedirectHistory).then(resolve, reject);
        return;
      }
      response.resume();
      resolve({
        finalUrl: url,
        statusCode,
        headers: response.headers,
        redirectHistory,
      });
    });
    request.setTimeout(15_000, () => {
      request.destroy(new Error(`request_timeout:${url}`));
    });
    request.on("error", reject);
    request.end();
  });
}

export function formatReport(targetUrl, response, classification) {
  const normalized = normalizedHeaders(response.headers);
  const firstRedirect = response.redirectHistory?.[0] ?? null;
  const evidence = [
    `target=${publicMullusiUrlLabel(targetUrl)}`,
    `final_url=${publicMullusiUrlLabel(response.finalUrl)}`,
    `status=${response.statusCode}`,
    `redirect_count=${response.redirectHistory?.length ?? 0}`,
    `first_redirect_status=${firstRedirect?.statusCode ?? ""}`,
    `first_redirect_url=${publicMullusiUrlLabel(firstRedirect?.to ?? "")}`,
    `server=${publicHeaderPresenceLabel(normalized.server)}`,
    `cf_ray=${publicHeaderPresenceLabel(normalized["cf-ray"])}`,
    `github_request=${publicHeaderPresenceLabel(normalized["x-github-request-id"])}`,
    `fastly_request=${publicHeaderPresenceLabel(normalized["x-fastly-request-id"])}`,
    `served_by=${publicHeaderPresenceLabel(normalized["x-served-by"])}`,
    `via=${publicHeaderPresenceLabel(normalized.via)}`,
  ];
  return [
    `verdict=${classification.verdict}`,
    `proof_state=${classification.proofState}`,
    `summary=${classification.summary}`,
    ...evidence,
  ].join("\n");
}

export function witnessRecord(targetUrl, response, classification) {
  const normalized = normalizedHeaders(response.headers);
  const firstRedirect = response.redirectHistory?.[0] ?? null;
  return {
    verdict: classification.verdict,
    proof_state: classification.proofState,
    summary: classification.summary,
    target: publicMullusiUrlLabel(targetUrl),
    final_url: publicMullusiUrlLabel(response.finalUrl),
    status: response.statusCode,
    redirect_count: response.redirectHistory?.length ?? 0,
    first_redirect_status: firstRedirect?.statusCode ?? "",
    first_redirect_url: publicMullusiUrlLabel(firstRedirect?.to ?? ""),
    server: publicHeaderPresenceLabel(normalized.server),
    cf_ray: publicHeaderPresenceLabel(normalized["cf-ray"]),
    github_request: publicHeaderPresenceLabel(normalized["x-github-request-id"]),
    fastly_request: publicHeaderPresenceLabel(normalized["x-fastly-request-id"]),
    served_by: publicHeaderPresenceLabel(normalized["x-served-by"]),
    via: publicHeaderPresenceLabel(normalized.via),
  };
}

async function runCli() {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes("--json");
  const invalidOptions = unsupportedOptions(args);
  if (invalidOptions.length > 0) {
    printCliFailure({
      verdict: "UnsupportedArgument",
      proofState: "Fail",
      error: `unsupported_args_count:${invalidOptions.length}`,
      jsonOutput,
    });
    process.exit(1);
    return;
  }
  const allowPending = args.includes("--allow-pending");
  const targets = args.filter((arg) => !arg.startsWith("--"));
  let targetUrls;
  try {
    targetUrls = (targets.length > 0 ? targets : defaultTargets).map(validateTargetUrl);
  } catch (error) {
    printCliFailure({ verdict: "TargetRejected", proofState: "Fail", error: publicErrorCode(error), jsonOutput });
    if (!allowPending) {
      process.exit(1);
    }
    return;
  }
  const results = [];

  for (const targetUrl of targetUrls) {
    try {
      const response = await requestHead(targetUrl);
      const classification = classifyResponse(response, targetUrl);
      results.push({ targetUrl, response, classification });
    } catch (error) {
      results.push({
        targetUrl,
        error: publicErrorCode(error),
        classification: {
          verdict: "OriginCheckError",
          proofState: "Fail",
          cloudflareEdge: false,
          githubOrigin: false,
          markers: [],
          summary: "Header request failed before origin classification completed.",
        },
      });
    }
  }

  if (jsonOutput) {
    console.log(
      JSON.stringify(
        results.map((result) => {
          if (result.error) {
            return {
              verdict: result.classification.verdict,
              proof_state: result.classification.proofState,
              target: publicMullusiUrlLabel(result.targetUrl),
              error: result.error,
            };
          }
          return witnessRecord(result.targetUrl, result.response, result.classification);
        }),
        null,
        2,
      ),
    );
  } else {
    console.log(
      results
        .map((result) => {
          if (result.error) {
            return [`verdict=${result.classification.verdict}`, `proof_state=${result.classification.proofState}`, `target=${publicMullusiUrlLabel(result.targetUrl)}`, `error=${result.error}`].join("\n");
          }
          return formatReport(result.targetUrl, result.response, result.classification);
        })
        .join("\n\n"),
    );
  }

  const blocked = results.some((result) => result.classification.verdict !== "CloudflareOriginCandidate");
  if (blocked && !allowPending) {
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
