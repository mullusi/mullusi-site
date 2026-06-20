/*
Purpose: verify bounded public-visibility gate behavior without network access.
Governance scope: DNS resolver floor, HTTPS canonical route checks, TLS authority, and global-claim boundary.
Dependencies: Node.js standard library and scripts/check-public-visibility.mjs.
Invariants: tests use fixed evidence fixtures and fail closed when visibility blocker detection regresses.
*/

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluatePublicVisibilityEvidence,
  formatResult,
  publicErrorCode,
  validateHttpsTarget,
} from "./check-public-visibility.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptsDir, "..");
const visibilityScript = path.join(scriptsDir, "check-public-visibility.mjs");

function dnsRecord(host, resolver, publicResolver = true, a = ["104.21.82.46"], aaaa = ["2606:4700:3032::6815:522e"], error = "") {
  return { host, resolver, publicResolver, a, aaaa, error };
}

function routeRecord(targetUrl, expectedFinalUrl, expectedRedirectCount, expectedFirstRedirectStatus, overrides = {}) {
  return {
    targetUrl,
    expectedFinalUrl,
    expectedRedirectCount,
    expectedFirstRedirectStatus,
    error: "",
    response: {
      targetUrl,
      finalUrl: expectedFinalUrl,
      statusCode: 200,
      redirectHistory: expectedRedirectCount === 0 ? [] : [{ from: targetUrl, to: expectedFinalUrl, statusCode: expectedFirstRedirectStatus }],
      tlsAuthorized: true,
      tlsAuthorizationError: "",
      ...overrides,
    },
  };
}

function passingEvidence() {
  return {
    dnsHosts: ["mullusi.com", "www.mullusi.com"],
    minPublicDnsResolverPasses: 2,
    externalRegionalProbeFloor: 2,
    dnsRecords: [
      dnsRecord("mullusi.com", "cloudflare"),
      dnsRecord("mullusi.com", "google"),
      dnsRecord("mullusi.com", "system", false),
      dnsRecord("www.mullusi.com", "cloudflare"),
      dnsRecord("www.mullusi.com", "google"),
      dnsRecord("www.mullusi.com", "system", false),
    ],
    routeRecords: [
      routeRecord("https://mullusi.com/", "https://mullusi.com/", 0, ""),
      routeRecord("https://www.mullusi.com/", "https://mullusi.com/", 1, 301),
    ],
    externalProbeRecords: [],
  };
}

