/*
Purpose: block public api.mullusi.com exposure until recovery and runtime witnesses permit DNS publication.
Governance scope: recovery dependency, API DNS publication, public runtime reachability, and public-safe evidence output.
Dependencies: Node.js standard library, ops/api-exposure-witness.md, ops/recovery-completion-witness.md, ops/api-production-readiness-gate.md, and ops/api-runtime-host-path.md.
Invariants: read-only, no DNS mutation, no raw host address output, and no private inventory access.
Test contract: run node scripts/test-check-api-exposure-gate.mjs.
*/

import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { resolve4, resolve6, resolveCname } from "node:dns/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const apiHostname = "api.mullusi.com";
const apiHealthUrl = "https://api.mullusi.com/health";
const dnsTimeoutMs = 8_000;
const httpsTimeoutMs = 10_000;
const allowedOptions = new Set(["--expect-blocked", "--require-ready", "--live", "--json"]);
const allowedRecoveryStates = new Set(["AwaitingEvidence", "ReadyForProvisioning"]);
const allowedExposureStates = new Set(["GovernanceBlocked", "AwaitingEvidence", "ReadyForDns", "SolvedVerified", "SafeHalt"]);
const allowedRuntimeStates = new Set(["AwaitingEvidence", "ReadyForDns", "SolvedVerified", "SafeHalt"]);

function readUtf8(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function lineValue(content, key) {
  const match = content.match(new RegExp(`^${key}=([^\\s]+)$`, "m"));
  return match?.[1] ?? "";
}

function unsupportedOptions(args) {
  return args.filter((arg) => arg.startsWith("--") && !allowedOptions.has(arg));
}

function hasRequiredTerms(content, terms, label) {
  const findings = [];
  for (const term of terms) {
    if (!content.includes(term)) findings.push(`required_term_missing:${label}:${term}`);
  }
  return findings;
}

function withTimeout(promise, timeoutMs, fallback) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallback), timeoutMs)),
  ]);
}

export function parseApiExposureDocuments({ recoveryWitness, exposureWitness, apiGate, runtimeHostPath }) {
  const findings = [
    ...hasRequiredTerms(apiGate, [
      "no_gateway_runtime_evidence -> no_api_dns",
      "ops/recovery-completion-witness.md",
      "ReadyForDns",
      "Post-DNS Evidence",
      "Rollback Rule",
    ], "api-production-readiness-gate"),
    ...hasRequiredTerms(runtimeHostPath, [
      "If the host is not ready, keep `api.mullusi.com` absent",
      "external managed PostgreSQL",
      "Strict-Transport-Security: max-age=86400",
      "Rollback",
    ], "api-runtime-host-path"),
    ...hasRequiredTerms(exposureWitness, [
      "api_exposure_state=",
      "api_dns_publication_allowed=",
      "api_runtime_public_state=",
      "recovery_witness_state=",
      "api_provisioning_allowed=",
      "node scripts/check-api-exposure-gate.mjs",
      "STATUS:",
    ], "api-exposure-witness"),
  ];

  return {
    recoveryWitnessState: lineValue(recoveryWitness, "recovery_witness_state"),
    recoveryApiProvisioningAllowed: lineValue(recoveryWitness, "api_provisioning_allowed"),
    exposureState: lineValue(exposureWitness, "api_exposure_state"),
    dnsPublicationAllowed: lineValue(exposureWitness, "api_dns_publication_allowed"),
    runtimePublicState: lineValue(exposureWitness, "api_runtime_public_state"),
    exposureRecoveryState: lineValue(exposureWitness, "recovery_witness_state"),
    exposureProvisioningAllowed: lineValue(exposureWitness, "api_provisioning_allowed"),
    findings,
  };
}

export async function collectLiveApiExposureState({ live = false } = {}) {
  if (!live) {
    return {
      dnsState: "NotRequested",
      dnsRecordCount: 0,
      httpsState: "NotRequested",
    };
  }

  const dnsResults = await withTimeout(Promise.allSettled([
    resolve4(apiHostname),
    resolve6(apiHostname),
    resolveCname(apiHostname),
  ]), dnsTimeoutMs, "Timeout");

  if (dnsResults === "Timeout") {
    return {
      dnsState: "Unknown",
      dnsRecordCount: 0,
      httpsState: "SkippedDnsUnknown",
    };
  }

  let dnsRecordCount = 0;
  let dnsHadUnexpectedError = false;
  for (const result of dnsResults) {
    if (result.status === "fulfilled") {
      dnsRecordCount += Array.isArray(result.value) ? result.value.length : 0;
    } else if (result.reason?.code !== "ENODATA" && result.reason?.code !== "ENOTFOUND") {
      dnsHadUnexpectedError = true;
    }
  }

  if (dnsHadUnexpectedError) {
    return {
      dnsState: "Unknown",
      dnsRecordCount,
      httpsState: "SkippedDnsUnknown",
    };
  }

  if (dnsRecordCount === 0) {
    return {
      dnsState: "Absent",
      dnsRecordCount: 0,
      httpsState: "SkippedDnsAbsent",
    };
  }

  const httpsState = await withTimeout(new Promise((resolve) => {
    const request = https.request(apiHealthUrl, { method: "GET", headers: { "User-Agent": "mullusi-api-exposure-gate/1" } }, (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode >= 200 && response.statusCode < 500 ? "Reachable" : "Unavailable"));
    });
    request.on("timeout", () => {
      request.destroy();
      resolve("Timeout");
    });
    request.on("error", () => resolve("Unavailable"));
    request.setTimeout(httpsTimeoutMs);
    request.end();
  }), httpsTimeoutMs + 1_000, "Timeout");

  return {
    dnsState: "Present",
    dnsRecordCount,
    httpsState,
  };
}

