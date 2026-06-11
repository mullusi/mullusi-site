/*
Purpose: report the next public-safe Mullusi operator action from local gate state.
Governance scope: recovery witness, domain-hardening preflight, API readiness, and no-secret handoff guidance.
Dependencies: Node.js standard library, ops gate documents, and the API production readiness checker.
Invariants: read-only; no browser sessions, provider dashboards, private recovery files, DNS target values, host addresses, database URLs, or secret values are read or printed.
Test contract: run node scripts/test-report-ops-next-action.mjs.
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  collectLocalApiProductionEvidence,
  evaluateApiProductionReadinessEvidence,
} from "./check-api-production-readiness.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const allowedArgs = new Set(["--help", "-h", "--json"]);

function readUtf8(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function lineValue(content, key) {
  const match = content.match(new RegExp(`^${key}=([^\\s]+)$`, "m"));
  return match?.[1] ?? "";
}

function usage() {
  return [
    "Usage:",
    "  node scripts/report-ops-next-action.mjs [--json]",
    "",
    "Reports the next public-safe local action from committed gate state.",
  ].join("\n");
}

export function collectOpsNextEvidence() {
  const recoveryWitness = readUtf8("ops/recovery-completion-witness.md");
  const domainPreflight = readUtf8("ops/domain-security-preflight.md");
  const apiReadiness = evaluateApiProductionReadinessEvidence(collectLocalApiProductionEvidence());

  return {
    recoveryWitnessState: lineValue(recoveryWitness, "recovery_witness_state") || "Unknown",
    apiProvisioningAllowed: lineValue(recoveryWitness, "api_provisioning_allowed") === "true",
    domainHardeningPreflight: lineValue(domainPreflight, "domain_hardening_preflight") || "Unknown",
    manualCaaAllowed: lineValue(domainPreflight, "manual_caa_allowed") === "true",
    dkimPublicationAllowed: lineValue(domainPreflight, "dkim_publication_allowed") === "true",
    spfHardfailAllowed: lineValue(domainPreflight, "spf_hardfail_allowed") === "true",
    dmarcEnforcementAllowed: lineValue(domainPreflight, "dmarc_enforcement_allowed") === "true",
    mtaStsEnforceAllowed: lineValue(domainPreflight, "mta_sts_enforce_allowed") === "true",
    tlsRptPublicationAllowed: lineValue(domainPreflight, "tls_rpt_publication_allowed") === "true",
    apiReadiness,
  };
}

export function decideOpsNextAction(evidence) {
  if (evidence.recoveryWitnessState !== "ReadyForProvisioning" || evidence.apiProvisioningAllowed !== true) {
    return {
      opsNextState: "AwaitingEvidence",
      nextAction: "complete_private_recovery_inventory_outside_git",
      blockedSurface: "root_recovery",
      safeLocalCommand: "node scripts/check-private-recovery-inventory.mjs --allow-missing",
      manualEvidenceBoundary: "Cloudflare, GitHub, Google Workspace, Namecheap, billing, and private recovery storage",
    };
  }

  if (evidence.domainHardeningPreflight !== "SolvedVerified") {
    return {
      opsNextState: "AwaitingEvidence",
      nextAction: "collect_domain_hardening_preflight_evidence",
      blockedSurface: "domain_security_hardening",
      safeLocalCommand: "node scripts/check-domain-hardening-preflight.mjs --expect-blocked",
      manualEvidenceBoundary: "Cloudflare SSL/TLS, DNS write authority, sender inventory, DKIM selector, report mailboxes, and MTA-STS host",
    };
  }

  if (evidence.apiReadiness.apiProductionReadinessState !== "ReadyForDns") {
    return {
      opsNextState: "AwaitingEvidence",
      nextAction: "close_private_api_runtime_evidence_before_dns",
      blockedSurface: "api_runtime",
      safeLocalCommand: "node scripts/check-api-production-readiness.mjs --expect-blocked",
      manualEvidenceBoundary: "runtime host, managed PostgreSQL, secret store, TLS, rollback path, private runtime witness, and DNS authority",
    };
  }

  return {
    opsNextState: "ReadyForDns",
    nextAction: "publish_only_api_dns_after_final_manual_review",
    blockedSurface: "none",
    safeLocalCommand: "node scripts/check-api-production-readiness.mjs --require-ready",
    manualEvidenceBoundary: "Cloudflare DNS mutation remains manual and must preserve apex, www, docs, and email surfaces",
  };
}

export function formatOpsNextReport(evidence, decision) {
  const domainDnsMutationAllowed = [
    evidence.manualCaaAllowed,
    evidence.dkimPublicationAllowed,
    evidence.spfHardfailAllowed,
    evidence.dmarcEnforcementAllowed,
    evidence.mtaStsEnforceAllowed,
    evidence.tlsRptPublicationAllowed,
  ].every((value) => value === true);

  return [
    `ops_next_state=${decision.opsNextState}`,
    `next_action=${decision.nextAction}`,
    `blocked_surface=${decision.blockedSurface}`,
    `safe_local_command=${decision.safeLocalCommand}`,
    `recovery_witness_state=${evidence.recoveryWitnessState}`,
    `api_provisioning_allowed=${evidence.apiProvisioningAllowed ? "true" : "false"}`,
    `domain_hardening_preflight=${evidence.domainHardeningPreflight}`,
    `domain_dns_mutation_allowed=${domainDnsMutationAllowed ? "true" : "false"}`,
    `api_production_readiness_state=${evidence.apiReadiness.apiProductionReadinessState}`,
    `api_dns_publication_allowed=${evidence.apiReadiness.apiDnsPublicationAllowed ? "true" : "false"}`,
    `manual_evidence_missing_count=${evidence.apiReadiness.manualEvidenceMissing.length}`,
    `runtime_witness_closed_count=${evidence.apiReadiness.closedWitnessCount}`,
    `manual_evidence_boundary=${decision.manualEvidenceBoundary}`,
    "secret_values=not_recorded",
    "host_addresses=not_recorded",
    "database_urls=not_recorded",
    "private_recovery_values=not_read",
  ].join("\n");
}

export function formatOpsNextJson(evidence, decision) {
  const domainDnsMutationAllowed = [
    evidence.manualCaaAllowed,
    evidence.dkimPublicationAllowed,
    evidence.spfHardfailAllowed,
    evidence.dmarcEnforcementAllowed,
    evidence.mtaStsEnforceAllowed,
    evidence.tlsRptPublicationAllowed,
  ].every((value) => value === true);

  return {
    opsNextState: decision.opsNextState,
    solverOutcome: decision.opsNextState === "ReadyForDns" ? "SolvedVerified" : "AwaitingEvidence",
    proofState: decision.opsNextState === "ReadyForDns" ? "Pass" : "Unknown",
    nextAction: decision.nextAction,
    blockedSurface: decision.blockedSurface,
    safeLocalCommand: decision.safeLocalCommand,
    recoveryWitnessState: evidence.recoveryWitnessState,
    apiProvisioningAllowed: evidence.apiProvisioningAllowed,
    domainHardeningPreflight: evidence.domainHardeningPreflight,
    domainDnsMutationAllowed,
    apiProductionReadinessState: evidence.apiReadiness.apiProductionReadinessState,
    apiDnsPublicationAllowed: evidence.apiReadiness.apiDnsPublicationAllowed,
    manualEvidenceMissingCount: evidence.apiReadiness.manualEvidenceMissing.length,
    runtimeWitnessClosedCount: evidence.apiReadiness.closedWitnessCount,
    manualEvidenceBoundary: decision.manualEvidenceBoundary,
    secretValues: "not_recorded",
    hostAddresses: "not_recorded",
    databaseUrls: "not_recorded",
    privateRecoveryValues: "not_read",
  };
}

function parseArgs(args) {
  const invalidArgs = args.filter((arg) => !allowedArgs.has(arg));
  return {
    invalidArgs,
    help: args.includes("--help") || args.includes("-h"),
    json: args.includes("--json"),
  };
}

function runCli() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (args.invalidArgs.length > 0) {
    if (args.json) {
      console.log(JSON.stringify({
        opsNextState: "GovernanceBlocked",
        solverOutcome: "GovernanceBlocked",
        proofState: "Fail",
        error: `unsupported_args:${args.invalidArgs.join(",")}`,
      }, null, 2));
      process.exit(1);
      return;
    }
    console.log(`ops_next_state=GovernanceBlocked\nproof_state=Fail\nerror=unsupported_args:${args.invalidArgs.join(",")}`);
    process.exit(1);
    return;
  }

  const evidence = collectOpsNextEvidence();
  const decision = decideOpsNextAction(evidence);
  if (args.json) {
    console.log(JSON.stringify(formatOpsNextJson(evidence, decision), null, 2));
    return;
  }
  console.log(formatOpsNextReport(evidence, decision));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
