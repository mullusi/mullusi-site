/*
Purpose: evaluate bounded public visibility for Mullusi website domains.
Governance scope: public DNS resolution, HTTPS reachability, canonical redirect behavior, TLS validation, and global-claim boundary.
Dependencies: Node.js standard library DNS and HTTPS clients, Check-Host API, and Globalping API.
Invariants: checks are public-safe, deterministic after evidence collection, and do not close universal all-user visibility from finite probes.
Test contract: run node scripts/test-check-public-visibility.mjs.
*/

import { Resolver, resolve4, resolve6 } from "node:dns/promises";
import https from "node:https";
import { pathToFileURL } from "node:url";

const dnsTimeoutMs = 8_000;
const httpsTimeoutMs = 15_000;
const checkHostTimeoutMs = 20_000;
const checkHostPollDelayMs = 2_000;
const checkHostPollAttempts = 5;
const externalRegionalProbeFloor = 2;
const checkHostApiBaseUrl = "https://check-host.net";
const globalpingApiBaseUrl = "https://api.globalping.io";
const globalpingPollDelayMs = 2_000;
const globalpingPollAttempts = 6;
const allowedHttpsHostnames = new Set(["mullusi.com", "www.mullusi.com"]);
const defaultDnsHosts = ["mullusi.com", "www.mullusi.com"];
const defaultRoutes = [
  {
    targetUrl: "https://mullusi.com/",
    expectedFinalUrl: "https://mullusi.com/",
    expectedRedirectCount: 0,
    expectedFirstRedirectStatus: "",
  },
  {
    targetUrl: "https://www.mullusi.com/",
    expectedFinalUrl: "https://mullusi.com/",
    expectedRedirectCount: 1,
    expectedFirstRedirectStatus: 301,
  },
];
const publicDnsResolvers = [
  { name: "cloudflare", servers: ["1.1.1.1", "1.0.0.1"], publicResolver: true },
  { name: "google", servers: ["8.8.8.8", "8.8.4.4"], publicResolver: true },
  { name: "quad9", servers: ["9.9.9.9", "149.112.112.112"], publicResolver: true },
  { name: "system", servers: [], publicResolver: false },
];
const checkHostProviderReference = {
  provider: "check-host.net",
  providerApi: "https://check-host.net/about/api?lang=en",
  targetUrl: "https://mullusi.com/",
};
const globalpingProviderReference = {
  provider: "globalping.io",
  providerApi: "https://globalping.io/docs/api.globalping.io",
  targetUrl: "https://mullusi.com/",
};
const globalpingLocations = [
  { magic: "Europe", limit: 1 },
  { magic: "North America", limit: 1 },
];