export function evaluateApiExposureEvidence({ documentState, liveState }) {
  const hardFindings = [...(documentState.findings ?? [])];
  const softFindings = [];
  const blockers = [];

  if (!allowedRecoveryStates.has(documentState.recoveryWitnessState)) {
    hardFindings.push(`recovery_witness_state_invalid:${documentState.recoveryWitnessState}`);
  }
  if (!["false", "true"].includes(documentState.recoveryApiProvisioningAllowed)) {
    hardFindings.push(`api_provisioning_allowed_invalid:${documentState.recoveryApiProvisioningAllowed}`);
  }
  if (!allowedExposureStates.has(documentState.exposureState)) {
    hardFindings.push(`api_exposure_state_invalid:${documentState.exposureState}`);
  }
  if (!["false", "true"].includes(documentState.dnsPublicationAllowed)) {
    hardFindings.push(`api_dns_publication_allowed_invalid:${documentState.dnsPublicationAllowed}`);
  }
  if (!allowedRuntimeStates.has(documentState.runtimePublicState)) {
    hardFindings.push(`api_runtime_public_state_invalid:${documentState.runtimePublicState}`);
  }
  if (documentState.exposureRecoveryState !== documentState.recoveryWitnessState) {
    hardFindings.push("api_exposure_recovery_state_mismatch");
  }
  if (documentState.exposureProvisioningAllowed !== documentState.recoveryApiProvisioningAllowed) {
    hardFindings.push("api_exposure_provisioning_flag_mismatch");
  }

  const recoveryReady = documentState.recoveryWitnessState === "ReadyForProvisioning"
    && documentState.recoveryApiProvisioningAllowed === "true";
  const dnsAllowed = documentState.dnsPublicationAllowed === "true";
  const configuredReadyForDns = documentState.exposureState === "ReadyForDns"
    && documentState.runtimePublicState === "ReadyForDns";
  const configuredSolvedVerified = documentState.exposureState === "SolvedVerified"
    && documentState.runtimePublicState === "SolvedVerified";

  if (!recoveryReady) blockers.push("api_exposure_blocked_until_recovery_ready");
  if (!recoveryReady && dnsAllowed) hardFindings.push("api_dns_allowed_before_recovery_ready");
  if (!recoveryReady && documentState.exposureState !== "GovernanceBlocked") {
    hardFindings.push("api_exposure_not_blocked_while_recovery_blocks");
  }
  if (!dnsAllowed && documentState.runtimePublicState !== "AwaitingEvidence") {
    hardFindings.push("api_runtime_public_state_not_awaiting_while_dns_blocked");
  }
  if (recoveryReady && !dnsAllowed && documentState.exposureState === "GovernanceBlocked") {
    hardFindings.push("api_exposure_governance_blocked_after_recovery_ready");
  }

  if (liveState.dnsState === "Unknown") softFindings.push("api_dns_state_unknown");
  if (!dnsAllowed && liveState.dnsState === "Present") hardFindings.push("api_dns_present_while_blocked");
  if (!dnsAllowed && liveState.httpsState === "Reachable") hardFindings.push("api_https_reachable_while_blocked");
  if (dnsAllowed && !configuredReadyForDns && !configuredSolvedVerified) {
    hardFindings.push("api_exposure_state_not_ready_while_dns_allowed");
  }
  if (dnsAllowed && configuredReadyForDns && liveState.dnsState === "Present") {
    softFindings.push("api_dns_present_before_post_dns_witness");
  }
  if (configuredSolvedVerified && liveState.dnsState !== "Present") {
    softFindings.push("api_dns_not_present_for_solved_verified");
  }
  if (configuredSolvedVerified && liveState.httpsState !== "Reachable") {
    softFindings.push("api_https_not_reachable_for_solved_verified");
  }

  const blocked = blockers.length > 0;
  const readyForDns = hardFindings.length === 0 && !blocked && dnsAllowed && configuredReadyForDns && softFindings.length === 0;
  const solvedVerified = hardFindings.length === 0 && !blocked && dnsAllowed && configuredSolvedVerified && softFindings.length === 0;
  const ready = readyForDns || solvedVerified;
  const verdict = hardFindings.length > 0
    ? "GovernanceBlocked"
    : blocked
      ? "GovernanceBlocked"
      : softFindings.length > 0
        ? "AwaitingEvidence"
        : solvedVerified
          ? "SolvedVerified"
          : readyForDns
            ? "ReadyForDns"
          : "AwaitingEvidence";

  return {
    verdict,
    proofState: hardFindings.length > 0 ? "Fail" : ready ? "Pass" : "Unknown",
    apiExposureState: verdict,
    apiDnsPublicationAllowed: ready,
    blocked,
    ready,
    readyForDns,
    solvedVerified,
    recoveryWitnessState: documentState.recoveryWitnessState,
    apiProvisioningAllowed: documentState.recoveryApiProvisioningAllowed === "true",
    configuredExposureState: documentState.exposureState,
    configuredDnsAllowed: dnsAllowed,
    runtimePublicState: documentState.runtimePublicState,
    dnsState: liveState.dnsState,
    dnsRecordCount: liveState.dnsRecordCount,
    httpsState: liveState.httpsState,
    hardFindings,
    softFindings,
    blockers,
  };
}

