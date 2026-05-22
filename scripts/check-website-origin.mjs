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
  "https://mullusi.com/assets/app.js",
  "https://mullusi.com/data/site.json",
  "https://mullusi.com/.well-known/security.txt",
];
const githubOriginHeaders = ["x-github-request-id", "x-fastly-request-id", "x-served-by"];
const cloudflareEdgeHeaders = ["cf-ray", "cf-cache-status"];
const allowedTargetHostnames = new Set(["mullusi.com"]);

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

export function classifyResponse(response) {
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
  return headerClassification;
}

function requestHead(url, redirectBudget = 5) {
  return new Promise((resolve, reject) => {
    const request = https.request(url, { method: "HEAD", headers: { "User-Agent": "mullusi-origin-check/1" } }, (response) => {
      const statusCode = response.statusCode ?? 0;
      const location = normalizeHeaderValue(response.headers.location);
      if (statusCode >= 300 && statusCode < 400 && location && redirectBudget > 0) {
        const redirectedUrl = new URL(location, url).toString();
        response.resume();
        requestHead(redirectedUrl, redirectBudget - 1).then(resolve, reject);
        return;
      }
      response.resume();
      resolve({
        finalUrl: url,
        statusCode,
        headers: response.headers,
      });
    });
    request.setTimeout(15_000, () => {
      request.destroy(new Error(`request_timeout:${url}`));
    });
    request.on("error", reject);
    request.end();
  });
}

function formatReport(targetUrl, response, classification) {
  const normalized = normalizedHeaders(response.headers);
  const evidence = [
    `target=${targetUrl}`,
    `final_url=${response.finalUrl}`,
    `status=${response.statusCode}`,
    `server=${normalized.server ?? ""}`,
    `cf_ray=${normalized["cf-ray"] ?? ""}`,
    `github_request=${normalized["x-github-request-id"] ?? ""}`,
    `fastly_request=${normalized["x-fastly-request-id"] ?? ""}`,
    `served_by=${normalized["x-served-by"] ?? ""}`,
    `via=${normalized.via ?? ""}`,
  ];
  return [
    `verdict=${classification.verdict}`,
    `proof_state=${classification.proofState}`,
    `summary=${classification.summary}`,
    ...evidence,
  ].join("\n");
}

function witnessRecord(targetUrl, response, classification) {
  const normalized = normalizedHeaders(response.headers);
  return {
    verdict: classification.verdict,
    proof_state: classification.proofState,
    summary: classification.summary,
    target: targetUrl,
    final_url: response.finalUrl,
    status: response.statusCode,
    server: normalized.server ?? "",
    cf_ray: normalized["cf-ray"] ?? "",
    github_request: normalized["x-github-request-id"] ?? "",
    fastly_request: normalized["x-fastly-request-id"] ?? "",
    served_by: normalized["x-served-by"] ?? "",
    via: normalized.via ?? "",
  };
}

async function runCli() {
  const args = process.argv.slice(2);
  const allowPending = args.includes("--allow-pending");
  const jsonOutput = args.includes("--json");
  const targets = args.filter((arg) => !arg.startsWith("--"));
  let targetUrls;
  try {
    targetUrls = (targets.length > 0 ? targets : defaultTargets).map(validateTargetUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (jsonOutput) {
      console.log(JSON.stringify([{ verdict: "TargetRejected", proof_state: "Fail", error: message }], null, 2));
    } else {
      console.log(`verdict=TargetRejected\nproof_state=Fail\nerror=${message}`);
    }
    if (!allowPending) {
      process.exit(1);
    }
    return;
  }
  const results = [];

  for (const targetUrl of targetUrls) {
    try {
      const response = await requestHead(targetUrl);
      const classification = classifyResponse(response);
      results.push({ targetUrl, response, classification });
    } catch (error) {
      results.push({
        targetUrl,
        error: error instanceof Error ? error.message : String(error),
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
              target: result.targetUrl,
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
            return [`verdict=${result.classification.verdict}`, `proof_state=${result.classification.proofState}`, `target=${result.targetUrl}`, `error=${result.error}`].join("\n");
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
