/*
Purpose: report the next public-safe Mullusi operator action from local gate state.
Governance scope: recovery witness, domain-hardening preflight, API readiness, product live evidence sequencing, and no-secret handoff guidance.
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
import {
  collectLocalApiExposureDocuments,
  evaluateApiExposureEvidence,
} from "./check-api-exposure-gate.mjs";
import {
  evaluateApiRuntimeManualEvidenceChecklist,
} from "./validate-api-runtime-manual-evidence-checklist.mjs";
import {
  validateApiRuntimeManualEvidenceIntake,
} from "./validate-api-runtime-manual-evidence-intake.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const allowedArgs = new Set(["--help", "-h", "--json"]);
const publicStateValues = new Set([
  "AwaitingEvidence",
  "Blocked",
  "GovernanceBlocked",
  "ReadyForDns",
  "ReadyForProvisioning",
  "SafeHalt",
  "SolvedVerified",
  "Unknown",
]);

function readUtf8(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function lineValue(content, key) {
  const match = content.match(new RegExp(`^${key}=([^\\s]+)$`, "m"));
  return match?.[1] ?? "";
}

function publicStateValue(value) {
  const text = String(value ?? "Unknown").trim();
  return publicStateValues.has(text) ? text : "redacted_value";
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
  const evaluatedApiExposure = evaluateApiExposureEvidence({
    documentState: collectLocalApiExposureDocuments(),
    liveState: {
      dnsState: "NotRequested",
      dnsRecordCount: 0,
      httpsState: "NotRequested",
    },
  });
  const evaluatedApiReadiness = evaluateApiProductionReadinessEvidence(collectLocalApiProductionEvidence());
  const evaluatedManualEvidenceChecklist = evaluateApiRuntimeManualEvidenceChecklist(
    readUtf8("ops/api-runtime-manual-evidence-checklist.md"),
  );
  const evaluatedManualEvidenceIntake = validateApiRuntimeManualEvidenceIntake();
  const apiReadiness = evaluatedApiReadiness;

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
    apiExposureState: evaluatedApiExposure.apiExposureState,
    apiExposureDnsAllowed: evaluatedApiExposure.apiDnsPublicationAllowed === true,
    apiRuntimePublicState: evaluatedApiExposure.runtimePublicState,
    apiReadiness,
    apiRuntimeManualEvidenceIntake: evaluatedManualEvidenceIntake,
    apiRuntimeManualEvidenceChecklist: evaluatedManualEvidenceChecklist,
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
      productRuntimeClaimsAllowed: false,
      publicProductReleaseAllowed: false,
    };
  }

  if (evidence.domainHardeningPreflight !== "SolvedVerified") {
    return {
      opsNextState: "AwaitingEvidence",
      nextAction: "collect_domain_hardening_preflight_evidence",
      blockedSurface: "domain_security_hardening",
      safeLocalCommand: "node scripts/check-domain-hardening-preflight.mjs --expect-blocked",
      manualEvidenceBoundary: "Cloudflare SSL/TLS, DNS write authority, sender inventory, DKIM selector, report mailboxes, and MTA-STS host",
      productRuntimeClaimsAllowed: false,
      publicProductReleaseAllowed: false,
    };
  }

  const apiExposureSolved = evidence.apiExposureState === "SolvedVerified"
    && evidence.apiExposureDnsAllowed === true
    && evidence.apiRuntimePublicState === "SolvedVerified";

  if (!apiExposureSolved && evidence.apiReadiness.apiProductionReadinessState !== "ReadyForDns") {
    return {
      opsNextState: "AwaitingEvidence",
      nextAction: "close_private_api_runtime_evidence_before_dns",
      blockedSurface: "api_runtime",
      safeLocalCommand: "node scripts/validate-api-runtime-manual-evidence-intake.mjs && node scripts/validate-api-runtime-manual-evidence-checklist.mjs && node scripts/check-api-production-readiness.mjs",
      apiRuntimeManualEvidenceIntakePath: "ops/api-runtime-manual-evidence-intake-template.json",
      apiRuntimeManualEvidenceIntakeCommand: "node scripts/validate-api-runtime-manual-evidence-intake.mjs",
      apiRuntimeManualEvidenceChecklistPath: "ops/api-runtime-manual-evidence-checklist.md",
      apiRuntimeManualEvidenceChecklistCommand: "node scripts/validate-api-runtime-manual-evidence-checklist.mjs",
      manualEvidenceBoundary: "public-safe intake and checklist refs for runtime host, managed PostgreSQL, secret store, TLS, rollback path, private runtime witness, and DNS authority",
      productRuntimeClaimsAllowed: false,
      publicProductReleaseAllowed: false,
    };
  }

  if (apiExposureSolved) {
    return {
      opsNextState: "AwaitingEvidence",
      nextAction: "complete_govern_live_evidence_sequence_refs",
      blockedSurface: "govern_live_evidence_sequence_boundary",
      safeLocalCommand: "node scripts/validate-govern-live-evidence-sequence-preflight.mjs",
      packetPath: "ops/runtime-witness/mullu-govern-closure-packet.md",
      decisionRecordPath: "ops/mullu-govern-evaluate-write-route-decision.md",
      approvalPacketPath: "ops/mullu-govern-public-beta-approval-packet.md",
      liveEvidenceRefIntakePath: "ops/mullu-govern-live-evidence-ref-intake-template.json",
      liveEvidenceLocalIntakeSetupCommand: "node scripts/init-govern-live-evidence-local-intake.mjs",
      liveEvidenceOperatorRequestCommand: "node scripts/emit-govern-live-evidence-operator-request.mjs",
      liveEvidenceRefIntakeCommand: "node scripts/validate-govern-live-evidence-ref-intake.mjs",
      liveEvidenceRefStatusCommand: "node scripts/report-govern-live-evidence-ref-status.mjs",
      liveEvidenceRefChecklistPath: "ops/mullu-govern-live-evidence-ref-collection-checklist.md",
      operatorRunbookPath: "ops/mullu-govern-live-evidence-operator-runbook.md",
      sequencePreflightPath: "ops/mullu-govern-live-evidence-sequence-preflight.md",
      manualEvidenceBoundary: "live evidence sequence refs for product status promotion approval, public evaluate write-route approval, live contract execution approval, privacy activation approval, retention activation approval, dashboard operator-readiness evidence, public claim update evidence, and runtime witness evidence",
      productRuntimeClaimsAllowed: false,
      publicProductReleaseAllowed: false,
    };
  }

  return {
    opsNextState: "ReadyForDns",
    nextAction: "publish_only_api_dns_after_final_manual_review",
    blockedSurface: "none",
    safeLocalCommand: "node scripts/check-api-production-readiness.mjs --require-ready",
    manualEvidenceBoundary: "Cloudflare DNS mutation remains manual and must preserve apex, www, docs, and email surfaces",
    productRuntimeClaimsAllowed: false,
    publicProductReleaseAllowed: false,
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
    `product_runtime_witness_packet=${decision.packetPath || "none"}`,
    `product_write_route_decision_record=${decision.decisionRecordPath || "none"}`,
    `product_public_beta_approval_packet=${decision.approvalPacketPath || "none"}`,
    `product_live_evidence_ref_intake=${decision.liveEvidenceRefIntakePath || "none"}`,
    `product_live_evidence_local_intake_setup_command=${decision.liveEvidenceLocalIntakeSetupCommand || "none"}`,
    `product_live_evidence_operator_request_command=${decision.liveEvidenceOperatorRequestCommand || "none"}`,
    `product_live_evidence_ref_intake_command=${decision.liveEvidenceRefIntakeCommand || "none"}`,
    `product_live_evidence_ref_status_command=${decision.liveEvidenceRefStatusCommand || "none"}`,
    `product_live_evidence_ref_checklist=${decision.liveEvidenceRefChecklistPath || "none"}`,
    `product_live_evidence_operator_runbook=${decision.operatorRunbookPath || "none"}`,
    `product_live_evidence_sequence_preflight=${decision.sequencePreflightPath || "none"}`,
    `recovery_witness_state=${publicStateValue(evidence.recoveryWitnessState)}`,
    `api_provisioning_allowed=${evidence.apiProvisioningAllowed ? "true" : "false"}`,
    `domain_hardening_preflight=${publicStateValue(evidence.domainHardeningPreflight)}`,
    `domain_dns_mutation_allowed=${domainDnsMutationAllowed ? "true" : "false"}`,
    `api_exposure_state=${publicStateValue(evidence.apiExposureState)}`,
    `api_runtime_public_state=${publicStateValue(evidence.apiRuntimePublicState)}`,
    `api_production_readiness_state=${publicStateValue(evidence.apiReadiness.apiProductionReadinessState)}`,
    `api_runtime_manual_evidence_intake=${publicStateValue(evidence.apiRuntimeManualEvidenceIntake?.apiRuntimeManualEvidenceIntake)}`,
    `api_runtime_manual_evidence_intake_path=${decision.apiRuntimeManualEvidenceIntakePath || "none"}`,
    `api_runtime_manual_evidence_intake_command=${decision.apiRuntimeManualEvidenceIntakeCommand || "none"}`,
    `api_runtime_manual_evidence_checklist=${publicStateValue(evidence.apiRuntimeManualEvidenceChecklist?.apiRuntimeManualEvidenceChecklist)}`,
    `api_runtime_manual_evidence_checklist_path=${decision.apiRuntimeManualEvidenceChecklistPath || "none"}`,
    `api_runtime_manual_evidence_checklist_command=${decision.apiRuntimeManualEvidenceChecklistCommand || "none"}`,
    `api_dns_publication_allowed=${evidence.apiReadiness.apiDnsPublicationAllowed ? "true" : "false"}`,
    `product_runtime_claims_allowed=${decision.productRuntimeClaimsAllowed === true ? "true" : "false"}`,
    `public_product_release_allowed=${decision.publicProductReleaseAllowed === true ? "true" : "false"}`,
    `manual_evidence_missing_count=${evidence.apiRuntimeManualEvidenceChecklist?.manualEvidenceMissing?.length ?? evidence.apiReadiness.manualEvidenceMissing.length}`,
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
    productRuntimeWitnessPacket: decision.packetPath || "none",
    productWriteRouteDecisionRecord: decision.decisionRecordPath || "none",
    productPublicBetaApprovalPacket: decision.approvalPacketPath || "none",
    productLiveEvidenceRefIntake: decision.liveEvidenceRefIntakePath || "none",
    productLiveEvidenceLocalIntakeSetupCommand: decision.liveEvidenceLocalIntakeSetupCommand || "none",
    productLiveEvidenceOperatorRequestCommand: decision.liveEvidenceOperatorRequestCommand || "none",
    productLiveEvidenceRefIntakeCommand: decision.liveEvidenceRefIntakeCommand || "none",
    productLiveEvidenceRefStatusCommand: decision.liveEvidenceRefStatusCommand || "none",
    productLiveEvidenceRefChecklist: decision.liveEvidenceRefChecklistPath || "none",
    productLiveEvidenceOperatorRunbook: decision.operatorRunbookPath || "none",
    productLiveEvidenceSequencePreflight: decision.sequencePreflightPath || "none",
    recoveryWitnessState: publicStateValue(evidence.recoveryWitnessState),
    apiProvisioningAllowed: evidence.apiProvisioningAllowed,
    domainHardeningPreflight: publicStateValue(evidence.domainHardeningPreflight),
    domainDnsMutationAllowed,
    apiExposureState: publicStateValue(evidence.apiExposureState),
    apiRuntimePublicState: publicStateValue(evidence.apiRuntimePublicState),
    apiProductionReadinessState: publicStateValue(evidence.apiReadiness.apiProductionReadinessState),
    apiRuntimeManualEvidenceIntake: publicStateValue(evidence.apiRuntimeManualEvidenceIntake?.apiRuntimeManualEvidenceIntake),
    apiRuntimeManualEvidenceIntakePath: decision.apiRuntimeManualEvidenceIntakePath || "none",
    apiRuntimeManualEvidenceIntakeCommand: decision.apiRuntimeManualEvidenceIntakeCommand || "none",
    apiRuntimeManualEvidenceChecklist: publicStateValue(evidence.apiRuntimeManualEvidenceChecklist?.apiRuntimeManualEvidenceChecklist),
    apiRuntimeManualEvidenceChecklistPath: decision.apiRuntimeManualEvidenceChecklistPath || "none",
    apiRuntimeManualEvidenceChecklistCommand: decision.apiRuntimeManualEvidenceChecklistCommand || "none",
    apiDnsPublicationAllowed: evidence.apiReadiness.apiDnsPublicationAllowed,
    productRuntimeClaimsAllowed: decision.productRuntimeClaimsAllowed === true,
    publicProductReleaseAllowed: decision.publicProductReleaseAllowed === true,
    manualEvidenceMissingCount: evidence.apiRuntimeManualEvidenceChecklist?.manualEvidenceMissing?.length ?? evidence.apiReadiness.manualEvidenceMissing.length,
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
        error: `unsupported_args_count:${args.invalidArgs.length}`,
      }, null, 2));
      process.exit(1);
      return;
    }
    console.log(`ops_next_state=GovernanceBlocked\nproof_state=Fail\nerror=unsupported_args_count:${args.invalidArgs.length}`);
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