export function formatResult(result) {
  const findingLines = result.hardFindings.length > 0
    ? result.hardFindings.map((finding) => `finding=${finding}`)
    : ["finding=none"];
  const softFindingLines = result.softFindings.length > 0
    ? result.softFindings.map((finding) => `soft_finding=${finding}`)
    : ["soft_finding=none"];
  const blockerLines = result.blockers.length > 0
    ? result.blockers.map((blocker) => `blocker=${blocker}`)
    : ["blocker=none"];
  return [
    `api_exposure_state=${result.apiExposureState}`,
    `verdict=${result.verdict}`,
    `proof_state=${result.proofState}`,
    `api_dns_publication_allowed=${result.apiDnsPublicationAllowed}`,
    `recovery_witness_state=${result.recoveryWitnessState}`,
    `api_provisioning_allowed=${result.apiProvisioningAllowed}`,
    `configured_exposure_state=${result.configuredExposureState}`,
    `configured_dns_allowed=${result.configuredDnsAllowed}`,
    `api_runtime_public_state=${result.runtimePublicState}`,
    `dns_probe_state=${result.dnsState}`,
    `dns_record_count=${result.dnsRecordCount}`,
    `https_probe_state=${result.httpsState}`,
    ...findingLines,
    ...softFindingLines,
    ...blockerLines,
    "raw_host_values=not_recorded",
    "secret_values=not_read",
    "private_recovery_values=not_read",
  ].join("\n");
}

export function collectLocalApiExposureDocuments() {
  return parseApiExposureDocuments({
    recoveryWitness: readUtf8("ops/recovery-completion-witness.md"),
    exposureWitness: readUtf8("ops/api-exposure-witness.md"),
    apiGate: readUtf8("ops/api-production-readiness-gate.md"),
    runtimeHostPath: readUtf8("ops/api-runtime-host-path.md"),
  });
}

async function main() {
  const args = process.argv.slice(2);
  const invalidOptions = unsupportedOptions(args);
  if (invalidOptions.length > 0) {
    const result = {
      apiExposureState: "GovernanceBlocked",
      verdict: "GovernanceBlocked",
      proofState: "Fail",
      apiDnsPublicationAllowed: false,
      recoveryWitnessState: "Unknown",
      apiProvisioningAllowed: false,
      configuredExposureState: "Unknown",
      configuredDnsAllowed: false,
      runtimePublicState: "Unknown",
      dnsState: "NotRequested",
      dnsRecordCount: 0,
      httpsState: "NotRequested",
      hardFindings: [`unsupported_args:${invalidOptions.join(",")}`],
      softFindings: [],
      blockers: [],
    };
    console.log(formatResult(result));
    process.exit(1);
  }

  const documentState = collectLocalApiExposureDocuments();
  const liveState = await collectLiveApiExposureState({ live: args.includes("--live") });
  const result = evaluateApiExposureEvidence({ documentState, liveState });
  const output = args.includes("--json") ? JSON.stringify(result, null, 2) : formatResult(result);
  console.log(output);

  const requireReady = args.includes("--require-ready");
  const expectBlocked = args.includes("--expect-blocked");
  if (requireReady && !result.ready) process.exit(1);
  if (expectBlocked && !result.blocked) process.exit(1);
  process.exit(result.proofState === "Fail" ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