function normalizedHeaderValue(value) {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  return value ?? "";
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function withTimeout(promise, label, timeoutMs) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`timeout:${label}`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function requestJson(targetUrl, { method = "GET", body = null, timeoutMs = checkHostTimeoutMs } = {}) {
  return new Promise((resolve, reject) => {
    const headers = { Accept: "application/json", "User-Agent": "mullusi-public-visibility-check/1" };
    if (body !== null) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(body);
    }
    const request = https.request(targetUrl, { method, headers }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => {
        chunks.push(chunk);
      });
      response.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        if ((response.statusCode ?? 0) < 200 || (response.statusCode ?? 0) >= 300) {
          reject(new Error(`json_status_invalid:${response.statusCode ?? 0}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error("json_parse_failed"));
        }
      });
    });
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`request_timeout:${targetUrl}`));
    });
    request.on("error", reject);
    if (body !== null) {
      request.write(body);
    }
    request.end();
  });
}

function isDnsNoRecord(error) {
  return ["ENODATA", "ENOTFOUND", "ENODOMAIN", "ENOTIMP"].includes(error?.code);
}

async function resolveFamily({ resolverName, servers, hostname, family }) {
  try {
    if (resolverName === "system") {
      const resolver = family === "A" ? resolve4 : resolve6;
      return await withTimeout(resolver(hostname), `${resolverName}:${hostname}:${family}`, dnsTimeoutMs);
    }
    const resolver = new Resolver();
    resolver.setServers(servers);
    const familyResolver = family === "A" ? resolver.resolve4.bind(resolver) : resolver.resolve6.bind(resolver);
    return await withTimeout(familyResolver(hostname), `${resolverName}:${hostname}:${family}`, dnsTimeoutMs);
  } catch (error) {
    if (isDnsNoRecord(error)) {
      return [];
    }
    throw error;
  }
}

export async function resolveDnsHost({ hostname, resolverConfig }) {
  const [aResult, aaaaResult] = await Promise.allSettled([
    resolveFamily({ resolverName: resolverConfig.name, servers: resolverConfig.servers, hostname, family: "A" }),
    resolveFamily({ resolverName: resolverConfig.name, servers: resolverConfig.servers, hostname, family: "AAAA" }),
  ]);
  const errors = [];
  if (aResult.status === "rejected") {
    errors.push(`A:${aResult.reason instanceof Error ? aResult.reason.message : String(aResult.reason)}`);
  }
  if (aaaaResult.status === "rejected") {
    errors.push(`AAAA:${aaaaResult.reason instanceof Error ? aaaaResult.reason.message : String(aaaaResult.reason)}`);
  }
  return {
    host: hostname,
    resolver: resolverConfig.name,
    publicResolver: resolverConfig.publicResolver,
    a: aResult.status === "fulfilled" ? aResult.value : [],
    aaaa: aaaaResult.status === "fulfilled" ? aaaaResult.value : [],
    error: errors.join("|"),
  };
}

export function validateHttpsTarget(targetUrl) {
  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    throw new Error(`target_url_invalid:${targetUrl}`);
  }
  if (parsedUrl.protocol !== "https:") {
    throw new Error(`target_protocol_invalid:${parsedUrl.protocol}`);
  }
  if (!allowedHttpsHostnames.has(parsedUrl.hostname)) {
    throw new Error(`target_host_invalid:${parsedUrl.hostname}`);
  }
  return parsedUrl.toString();
}

function requestHead(targetUrl, redirectBudget = 5, redirectHistory = []) {
  const safeUrl = validateHttpsTarget(targetUrl);
  return new Promise((resolve, reject) => {
    const request = https.request(safeUrl, { method: "HEAD", headers: { "User-Agent": "mullusi-public-visibility-check/1" } }, (response) => {
      const statusCode = response.statusCode ?? 0;
      const location = normalizedHeaderValue(response.headers.location);
      if (statusCode >= 300 && statusCode < 400 && location && redirectBudget > 0) {
        const redirectedUrl = validateHttpsTarget(new URL(location, safeUrl).toString());
        response.resume();
        requestHead(redirectedUrl, redirectBudget - 1, [
          ...redirectHistory,
          { from: safeUrl, to: redirectedUrl, statusCode },
        ]).then(resolve, reject);
        return;
      }
      const socket = response.socket;
      response.resume();
      resolve({
        targetUrl,
        finalUrl: safeUrl,
        statusCode,
        redirectHistory,
        tlsAuthorized: socket?.authorized === true,
        tlsAuthorizationError: socket?.authorizationError ? String(socket.authorizationError) : "",
      });
    });
    request.setTimeout(httpsTimeoutMs, () => {
      request.destroy(new Error(`request_timeout:${safeUrl}`));
    });
    request.on("error", reject);
    request.end();
  });
}

function parseCheckHostResult(rawResult) {
  if (rawResult === null || rawResult === undefined) {
    return {
      passed: false,
      pending: true,
      elapsedSeconds: "",
      message: "pending",
      statusCode: "",
      resolvedIp: "",
      error: "pending",
    };
  }
  if (!Array.isArray(rawResult)) {
    return {
      passed: false,
      pending: false,
      elapsedSeconds: "",
      message: rawResult?.message ?? "unknown_result",
      statusCode: "",
      resolvedIp: "",
      error: rawResult?.message ?? "unknown_result",
    };
  }
  for (const item of rawResult) {
    if (Array.isArray(item) && typeof item[0] === "number") {
      const statusCode = String(item[3] ?? "");
      return {
        passed: item[0] === 1 && /^2\d\d$/.test(statusCode),
        pending: false,
        elapsedSeconds: item[1] ?? "",
        message: item[2] ?? "",
        statusCode,
        resolvedIp: item[4] ?? "",
        error: item[0] === 1 ? "" : item[2] ?? "http_probe_failed",
      };
    }
    if (item && typeof item === "object" && !Array.isArray(item)) {
      return {
        passed: false,
        pending: false,
        elapsedSeconds: "",
        message: item.message ?? "http_probe_failed",
        statusCode: "",
        resolvedIp: "",
        error: item.message ?? "http_probe_failed",
      };
    }
  }
  return {
    passed: false,
    pending: false,
    elapsedSeconds: "",
    message: "result_shape_unknown",
    statusCode: "",
    resolvedIp: "",
    error: "result_shape_unknown",
  };
}

export function publicErrorCode(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith("public_visibility_")) {
    return message;
  }
  if (message.startsWith("request_timeout:") || message.startsWith("timeout:")) {
    return "public_visibility_request_timeout";
  }
  if (message.startsWith("target_url_invalid:")) {
    return "public_visibility_target_url_invalid";
  }
  if (message.startsWith("target_protocol_invalid:")) {
    return "public_visibility_target_protocol_invalid";
  }
  if (message.startsWith("target_host_invalid:")) {
    return "public_visibility_target_host_invalid";
  }
  if (message.startsWith("json_status_invalid:")) {
    return "public_visibility_json_status_invalid";
  }
  if (message.startsWith("json_parse_failed")) {
    return "public_visibility_json_parse_failed";
  }
  if (message.startsWith("check_host_start_failed:")) {
    return "public_visibility_check_host_start_failed";
  }
  if (message.startsWith("globalping_start_failed:")) {
    return "public_visibility_globalping_start_failed";
  }
  if (/ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN/.test(message)) {
    return "public_visibility_network_unavailable";
  }
  if (error instanceof SyntaxError || /Invalid URL/.test(message)) {
    return "public_visibility_url_invalid";
  }
  return "public_visibility_unavailable";
}

export async function collectCheckHostEvidence({ targetUrl = "https://mullusi.com/", maxNodes = 6 } = {}) {
  const safeTargetUrl = validateHttpsTarget(targetUrl);
  const startUrl = `${checkHostApiBaseUrl}/check-http?host=${encodeURIComponent(safeTargetUrl)}&max_nodes=${encodeURIComponent(String(maxNodes))}`;
  const startResponse = await requestJson(startUrl);
  if (startResponse?.ok !== 1 || !startResponse?.request_id) {
    throw new Error(`check_host_start_failed:${JSON.stringify(startResponse)}`);
  }

  let resultResponse = {};
  for (let attempt = 0; attempt < checkHostPollAttempts; attempt += 1) {
    if (attempt > 0) {
      await delay(checkHostPollDelayMs);
    }
    resultResponse = await requestJson(`${checkHostApiBaseUrl}/check-result/${encodeURIComponent(startResponse.request_id)}`);
    const nodeNames = Object.keys(startResponse.nodes ?? {});
    if (nodeNames.length > 0 && nodeNames.every((nodeName) => resultResponse[nodeName] !== null && resultResponse[nodeName] !== undefined)) {
      break;
    }
  }

  return {
    provider: checkHostProviderReference.provider,
    providerApi: checkHostProviderReference.providerApi,
    targetUrl: safeTargetUrl,
    requestId: startResponse.request_id,
    permanentLink: startResponse.permanent_link ?? "",
    maxNodes,
    records: Object.entries(startResponse.nodes ?? {}).map(([nodeName, location]) => {
      const parsed = parseCheckHostResult(resultResponse[nodeName]);
      return {
        provider: checkHostProviderReference.provider,
        node: nodeName,
        countryCode: location?.[0] ?? "",
        country: location?.[1] ?? "",
        city: location?.[2] ?? "",
        nodeIp: location?.[3] ?? "",
        asn: location?.[4] ?? "",
        ...parsed,
      };
    }),
  };
}

function globalpingRequestBody(safeTargetUrl) {
  const parsedUrl = new URL(safeTargetUrl);
  const requestPath = `${parsedUrl.pathname || "/"}${parsedUrl.search}`;
  return JSON.stringify({
    type: "http",
    target: parsedUrl.hostname,
    locations: globalpingLocations,
    measurementOptions: {
      protocol: "HTTPS",
      port: 443,
      request: {
        method: "GET",
        path: requestPath,
        headers: {
          "User-Agent": "mullusi-public-visibility-check/1",
        },
      },
    },
  });
}

function parseGlobalpingResult(entry, index) {
  const probe = entry?.probe ?? {};
  const result = entry?.result ?? {};
  const statusCode = String(result.statusCode ?? "");
  const tlsAuthorized = result.tls?.authorized !== false;
  const passed = result.status === "finished" && /^2\d\d$/.test(statusCode) && tlsAuthorized;
  const elapsedMs = Number(result.timings?.total);
  return {
    provider: globalpingProviderReference.provider,
    node: `globalping:${probe.country ?? "unknown"}:${probe.city ?? index}`,
    countryCode: String(probe.country ?? "").toLowerCase(),
    country: probe.country ?? "",
    city: probe.city ?? "",
    nodeIp: "",
    asn: probe.asn === undefined || probe.asn === null ? "" : `AS${probe.asn}`,
    passed,
    pending: result.status === "in-progress",
    elapsedSeconds: Number.isFinite(elapsedMs) ? String(elapsedMs / 1000) : "",
    message: result.statusCodeName ?? result.status ?? "",
    statusCode,
    resolvedIp: result.resolvedAddress ?? "",
    error: passed ? "" : result.rawOutput ?? result.error ?? result.status ?? "globalping_probe_failed",
  };
}

export async function collectGlobalpingEvidence({ targetUrl = "https://mullusi.com/" } = {}) {
  const safeTargetUrl = validateHttpsTarget(targetUrl);
  const startResponse = await requestJson(`${globalpingApiBaseUrl}/v1/measurements`, {
    method: "POST",
    body: globalpingRequestBody(safeTargetUrl),
  });
  if (!startResponse?.id) {
    throw new Error(`globalping_start_failed:${JSON.stringify(startResponse)}`);
  }

  let resultResponse = {};
  for (let attempt = 0; attempt < globalpingPollAttempts; attempt += 1) {
    if (attempt > 0) {
      await delay(globalpingPollDelayMs);
    }
    resultResponse = await requestJson(`${globalpingApiBaseUrl}/v1/measurements/${encodeURIComponent(startResponse.id)}`);
    if (resultResponse.status && resultResponse.status !== "in-progress") {
      break;
    }
  }

  return {
    provider: globalpingProviderReference.provider,
    providerApi: globalpingProviderReference.providerApi,
    targetUrl: safeTargetUrl,
    requestId: startResponse.id,
    permanentLink: `https://globalping.io?measurement=${encodeURIComponent(startResponse.id)}`,
    maxNodes: startResponse.probesCount ?? globalpingLocations.length,
    records: (resultResponse.results ?? []).map((entry, index) => parseGlobalpingResult(entry, index)),
  };
}

async function collectLiveEvidence({ includeCheckHost = false, includeGlobalping = false, checkHostMaxNodes = 6 } = {}) {
  const dnsRecords = [];
  for (const host of defaultDnsHosts) {
    for (const resolverConfig of publicDnsResolvers) {
      dnsRecords.push(await resolveDnsHost({ hostname: host, resolverConfig }));
    }
  }

  const routeRecords = [];
  for (const route of defaultRoutes) {
    try {
      routeRecords.push({
        ...route,
        response: await requestHead(route.targetUrl),
        error: "",
      });
    } catch (error) {
      routeRecords.push({
        ...route,
        response: null,
        error: publicErrorCode(error),
      });
    }
  }

  let externalProbeProvider = null;
  let externalProbeRecords = [];
  let externalProbeError = "";
  if (includeCheckHost) {
    try {
      externalProbeProvider = await collectCheckHostEvidence({ maxNodes: checkHostMaxNodes });
      externalProbeRecords = externalProbeProvider.records;
    } catch (error) {
      externalProbeError = publicErrorCode(error);
      externalProbeProvider = {
        ...checkHostProviderReference,
        requestId: "",
        permanentLink: "",
        maxNodes: checkHostMaxNodes,
        error: externalProbeError,
      };
    }
  }
  if (includeGlobalping) {
    try {
      externalProbeProvider = await collectGlobalpingEvidence();
      externalProbeRecords = externalProbeProvider.records;
      externalProbeError = "";
    } catch (error) {
      externalProbeError = publicErrorCode(error);
      externalProbeProvider = {
        ...globalpingProviderReference,
        requestId: "",
        permanentLink: "",
        maxNodes: globalpingLocations.length,
        error: externalProbeError,
      };
      externalProbeRecords = [];
    }
  }

  return {
    dnsHosts: defaultDnsHosts,
    minPublicDnsResolverPasses: 2,
    dnsRecords,
    routeRecords,
    externalRegionalProbeFloor,
    externalProbeProvider,
    externalProbeRecords,
    externalProbeError,
  };
}

export function evaluatePublicVisibilityEvidence(evidence) {
  const findings = [];
  const externalFindings = [];
  const dnsRecords = evidence.dnsRecords ?? [];
  const routeRecords = evidence.routeRecords ?? [];
  const externalProbeRecords = evidence.externalProbeRecords ?? evidence.externalMultiRegionEvidence ?? [];
  const externalProbeError = evidence.externalProbeError ?? evidence.externalProbeProvider?.error ?? "";
  const dnsHosts = evidence.dnsHosts ?? defaultDnsHosts;
  const minPublicDnsResolverPasses = evidence.minPublicDnsResolverPasses ?? 2;
  const regionalProbeFloor = evidence.externalRegionalProbeFloor ?? externalRegionalProbeFloor;

  for (const host of dnsHosts) {
    const hostRecords = dnsRecords.filter((record) => record.host === host);
    const publicResolverPassCount = hostRecords.filter((record) => record.publicResolver && record.error === "" && record.a.length > 0).length;
    if (publicResolverPassCount < minPublicDnsResolverPasses) {
      findings.push(`dns_public_resolver_passes_below_floor:${host}:${publicResolverPassCount}/${minPublicDnsResolverPasses}`);
    }
    for (const record of hostRecords) {
      if (record.publicResolver && record.error) {
        findings.push(`dns_public_resolver_error:${host}:${record.resolver}:${record.error}`);
      }
    }
  }

  for (const route of routeRecords) {
    if (route.error) {
      findings.push(`https_route_error:${route.targetUrl}:${route.error}`);
      continue;
    }
    const response = route.response;
    const statusCode = response?.statusCode ?? 0;
    const redirectHistory = response?.redirectHistory ?? [];
    const firstRedirect = redirectHistory[0] ?? null;
    if (statusCode < 200 || statusCode >= 300) {
      findings.push(`https_status_invalid:${route.targetUrl}:${statusCode}`);
    }
    if (response?.finalUrl !== route.expectedFinalUrl) {
      findings.push(`https_final_url_mismatch:${route.targetUrl}:${response?.finalUrl ?? ""}`);
    }
    if (redirectHistory.length !== route.expectedRedirectCount) {
      findings.push(`https_redirect_count_mismatch:${route.targetUrl}:${redirectHistory.length}/${route.expectedRedirectCount}`);
    }
    if ((firstRedirect?.statusCode ?? "") !== route.expectedFirstRedirectStatus) {
      findings.push(`https_first_redirect_status_mismatch:${route.targetUrl}:${firstRedirect?.statusCode ?? ""}/${route.expectedFirstRedirectStatus}`);
    }
    if (response?.tlsAuthorized !== true) {
      findings.push(`https_tls_not_authorized:${route.targetUrl}:${response?.tlsAuthorizationError ?? ""}`);
    }
  }

  const publicResolverPasses = dnsRecords.filter((record) => record.publicResolver && record.error === "" && record.a.length > 0).length;
  const externalPassRecords = externalProbeRecords.filter((record) => record.passed);
  const externalPassRegions = new Set(externalPassRecords.map((record) => record.countryCode || record.country || record.node));
  if (externalProbeRecords.length === 0 && externalProbeError) {
    externalFindings.push(`external_probe_provider_error:${externalProbeError}`);
  } else if (externalProbeRecords.length === 0) {
    externalFindings.push("external_probe_not_attached");
  } else {
    if (externalPassRegions.size < regionalProbeFloor) {
      externalFindings.push(`external_regional_passes_below_floor:${externalPassRegions.size}/${regionalProbeFloor}`);
    }
    for (const record of externalProbeRecords) {
      if (!record.passed) {
        externalFindings.push(`external_probe_failed:${record.node}:${record.countryCode}:${record.statusCode || record.error || "unknown"}`);
      }
    }
  }
  const externalMultiRegionVisibility = externalProbeRecords.length === 0
    ? "AwaitingEvidence"
    : externalPassRegions.size >= regionalProbeFloor && externalFindings.length === 0
      ? "SolvedVerified"
      : externalPassRegions.size >= regionalProbeFloor
        ? "SolvedUnverified"
        : "GovernanceBlocked";
  return {
    verdict: findings.length === 0 ? "SolvedVerified" : "GovernanceBlocked",
    proofState: findings.length === 0 ? "Pass" : "Fail",
    publicEdgeVisibility: findings.length === 0 ? "SolvedVerified" : "GovernanceBlocked",
    externalMultiRegionVisibility,
    globalAllUsersClaim: "AwaitingEvidence",
    dnsHostCount: dnsHosts.length,
    dnsPublicResolverPasses: publicResolverPasses,
    httpsRouteCount: routeRecords.length,
    externalRegionalProbeFloor: regionalProbeFloor,
    externalProbeCount: externalProbeRecords.length,
    externalDistinctRegionPasses: externalPassRegions.size,
    externalProbeError,
    findings,
    externalFindings,
  };
}

export function formatResult(result, evidence) {
  const findingLines = result.findings.length > 0
    ? result.findings.map((finding) => `finding=${finding}`)
    : ["finding=none"];
  const externalFindingLines = result.externalFindings.length > 0
    ? result.externalFindings.map((finding) => `external_finding=${finding}`)
    : ["external_finding=none"];
  const dnsLines = (evidence.dnsRecords ?? []).flatMap((record) => [
    `dns_host=${record.host}`,
    `dns_resolver=${record.resolver}`,
    `dns_public_resolver=${record.publicResolver ? "true" : "false"}`,
    `dns_a=${record.a.join(",")}`,
    `dns_aaaa=${record.aaaa.join(",")}`,
    `dns_error=${record.error}`,
  ]);
  const routeLines = (evidence.routeRecords ?? []).flatMap((route) => {
    const response = route.response ?? {};
    const redirectHistory = response.redirectHistory ?? [];
    const firstRedirect = redirectHistory[0] ?? null;
    return [
      `target=${route.targetUrl}`,
      `expected_final_url=${route.expectedFinalUrl}`,
      `final_url=${response.finalUrl ?? ""}`,
      `status=${response.statusCode ?? ""}`,
      `redirect_count=${redirectHistory.length}`,
      `expected_redirect_count=${route.expectedRedirectCount}`,
      `first_redirect_status=${firstRedirect?.statusCode ?? ""}`,
      `expected_first_redirect_status=${route.expectedFirstRedirectStatus}`,
      `tls_authorized=${response.tlsAuthorized === true ? "true" : "false"}`,
      `route_error=${route.error ?? ""}`,
    ];
  });
  const provider = evidence.externalProbeProvider;
  const externalProviderLines = provider ? [
    `external_probe_provider=${provider.provider}`,
    `external_probe_api=${provider.providerApi}`,
    `external_probe_target=${provider.targetUrl}`,
    `external_probe_request_id=${provider.requestId}`,
    `external_probe_permanent_link=${provider.permanentLink}`,
    `external_probe_max_nodes=${provider.maxNodes}`,
    `external_probe_error=${provider.error ?? ""}`,
  ] : [
    "external_probe_provider=",
    "external_probe_api=",
    "external_probe_target=",
    "external_probe_request_id=",
    "external_probe_permanent_link=",
    "external_probe_max_nodes=",
    "external_probe_error=",
  ];
  const externalProbeLines = (evidence.externalProbeRecords ?? []).flatMap((record) => [
    `external_node=${record.node}`,
    `external_country_code=${record.countryCode}`,
    `external_country=${record.country}`,
    `external_city=${record.city}`,
    `external_asn=${record.asn}`,
    `external_passed=${record.passed ? "true" : "false"}`,
    `external_pending=${record.pending ? "true" : "false"}`,
    `external_status=${record.statusCode}`,
    `external_message=${record.message}`,
    `external_elapsed_seconds=${record.elapsedSeconds}`,
    `external_resolved_ip=${record.resolvedIp}`,
    `external_error=${record.error}`,
  ]);
  return [
    `verdict=${result.verdict}`,
    `proof_state=${result.proofState}`,
    `public_edge_visibility=${result.publicEdgeVisibility}`,
    `external_multi_region_visibility=${result.externalMultiRegionVisibility}`,
    `global_all_users_claim=${result.globalAllUsersClaim}`,
    `dns_host_count=${result.dnsHostCount}`,
    `dns_public_resolver_passes=${result.dnsPublicResolverPasses}`,
    `https_route_count=${result.httpsRouteCount}`,
    `external_regional_probe_floor=${result.externalRegionalProbeFloor}`,
    `external_probe_count=${result.externalProbeCount}`,
    `external_distinct_region_passes=${result.externalDistinctRegionPasses}`,
    ...findingLines,
    ...externalFindingLines,
    ...dnsLines,
    ...routeLines,
    ...externalProviderLines,
    ...externalProbeLines,
  ].join("\n");
}

function unsupportedOptions(args) {
  const allowedOptions = new Set(["--allow-pending", "--json", "--external-check-host", "--external-globalping"]);
  return args.filter((arg) => arg.startsWith("--") && !allowedOptions.has(arg) && !arg.startsWith("--check-host-max-nodes="));
}

async function runCli() {
  const args = process.argv.slice(2);
  const allowPending = args.includes("--allow-pending");
  const jsonOutput = args.includes("--json");
  const includeCheckHost = args.includes("--external-check-host");
  const includeGlobalping = args.includes("--external-globalping");
  const checkHostMaxNodesArg = args.find((arg) => arg.startsWith("--check-host-max-nodes="))?.split("=")?.[1] ?? "6";
  const checkHostMaxNodes = Number.parseInt(checkHostMaxNodesArg, 10);
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
  if (includeCheckHost && includeGlobalping) {
    const error = "external_provider_conflict:choose_one_provider";
    if (jsonOutput) {
      console.log(JSON.stringify({ verdict: "GovernanceBlocked", proof_state: "Fail", error }, null, 2));
    } else {
      console.log(`verdict=GovernanceBlocked\nproof_state=Fail\nerror=${error}`);
    }
    process.exit(1);
    return;
  }
  if (!Number.isInteger(checkHostMaxNodes) || checkHostMaxNodes < 1 || checkHostMaxNodes > 20) {
    const error = "check_host_max_nodes_invalid";
    if (jsonOutput) {
      console.log(JSON.stringify({ verdict: "GovernanceBlocked", proof_state: "Fail", error }, null, 2));
    } else {
      console.log(`verdict=GovernanceBlocked\nproof_state=Fail\nerror=${error}`);
    }
    process.exit(1);
    return;
  }

  try {
    const evidence = await collectLiveEvidence({ includeCheckHost, includeGlobalping, checkHostMaxNodes });
    const result = evaluatePublicVisibilityEvidence(evidence);
    if (jsonOutput) {
      console.log(JSON.stringify({
        verdict: result.verdict,
        proof_state: result.proofState,
        public_edge_visibility: result.publicEdgeVisibility,
        external_multi_region_visibility: result.externalMultiRegionVisibility,
        global_all_users_claim: result.globalAllUsersClaim,
        dns_host_count: result.dnsHostCount,
        dns_public_resolver_passes: result.dnsPublicResolverPasses,
        https_route_count: result.httpsRouteCount,
        external_regional_probe_floor: result.externalRegionalProbeFloor,
        external_probe_count: result.externalProbeCount,
        external_distinct_region_passes: result.externalDistinctRegionPasses,
        external_probe_error: result.externalProbeError,
        findings: result.findings,
        external_findings: result.externalFindings,
      }, null, 2));
    } else {
      console.log(formatResult(result, evidence));
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

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
