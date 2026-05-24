/*
Purpose: verify live Mullusi website security response headers.
Governance scope: browser-control headers, HTTPS-only target boundary, and public-safe header witness output.
Dependencies: Node.js standard library HTTPS client and public Mullusi HTTPS routes.
Invariants: checks never require secrets, never mutate infrastructure, and never print raw response-header values.
Test contract: run node scripts/test-check-live-security-headers.mjs.
*/

import https from "node:https";
import { pathToFileURL } from "node:url";

const requestTimeoutMs = 15_000;
const allowedTargetHostnames = new Set(["mullusi.com", "www.mullusi.com"]);
const defaultTargets = [
  "https://mullusi.com/",
  "https://mullusi.com/security/",
  "https://mullusi.com/.well-known/security.txt",
];
const expectedHeaderRules = [
  {
    id: "content_security_policy",
    header: "content-security-policy",
    requiredTerms: [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'none'",
      "upgrade-insecure-requests",
    ],
  },
  {
    id: "strict_transport_security",
    header: "strict-transport-security",
    requiredTerms: ["max-age=31536000", "includeSubDomains", "preload"],
  },
  {
    id: "referrer_policy",
    header: "referrer-policy",
    expectedValue: "strict-origin-when-cross-origin",
  },
  {
    id: "content_type_options",
    header: "x-content-type-options",
    expectedValue: "nosniff",
  },
  {
    id: "frame_options",
    header: "x-frame-options",
    expectedValue: "DENY",
  },
  {
    id: "cross_origin_opener_policy",
    header: "cross-origin-opener-policy",
    expectedValue: "same-origin",
  },
  {
    id: "cross_origin_resource_policy",
    header: "cross-origin-resource-policy",
    expectedValue: "same-site",
  },
  {
    id: "dns_prefetch_control",
    header: "x-dns-prefetch-control",
    expectedValue: "off",
  },
  {
    id: "permitted_cross_domain_policies",
    header: "x-permitted-cross-domain-policies",
    expectedValue: "none",
  },
  {
    id: "permissions_policy",
    header: "permissions-policy",
    requiredTerms: [
      "accelerometer=()",
      "camera=()",
      "geolocation=()",
      "microphone=()",
      "payment=()",
      "usb=()",
    ],
  },
];

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

function requestHead(targetUrl) {
  const safeUrl = validateTargetUrl(targetUrl);
  return new Promise((resolve, reject) => {
    const request = https.request(safeUrl, { method: "HEAD", headers: { "User-Agent": "mullusi-security-header-check/1" } }, (response) => {
      const statusCode = response.statusCode ?? 0;
      response.resume();
      resolve({
        targetUrl: safeUrl,
        statusCode,
        headers: normalizedHeaders(response.headers),
      });
    });
    request.setTimeout(requestTimeoutMs, () => {
      request.destroy(new Error(`request_timeout:${safeUrl}`));
    });
    request.on("error", reject);
    request.end();
  });
}

function evaluateHeaderRule(headers, rule) {
  const value = headers[rule.header] ?? "";
  if (!value) {
    return { id: rule.id, passed: false, finding: `header_missing:${rule.header}` };
  }
  if (rule.expectedValue && value.toLowerCase() !== rule.expectedValue.toLowerCase()) {
    return { id: rule.id, passed: false, finding: `header_value_mismatch:${rule.header}` };
  }
  const missingTerms = (rule.requiredTerms ?? []).filter((term) => !value.includes(term));
  if (missingTerms.length > 0) {
    return { id: rule.id, passed: false, finding: `header_term_missing:${rule.header}:${missingTerms.join(",")}` };
  }
  return { id: rule.id, passed: true, finding: "" };
}

export function evaluateSecurityHeaderEvidence(records, rules = expectedHeaderRules) {
  const findings = [];
  const targetResults = [];

  for (const record of records) {
    if (record.error) {
      findings.push(`target_request_error:${record.targetUrl}:${record.error}`);
      targetResults.push({ targetUrl: record.targetUrl, statusCode: "", passed: false, headerResults: [] });
      continue;
    }

    const statusCode = record.statusCode ?? 0;
    const headerResults = rules.map((rule) => evaluateHeaderRule(record.headers ?? {}, rule));
    const failedHeaderResults = headerResults.filter((result) => !result.passed);
    if (statusCode < 200 || statusCode >= 300) {
      findings.push(`target_status_invalid:${record.targetUrl}:${statusCode}`);
    }
    for (const result of failedHeaderResults) {
      findings.push(`${result.finding}:${record.targetUrl}`);
    }
    targetResults.push({
      targetUrl: record.targetUrl,
      statusCode,
      passed: statusCode >= 200 && statusCode < 300 && failedHeaderResults.length === 0,
      headerResults,
    });
  }

  const passed = findings.length === 0 && targetResults.length > 0;
  return {
    verdict: passed ? "SolvedVerified" : "GovernanceBlocked",
    proofState: passed ? "Pass" : "Fail",
    securityHeaderState: passed ? "SolvedVerified" : "GovernanceBlocked",
    targetCount: targetResults.length,
    requiredHeaderCount: rules.length,
    findings,
    targetResults,
  };
}

export function formatResult(result) {
  const lines = [
    `verdict=${result.verdict}`,
    `proof_state=${result.proofState}`,
    `security_header_state=${result.securityHeaderState}`,
    `target_count=${result.targetCount}`,
    `required_header_count=${result.requiredHeaderCount}`,
  ];
  if (result.findings.length === 0) {
    lines.push("finding=none");
  } else {
    for (const finding of result.findings) {
      lines.push(`finding=${finding}`);
    }
  }
  for (const targetResult of result.targetResults) {
    lines.push(`target=${targetResult.targetUrl}`);
    lines.push(`status=${targetResult.statusCode}`);
    lines.push(`security_headers=${targetResult.passed ? "Pass" : "Fail"}`);
    for (const headerResult of targetResult.headerResults) {
      lines.push(`header_${headerResult.id}=${headerResult.passed ? "Pass" : "Fail"}`);
    }
  }
  lines.push("raw_response_headers=not_recorded");
  return lines.join("\n");
}

async function collectEvidence(targetUrls = defaultTargets) {
  return Promise.all(targetUrls.map(async (targetUrl) => {
    try {
      return await requestHead(targetUrl);
    } catch (error) {
      return {
        targetUrl,
        statusCode: "",
        headers: {},
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }));
}

function unsupportedOptions(args) {
  const allowedOptions = new Set(["--allow-pending"]);
  return args.filter((arg) => arg.startsWith("--") && !allowedOptions.has(arg));
}

async function runCli() {
  const args = process.argv.slice(2);
  const unsupported = unsupportedOptions(args);
  const allowPending = args.includes("--allow-pending");
  if (unsupported.length > 0) {
    console.log(`verdict=GovernanceBlocked\nproof_state=Fail\nerror=unsupported_args:${unsupported.join(",")}`);
    process.exitCode = allowPending ? 0 : 1;
    return;
  }

  const records = await collectEvidence();
  const result = evaluateSecurityHeaderEvidence(records);
  console.log(formatResult(result));
  if (result.proofState !== "Pass" && !allowPending) {
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.log(`verdict=GovernanceBlocked\nproof_state=Fail\nerror=${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