function runVisibilityCli(args) {
  return spawnSync(process.execPath, [visibilityScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function testAllRequiredEvidencePassesWithGlobalBoundary() {
  const evidence = passingEvidence();
  const result = evaluatePublicVisibilityEvidence(evidence);
  const formatted = formatResult(result, evidence);

  assert.equal(result.verdict, "SolvedVerified");
  assert.equal(result.proofState, "Pass");
  assert.equal(result.publicEdgeVisibility, "SolvedVerified");
  assert.equal(result.externalMultiRegionVisibility, "AwaitingEvidence");
  assert.equal(result.globalAllUsersClaim, "AwaitingEvidence");
  assert.equal(result.dnsPublicResolverPasses, 4);
  assert.equal(result.externalDistinctRegionPasses, 0);
  assert.match(formatted, /finding=none/);
  assert.match(formatted, /external_finding=external_probe_not_attached/);
}

function testDnsResolverFloorBlocksVisibilityClaim() {
  const evidence = passingEvidence();
  evidence.dnsRecords = evidence.dnsRecords.filter((record) => !(record.host === "www.mullusi.com" && record.resolver === "google"));
  evidence.dnsRecords = evidence.dnsRecords.map((record) => record.host === "www.mullusi.com" && record.resolver === "cloudflare"
    ? { ...record, a: [], error: "A:timeout:cloudflare:www.mullusi.com:A" }
    : record);
  const result = evaluatePublicVisibilityEvidence(evidence);

  assert.equal(result.verdict, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.publicEdgeVisibility, "GovernanceBlocked");
  assert.ok(result.findings.some((finding) => finding.startsWith("dns_public_resolver_passes_below_floor:www.mullusi.com")));
  assert.ok(result.findings.some((finding) => finding.startsWith("dns_public_resolver_error:www.mullusi.com:cloudflare")));
}

function testWwwRedirectMismatchBlocksVisibilityClaim() {
  const evidence = passingEvidence();
  evidence.routeRecords[1] = routeRecord("https://www.mullusi.com/", "https://mullusi.com/", 1, 301, {
    finalUrl: "https://www.mullusi.com/",
    redirectHistory: [],
  });
  const result = evaluatePublicVisibilityEvidence(evidence);

  assert.equal(result.verdict, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.ok(result.findings.includes("https_final_url_mismatch:https://www.mullusi.com/:https://www.mullusi.com/"));
  assert.ok(result.findings.includes("https_redirect_count_mismatch:https://www.mullusi.com/:0/1"));
  assert.ok(result.findings.includes("https_first_redirect_status_mismatch:https://www.mullusi.com/:/301"));
}

function testTlsFailureBlocksVisibilityClaim() {
  const evidence = passingEvidence();
  evidence.routeRecords[0] = routeRecord("https://mullusi.com/", "https://mullusi.com/", 0, "", {
    tlsAuthorized: false,
    tlsAuthorizationError: "CERT_HAS_EXPIRED",
  });
  const result = evaluatePublicVisibilityEvidence(evidence);

  assert.equal(result.verdict, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.httpsRouteCount, 2);
  assert.ok(result.findings.includes("https_tls_not_authorized:https://mullusi.com/:CERT_HAS_EXPIRED"));
}

function testExternalRegionalProbePassesCloseExternalVisibilityOnly() {
  const evidence = passingEvidence();
  evidence.externalProbeRecords = [
    { node: "us4.node.check-host.net", countryCode: "us", country: "USA", passed: true, statusCode: "200", error: "" },
    { node: "ch2.node.check-host.net", countryCode: "ch", country: "Switzerland", passed: true, statusCode: "200", error: "" },
  ];
  const result = evaluatePublicVisibilityEvidence(evidence);
  const formatted = formatResult(result, evidence);

  assert.equal(result.verdict, "SolvedVerified");
  assert.equal(result.externalMultiRegionVisibility, "SolvedVerified");
  assert.equal(result.globalAllUsersClaim, "AwaitingEvidence");
  assert.equal(result.externalProbeCount, 2);
  assert.equal(result.externalDistinctRegionPasses, 2);
  assert.match(formatted, /external_finding=none/);
}

function testPartialExternalRegionalProbeFailureStaysBounded() {
  const evidence = passingEvidence();
  evidence.externalProbeRecords = [
    { node: "us4.node.check-host.net", countryCode: "us", country: "USA", passed: true, statusCode: "200", error: "" },
    { node: "ch2.node.check-host.net", countryCode: "ch", country: "Switzerland", passed: true, statusCode: "200", error: "" },
    { node: "ir1.node.check-host.net", countryCode: "ir", country: "Iran", passed: false, statusCode: "", error: "Connect timeout" },
  ];
  const result = evaluatePublicVisibilityEvidence(evidence);

  assert.equal(result.verdict, "SolvedVerified");
  assert.equal(result.externalMultiRegionVisibility, "SolvedUnverified");
  assert.equal(result.globalAllUsersClaim, "AwaitingEvidence");
  assert.equal(result.externalDistinctRegionPasses, 2);
  assert.ok(result.externalFindings.includes("external_probe_failed:ir1.node.check-host.net:ir:public_visibility_request_timeout"));
}

function testExternalRegionalProbeFloorBlocksExternalVisibility() {
  const evidence = passingEvidence();
  evidence.externalProbeRecords = [
    { node: "us4.node.check-host.net", countryCode: "us", country: "USA", passed: true, statusCode: "200", error: "" },
    { node: "ir1.node.check-host.net", countryCode: "ir", country: "Iran", passed: false, statusCode: "", error: "Connect timeout" },
  ];
  const result = evaluatePublicVisibilityEvidence(evidence);

  assert.equal(result.verdict, "SolvedVerified");
  assert.equal(result.externalMultiRegionVisibility, "GovernanceBlocked");
  assert.equal(result.externalDistinctRegionPasses, 1);
  assert.ok(result.externalFindings.includes("external_regional_passes_below_floor:1/2"));
  assert.ok(result.externalFindings.includes("external_probe_failed:ir1.node.check-host.net:ir:public_visibility_request_timeout"));
}

function testExternalProviderErrorKeepsBaseVisibilityBounded() {
  const evidence = passingEvidence();
  evidence.externalProbeProvider = {
    provider: "check-host.net",
    providerApi: "https://check-host.net/about/api?lang=en",
    targetUrl: "https://mullusi.com/",
    requestId: "",
    permanentLink: "",
    maxNodes: 6,
    error: "json_status_invalid:429",
  };
  evidence.externalProbeError = "json_status_invalid:429";
  const result = evaluatePublicVisibilityEvidence(evidence);
  const formatted = formatResult(result, evidence);

  assert.equal(result.verdict, "SolvedVerified");
  assert.equal(result.proofState, "Pass");
  assert.equal(result.publicEdgeVisibility, "SolvedVerified");
  assert.equal(result.externalMultiRegionVisibility, "AwaitingEvidence");
  assert.equal(result.globalAllUsersClaim, "AwaitingEvidence");
  assert.equal(result.externalProbeCount, 0);
  assert.ok(result.externalFindings.includes("external_probe_provider_error:public_visibility_json_status_invalid"));
  assert.match(formatted, /external_probe_provider=check-host\.net/);
  assert.match(formatted, /external_probe_error=public_visibility_json_status_invalid/);
}

function testEvaluatorAndFormatterRedactRawEvidenceErrors() {
  const evidence = passingEvidence();
  evidence.dnsRecords[0] = dnsRecord(
    "mullusi.com",
    "cloudflare",
    true,
    [],
    [],
    "A:getaddrinfo ENOTFOUND private.example.internal",
  );
  evidence.routeRecords[0] = routeRecord("https://mullusi.com/", "https://mullusi.com/", 0, "", {
    finalUrl: "https://private.example.internal/path?trace=bounded",
    tlsAuthorized: false,
    tlsAuthorizationError: "private tls detail",
  });
  evidence.routeRecords[0].error = "target_host_invalid:private.example.internal";
  evidence.externalProbeProvider = {
    provider: "check-host.net",
    providerApi: "https://check-host.net/about/api?lang=en",
    targetUrl: "https://mullusi.com/",
    requestId: "",
    permanentLink: "",
    maxNodes: 6,
    error: "getaddrinfo ENOTFOUND private.example.internal",
  };
  evidence.externalProbeError = "getaddrinfo ENOTFOUND private.example.internal";
  evidence.externalProbeRecords = [
    { node: "ir1.node.check-host.net", countryCode: "ir", country: "Iran", passed: false, statusCode: "", error: "getaddrinfo ENOTFOUND private.example.internal" },
  ];
  const result = evaluatePublicVisibilityEvidence(evidence);
  const formatted = formatResult(result, evidence);
  const serialized = `${JSON.stringify(result)}\n${formatted}`;

  assert.equal(result.verdict, "GovernanceBlocked");
  assert.ok(result.findings.includes("https_route_error:https://mullusi.com/:public_visibility_target_host_invalid"));
  assert.ok(result.externalFindings.includes("external_probe_failed:ir1.node.check-host.net:ir:public_visibility_network_unavailable"));
  assert.match(formatted, /dns_error=A:public_visibility_network_unavailable/);
  assert.match(formatted, /route_error=public_visibility_target_host_invalid/);
  assert.match(formatted, /external_error=public_visibility_network_unavailable/);
  assert.doesNotMatch(serialized, /private\.example\.internal|trace=bounded|private tls detail/);
}

function testExternalProbeMetadataRedactsUnsafeValues() {
  const evidence = passingEvidence();
  evidence.externalProbeProvider = {
    provider: "private provider",
    providerApi: "https://private.example.internal/api?trace=bounded",
    targetUrl: "https://private.example.internal/",
    requestId: "private request id",
    permanentLink: "https://private.example.internal/result",
    maxNodes: "six nodes",
    error: "",
  };
  evidence.externalProbeRecords = [
    {
      node: "private node name",
      countryCode: "private code",
      country: "Private Country",
      city: "Private City",
      asn: "AS private",
      passed: false,
      pending: false,
      statusCode: "private status",
      message: "private message detail",
      elapsedSeconds: "10 seconds",
      resolvedIp: "10.0.0.1",
      error: "getaddrinfo ENOTFOUND private.example.internal",
    },
  ];
  const result = evaluatePublicVisibilityEvidence(evidence);
  const formatted = formatResult(result, evidence);
  const serialized = `${JSON.stringify(result)}\n${formatted}`;

  assert.equal(result.verdict, "SolvedVerified");
  assert.equal(result.externalMultiRegionVisibility, "GovernanceBlocked");
  assert.ok(result.externalFindings.includes("external_probe_failed:redacted_value:redacted_value:public_visibility_unavailable"));
  assert.match(formatted, /external_probe_provider=redacted_value/);
  assert.match(formatted, /external_probe_api=redacted_url/);
  assert.match(formatted, /external_probe_target=redacted_url/);
  assert.match(formatted, /external_probe_request_id=redacted_value/);
  assert.match(formatted, /external_probe_permanent_link=redacted_url/);
  assert.match(formatted, /external_resolved_ip=redacted_value/);
  assert.doesNotMatch(serialized, /private\.example\.internal|private provider|private node name|Private Country|Private City|10\.0\.0\.1|trace=bounded/);
}

function testHttpsTargetValidationBlocksUnsafeTargets() {
  const validTarget = validateHttpsTarget("https://mullusi.com/status/");

  assert.equal(validTarget, "https://mullusi.com/status/");
  assert.throws(() => validateHttpsTarget("http://mullusi.com/"), /target_protocol_invalid/);
  assert.throws(() => validateHttpsTarget("https://example.com/"), /target_host_invalid/);
  assert.throws(() => validateHttpsTarget("not a url"), /target_url_invalid/);
}

function testCliRejectsUnsupportedArgumentWithoutNetwork() {
  const result = runVisibilityCli(["--unexpected"]);

  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /verdict=GovernanceBlocked/);
  assert.match(result.stdout, /proof_state=Fail/);
  assert.match(result.stdout, /error=unsupported_args_count:1/);
  assert.doesNotMatch(result.stdout, /--unexpected/);
}

function testCliRejectsUnsupportedArgumentAsJson() {
  const result = runVisibilityCli(["--json", "--unexpected"]);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  assert.equal(payload.verdict, "GovernanceBlocked");
  assert.equal(payload.proof_state, "Fail");
  assert.equal(payload.error, "unsupported_args_count:1");
  assert.equal(JSON.stringify(payload).includes("--unexpected"), false);
}

function testCliRejectsInvalidExternalNodeLimitWithoutNetwork() {
  const result = runVisibilityCli(["--check-host-max-nodes=bad"]);

  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /verdict=GovernanceBlocked/);
  assert.match(result.stdout, /proof_state=Fail/);
  assert.match(result.stdout, /error=check_host_max_nodes_invalid/);
  assert.doesNotMatch(result.stdout, /bad/);
}

function testCliRejectsExternalProviderConflictWithoutNetwork() {
  const result = runVisibilityCli(["--external-check-host", "--external-globalping"]);

  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /verdict=GovernanceBlocked/);
  assert.match(result.stdout, /proof_state=Fail/);
  assert.match(result.stdout, /error=external_provider_conflict:choose_one_provider/);
}

function testPublicErrorCodeRedactsRawExceptionValues() {
  const timeout = publicErrorCode(new Error("request_timeout:https://mullusi.com/"));
  const host = publicErrorCode(new Error("target_host_invalid:private.example.internal"));
  const jsonStatus = publicErrorCode(new Error("json_status_invalid:429"));
  const checkHost = publicErrorCode(new Error("check_host_start_failed:{\"request_id\":\"private\"}"));
  const globalping = publicErrorCode(new Error("globalping_start_failed:{\"id\":\"private\"}"));
  const network = publicErrorCode(new Error("getaddrinfo ENOTFOUND private.example.internal"));
  const invalidUrl = publicErrorCode(new Error("Invalid URL: private input"));
  const fallback = publicErrorCode(new Error("unexpected private path D:\\secret\\visibility.txt"));

  assert.equal(timeout, "public_visibility_request_timeout");
  assert.equal(host, "public_visibility_target_host_invalid");
  assert.equal(jsonStatus, "public_visibility_json_status_invalid");
  assert.equal(checkHost, "public_visibility_check_host_start_failed");
  assert.equal(globalping, "public_visibility_globalping_start_failed");
  assert.equal(network, "public_visibility_network_unavailable");
  assert.equal(invalidUrl, "public_visibility_url_invalid");
  assert.equal(fallback, "public_visibility_unavailable");
  assert.doesNotMatch(
    [timeout, host, jsonStatus, checkHost, globalping, network, invalidUrl, fallback].join("\n"),
    /mullusi\.com|private|secret|visibility\.txt|429/,
  );
}

testAllRequiredEvidencePassesWithGlobalBoundary();
testDnsResolverFloorBlocksVisibilityClaim();
testWwwRedirectMismatchBlocksVisibilityClaim();
testTlsFailureBlocksVisibilityClaim();
testExternalRegionalProbePassesCloseExternalVisibilityOnly();
testPartialExternalRegionalProbeFailureStaysBounded();
testExternalRegionalProbeFloorBlocksExternalVisibility();
testExternalProviderErrorKeepsBaseVisibilityBounded();
testEvaluatorAndFormatterRedactRawEvidenceErrors();
testExternalProbeMetadataRedactsUnsafeValues();
testHttpsTargetValidationBlocksUnsafeTargets();
testCliRejectsUnsupportedArgumentWithoutNetwork();
testCliRejectsUnsupportedArgumentAsJson();
testCliRejectsInvalidExternalNodeLimitWithoutNetwork();
testCliRejectsExternalProviderConflictWithoutNetwork();
testPublicErrorCodeRedactsRawExceptionValues();
console.log("public visibility gate tests passed");
