/*
Purpose: evaluate Mullusi domain-level DNS, certificate, and mail-authentication controls.
Governance scope: DNSSEC DS, CAA, MX, SPF, DMARC, common Google DKIM selector, MTA-STS, and TLS-RPT evidence.
Dependencies: Cloudflare DNS-over-HTTPS public resolver and Node.js standard library HTTPS client.
Invariants: checks are read-only, public-safe, deterministic after DNS evidence collection, and never store provider account identifiers or secret values.
Test contract: run node scripts/test-check-domain-security.mjs.
*/

import https from "node:https";
import { pathToFileURL } from "node:url";

const dohEndpoint = "https://cloudflare-dns.com/dns-query";
const queryTimeoutMs = 15_000;
const domain = "mullusi.com";
const dmarcHost = `_dmarc.${domain}`;
const googleDkimHost = `google._domainkey.${domain}`;
const mtaStsHost = `_mta-sts.${domain}`;
const tlsRptHost = `_smtp._tls.${domain}`;
const allowedOptions = new Set(["--allow-hardening-gaps"]);

function withTimeout(promise, label) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`timeout:${label}`)), queryTimeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function requestDnsJson(hostname, type) {
  const url = `${dohEndpoint}?name=${encodeURIComponent(hostname)}&type=${encodeURIComponent(type)}`;
  return withTimeout(new Promise((resolve, reject) => {
    const request = https.request(url, { method: "GET", headers: { Accept: "application/dns-json", "User-Agent": "mullusi-domain-security-check/1" } }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        if ((response.statusCode ?? 0) < 200 || (response.statusCode ?? 0) >= 300) {
          reject(new Error(`doh_status_invalid:${response.statusCode ?? 0}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error("doh_json_parse_failed"));
        }
      });
    });
    request.setTimeout(queryTimeoutMs, () => {
      request.destroy(new Error(`request_timeout:${hostname}:${type}`));
    });
    request.on("error", reject);
    request.end();
  }), `${hostname}:${type}`);
}

function answerData(response) {
  return Array.isArray(response?.Answer) ? response.Answer.map((answer) => String(answer.data ?? "")) : [];
}

function normalizeTxtRecord(record) {
  return String(record ?? "").replace(/^"|"$/g, "");
}

function txtValues(response) {
  return answerData(response).map(normalizeTxtRecord);
}

function firstRecordMatching(records, pattern) {
  return records.find((record) => pattern.test(record)) ?? "";
}

function hasGoogleMx(mxRecords) {
  return mxRecords.some((record) => /smtp\.google\.com\.?$/i.test(record) || /aspmx\.l\.google\.com\.?$/i.test(record));
}

function recordContainsHardFail(spfRecord) {
  return /(?:^|\s)-all(?:\s|$)/i.test(spfRecord);
}

function dmarcPolicy(dmarcRecord) {
  const match = dmarcRecord.match(/(?:^|;\s*)p\s*=\s*([^;\s]+)/i);
  return match ? match[1].toLowerCase() : "";
}

function hasDmarcReportAddress(dmarcRecord) {
  return /(?:^|;\s*)rua\s*=\s*mailto:/i.test(dmarcRecord);
}

function publicDmarcPolicyLabel(policy) {
  return ["none", "quarantine", "reject", "missing"].includes(policy) ? policy : "redacted_value";
}

export function evaluateDomainSecurityEvidence(evidence) {
  const findings = [];
  const blockers = [];
  const hardeningGaps = [];

  const dsRecords = evidence.dsRecords ?? [];
  const caaRecords = evidence.caaRecords ?? [];
  const mxRecords = evidence.mxRecords ?? [];
  const rootTxtRecords = evidence.rootTxtRecords ?? [];
  const dmarcRecords = evidence.dmarcRecords ?? [];
  const googleDkimRecords = evidence.googleDkimRecords ?? [];
  const mtaStsRecords = evidence.mtaStsRecords ?? [];
  const tlsRptRecords = evidence.tlsRptRecords ?? [];

  if (dsRecords.length === 0) blockers.push("dnssec_ds_missing");

  if (!hasGoogleMx(mxRecords)) blockers.push("google_workspace_mx_missing");

  const spfRecord = firstRecordMatching(rootTxtRecords, /^v=spf1\b/i);
  if (!spfRecord) {
    blockers.push("spf_record_missing");
  } else {
    if (!/include:_spf\.google\.com/i.test(spfRecord)) blockers.push("spf_google_include_missing");
    if (!recordContainsHardFail(spfRecord)) hardeningGaps.push("spf_not_hardfail");
  }

  const dmarcRecord = firstRecordMatching(dmarcRecords, /^v=DMARC1\b/i);
  const policy = dmarcPolicy(dmarcRecord);
  if (!dmarcRecord) {
    blockers.push("dmarc_record_missing");
  } else {
    if (!hasDmarcReportAddress(dmarcRecord)) hardeningGaps.push("dmarc_report_address_missing");
    if (policy === "none") hardeningGaps.push("dmarc_policy_monitoring_only");
    if (!["none", "quarantine", "reject"].includes(policy)) blockers.push("dmarc_policy_invalid");
  }

  if (caaRecords.length === 0) hardeningGaps.push("caa_record_missing");
  if (googleDkimRecords.length === 0) hardeningGaps.push("known_google_dkim_selector_missing");
  if (!mtaStsRecords.some((record) => /^v=STSv1\b/i.test(record))) hardeningGaps.push("mta_sts_policy_missing");
  if (!tlsRptRecords.some((record) => /^v=TLSRPTv1\b/i.test(record))) hardeningGaps.push("tls_rpt_record_missing");

  findings.push(...blockers, ...hardeningGaps);

  const verdict = blockers.length > 0 ? "GovernanceBlocked" : hardeningGaps.length > 0 ? "AwaitingEvidence" : "SolvedVerified";
  const proofState = blockers.length > 0 ? "Fail" : hardeningGaps.length > 0 ? "Unknown" : "Pass";

  return {
    verdict,
    proofState,
    domainSecurityState: verdict,
    dnssecState: dsRecords.length > 0 ? "Pass" : "Fail",
    caaState: caaRecords.length > 0 ? "Pass" : "AwaitingEvidence",
    mxState: hasGoogleMx(mxRecords) ? "Pass" : "Fail",
    spfState: spfRecord ? "Pass" : "Fail",
    spfEnforcement: spfRecord && recordContainsHardFail(spfRecord) ? "Pass" : "AwaitingEvidence",
    dmarcState: dmarcRecord ? "Pass" : "Fail",
    dmarcPolicy: publicDmarcPolicyLabel(policy || "missing"),
    dmarcEnforcement: ["quarantine", "reject"].includes(policy) ? "Pass" : "AwaitingEvidence",
    knownGoogleDkimSelectorState: googleDkimRecords.length > 0 ? "Pass" : "AwaitingEvidence",
    mtaStsState: mtaStsRecords.some((record) => /^v=STSv1\b/i.test(record)) ? "Pass" : "AwaitingEvidence",
    tlsRptState: tlsRptRecords.some((record) => /^v=TLSRPTv1\b/i.test(record)) ? "Pass" : "AwaitingEvidence",
    dsRecordCount: dsRecords.length,
    caaRecordCount: caaRecords.length,
    mxRecordCount: mxRecords.length,
    blockers,
    hardeningGaps,
    findings,
  };
}

export function formatResult(result) {
  const lines = [
    `verdict=${result.verdict}`,
    `proof_state=${result.proofState}`,
    `domain_security_state=${result.domainSecurityState}`,
    `dnssec_ds=${result.dnssecState}`,
    `caa_policy=${result.caaState}`,
    `mx_google_workspace=${result.mxState}`,
    `spf_record=${result.spfState}`,
    `spf_enforcement=${result.spfEnforcement}`,
    `dmarc_record=${result.dmarcState}`,
    `dmarc_policy=${result.dmarcPolicy}`,
    `dmarc_enforcement=${result.dmarcEnforcement}`,
    `known_google_dkim_selector=${result.knownGoogleDkimSelectorState}`,
    `mta_sts=${result.mtaStsState}`,
    `tls_rpt=${result.tlsRptState}`,
    `ds_record_count=${result.dsRecordCount}`,
    `caa_record_count=${result.caaRecordCount}`,
    `mx_record_count=${result.mxRecordCount}`,
  ];
  if (result.findings.length === 0) {
    lines.push("finding=none");
  } else {
    for (const finding of result.findings) {
      lines.push(`finding=${finding}`);
    }
  }
  lines.push("raw_dns_values=not_recorded");
  return lines.join("\n");
}

async function collectDomainSecurityEvidence() {
  const [
    dsResponse,
    caaResponse,
    mxResponse,
    rootTxtResponse,
    dmarcResponse,
    googleDkimResponse,
    mtaStsResponse,
    tlsRptResponse,
  ] = await Promise.all([
    requestDnsJson(domain, "DS"),
    requestDnsJson(domain, "CAA"),
    requestDnsJson(domain, "MX"),
    requestDnsJson(domain, "TXT"),
    requestDnsJson(dmarcHost, "TXT"),
    requestDnsJson(googleDkimHost, "TXT"),
    requestDnsJson(mtaStsHost, "TXT"),
    requestDnsJson(tlsRptHost, "TXT"),
  ]);

  return {
    dsRecords: answerData(dsResponse),
    caaRecords: answerData(caaResponse),
    mxRecords: answerData(mxResponse),
    rootTxtRecords: txtValues(rootTxtResponse),
    dmarcRecords: txtValues(dmarcResponse),
    googleDkimRecords: txtValues(googleDkimResponse),
    mtaStsRecords: txtValues(mtaStsResponse),
    tlsRptRecords: txtValues(tlsRptResponse),
  };
}

function unsupportedOptions(args) {
  return args.filter((arg) => arg.startsWith("--") && !allowedOptions.has(arg));
}

export function publicErrorCode(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/timeout|ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|network|request/i.test(message)) {
    return "domain_security_network_unavailable";
  }
  if (/json|parse|syntax/i.test(message)) {
    return "domain_security_response_invalid";
  }
  return "domain_security_check_unavailable";
}

async function runCli() {
  const args = process.argv.slice(2);
  const unsupported = unsupportedOptions(args);
  const allowHardeningGaps = args.includes("--allow-hardening-gaps");
  if (unsupported.length > 0) {
    console.log(`verdict=GovernanceBlocked\nproof_state=Fail\nerror=unsupported_args_count:${unsupported.length}`);
    process.exitCode = 1;
    return;
  }

  const evidence = await collectDomainSecurityEvidence();
  const result = evaluateDomainSecurityEvidence(evidence);
  console.log(formatResult(result));

  if (result.proofState === "Fail" || (result.proofState === "Unknown" && !allowHardeningGaps)) {
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.log(`verdict=GovernanceBlocked\nproof_state=Fail\nerror=${publicErrorCode(error)}`);
    process.exitCode = 1;
  });
}
