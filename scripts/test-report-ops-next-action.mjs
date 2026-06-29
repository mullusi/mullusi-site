/*
Purpose: test the public-safe Mullusi next-action reporter.
Governance scope: blocked recovery guidance, domain evidence guidance, API evidence guidance, live evidence sequence guidance, ready-for-DNS guidance, and CLI output safety.
Dependencies: Node.js standard library and scripts/report-ops-next-action.mjs.
Invariants: tests use synthetic aggregate state and never inspect private recovery inventories or provider dashboards.
*/

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decideOpsNextAction, formatOpsNextJson, formatOpsNextReport } from "./report-ops-next-action.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptsDir, "..");
const reporterScript = path.join(scriptsDir, "report-ops-next-action.mjs");

function baseEvidence(overrides = {}) {
  return {
    recoveryWitnessState: "ReadyForProvisioning",
    apiProvisioningAllowed: true,
    domainHardeningPreflight: "SolvedVerified",
    manualCaaAllowed: true,
    dkimPublicationAllowed: true,
    spfHardfailAllowed: true,
    dmarcEnforcementAllowed: true,
    mtaStsEnforceAllowed: true,
    tlsRptPublicationAllowed: true,
    apiExposureState: "AwaitingEvidence",
    apiExposureDnsAllowed: false,
    apiRuntimePublicState: "AwaitingEvidence",
    apiReadiness: {
      apiProductionReadinessState: "ReadyForDns",
      apiDnsPublicationAllowed: true,
      manualEvidenceMissing: [],
      closedWitnessCount: 1,
    },
    apiRuntimeManualEvidenceIntake: {
      apiRuntimeManualEvidenceIntake: "SolvedVerified",
    },
    apiRuntimeManualEvidenceChecklist: {
      apiRuntimeManualEvidenceChecklist: "SolvedVerified",
      manualEvidenceMissing: [],
    },
    ...overrides,
  };
}

function solvedApiExposureEvidence(overrides = {}) {
  return baseEvidence({
    apiExposureState: "SolvedVerified",
    apiExposureDnsAllowed: true,
    apiRuntimePublicState: "SolvedVerified",
    ...overrides,
  });
}

function runReporter(args = []) {
  return spawnSync(process.execPath, [reporterScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function testRecoveryBlockIsFirstPriority() {
  const decision = decideOpsNextAction(baseEvidence({
    recoveryWitnessState: "AwaitingEvidence",
    apiProvisioningAllowed: false,
    domainHardeningPreflight: "SolvedVerified",
  }));
  assert.equal(decision.opsNextState, "AwaitingEvidence");
  assert.equal(decision.nextAction, "complete_private_recovery_inventory_outside_git");
  assert.equal(decision.blockedSurface, "root_recovery");
  assert.equal(decision.productRuntimeClaimsAllowed, false);
  assert.equal(decision.publicProductReleaseAllowed, false);
}

function testDomainBlockFollowsRecoveryReadiness() {
  const decision = decideOpsNextAction(baseEvidence({
    domainHardeningPreflight: "GovernanceBlocked",
  }));
  assert.equal(decision.opsNextState, "AwaitingEvidence");
  assert.equal(decision.nextAction, "collect_domain_hardening_preflight_evidence");
  assert.equal(decision.blockedSurface, "domain_security_hardening");
  assert.equal(decision.productRuntimeClaimsAllowed, false);
  assert.equal(decision.publicProductReleaseAllowed, false);
}

function testApiBlockFollowsDomainReadiness() {
  const decision = decideOpsNextAction(baseEvidence({
    apiReadiness: {
      apiProductionReadinessState: "Blocked",
      apiDnsPublicationAllowed: false,
      manualEvidenceMissing: ["runtime_host_ready"],
      closedWitnessCount: 0,
    },
  }));
  assert.equal(decision.opsNextState, "AwaitingEvidence");
  assert.equal(decision.nextAction, "close_private_api_runtime_evidence_before_dns");
  assert.equal(decision.blockedSurface, "api_runtime");
  assert.equal(decision.safeLocalCommand, "node scripts/validate-api-runtime-manual-evidence-intake.mjs && node scripts/validate-api-runtime-manual-evidence-checklist.mjs && node scripts/check-api-production-readiness.mjs");
  assert.equal(decision.apiRuntimeManualEvidenceIntakePath, "ops/api-runtime-manual-evidence-intake-template.json");
  assert.equal(decision.apiRuntimeManualEvidenceIntakeCommand, "node scripts/validate-api-runtime-manual-evidence-intake.mjs");
  assert.equal(decision.apiRuntimeManualEvidenceChecklistPath, "ops/api-runtime-manual-evidence-checklist.md");
  assert.equal(decision.apiRuntimeManualEvidenceChecklistCommand, "node scripts/validate-api-runtime-manual-evidence-checklist.mjs");
  assert.equal(decision.productRuntimeClaimsAllowed, false);
  assert.equal(decision.publicProductReleaseAllowed, false);
  assert.match(decision.manualEvidenceBoundary, /public-safe intake and checklist refs/);
}

function testReadyForDnsRequiresAllPriorGates() {
  const decision = decideOpsNextAction(baseEvidence());
  assert.equal(decision.opsNextState, "ReadyForDns");
  assert.equal(decision.nextAction, "publish_only_api_dns_after_final_manual_review");
  assert.equal(decision.blockedSurface, "none");
  assert.equal(decision.productRuntimeClaimsAllowed, false);
  assert.equal(decision.publicProductReleaseAllowed, false);
}

function testSolvedApiExposureMovesToProductRuntimeWitness() {
  const decision = decideOpsNextAction(solvedApiExposureEvidence({
    apiReadiness: {
      apiProductionReadinessState: "AwaitingEvidence",
      apiDnsPublicationAllowed: false,
      manualEvidenceMissing: ["production_image_published"],
      closedWitnessCount: 0,
    },
  }));

  assert.equal(decision.opsNextState, "AwaitingEvidence");
  assert.equal(decision.nextAction, "complete_govern_live_evidence_sequence_refs");
  assert.equal(decision.blockedSurface, "govern_live_evidence_sequence_boundary");
  assert.equal(decision.safeLocalCommand, "node scripts/validate-govern-live-evidence-sequence-preflight.mjs");
  assert.equal(decision.packetPath, "ops/runtime-witness/mullu-govern-closure-packet.md");
  assert.equal(decision.decisionRecordPath, "ops/mullu-govern-evaluate-write-route-decision.md");
  assert.equal(decision.approvalPacketPath, "ops/mullu-govern-public-beta-approval-packet.md");
  assert.equal(decision.liveEvidenceRefIntakePath, "ops/mullu-govern-live-evidence-ref-intake-template.json");
  assert.equal(decision.liveEvidenceLocalIntakeSetupCommand, "node scripts/init-govern-live-evidence-local-intake.mjs");
  assert.equal(decision.liveEvidenceOperatorRequestCommand, "node scripts/emit-govern-live-evidence-operator-request.mjs");
  assert.equal(decision.liveEvidenceRefIntakeCommand, "node scripts/validate-govern-live-evidence-ref-intake.mjs");
  assert.equal(decision.liveEvidenceRefStatusCommand, "node scripts/report-govern-live-evidence-ref-status.mjs");
  assert.equal(decision.liveEvidenceRefChecklistPath, "ops/mullu-govern-live-evidence-ref-collection-checklist.md");
  assert.equal(decision.operatorRunbookPath, "ops/mullu-govern-live-evidence-operator-runbook.md");
  assert.equal(decision.sequencePreflightPath, "ops/mullu-govern-live-evidence-sequence-preflight.md");
  assert.equal(decision.productRuntimeClaimsAllowed, false);
  assert.equal(decision.publicProductReleaseAllowed, false);
  const report = formatOpsNextReport(solvedApiExposureEvidence(), decision);
  const payload = formatOpsNextJson(solvedApiExposureEvidence(), decision);
  assert.match(report, /product_live_evidence_ref_checklist=ops\/mullu-govern-live-evidence-ref-collection-checklist.md/);
  assert.match(report, /product_live_evidence_local_intake_setup_command=node scripts\/init-govern-live-evidence-local-intake.mjs/);
  assert.match(report, /product_live_evidence_operator_request_command=node scripts\/emit-govern-live-evidence-operator-request.mjs/);
  assert.match(report, /product_live_evidence_ref_status_command=node scripts\/report-govern-live-evidence-ref-status.mjs/);
  assert.equal(payload.productLiveEvidenceRefChecklist, "ops/mullu-govern-live-evidence-ref-collection-checklist.md");
  assert.equal(payload.productLiveEvidenceLocalIntakeSetupCommand, "node scripts/init-govern-live-evidence-local-intake.mjs");
  assert.equal(payload.productLiveEvidenceOperatorRequestCommand, "node scripts/emit-govern-live-evidence-operator-request.mjs");
  assert.equal(payload.productLiveEvidenceRefStatusCommand, "node scripts/report-govern-live-evidence-ref-status.mjs");
  assert.match(decision.manualEvidenceBoundary, /live evidence sequence refs/);
  assert.match(decision.manualEvidenceBoundary, /product status promotion approval/);
  assert.match(decision.manualEvidenceBoundary, /privacy activation approval/);
  assert.match(decision.manualEvidenceBoundary, /retention activation approval/);
  assert.match(decision.manualEvidenceBoundary, /dashboard operator-readiness evidence/);
  assert.match(decision.manualEvidenceBoundary, /public claim update evidence/);
  assert.match(decision.manualEvidenceBoundary, /live contract execution approval/);
  assert.doesNotMatch(decision.manualEvidenceBoundary, /support readiness/);
  assert.doesNotMatch(decision.manualEvidenceBoundary, /product rollback/);
}

function testFormattedReportStaysPublicSafe() {
  const evidence = baseEvidence({
    recoveryWitnessState: "AwaitingEvidence",
    apiProvisioningAllowed: false,
    manualCaaAllowed: false,
  });
  const decision = decideOpsNextAction(evidence);
  const report = formatOpsNextReport(evidence, decision);
  assert.match(report, /ops_next_state=AwaitingEvidence/);
  assert.match(report, /domain_dns_mutation_allowed=false/);
  assert.match(report, /api_exposure_state=AwaitingEvidence/);
  assert.match(report, /api_runtime_manual_evidence_intake=/);
  assert.match(report, /api_runtime_manual_evidence_intake_path=none/);
  assert.match(report, /api_runtime_manual_evidence_intake_command=none/);
  assert.match(report, /api_runtime_manual_evidence_checklist=/);
  assert.match(report, /api_runtime_manual_evidence_checklist_path=none/);
  assert.match(report, /api_runtime_manual_evidence_checklist_command=none/);
  assert.match(report, /product_runtime_claims_allowed=false/);
  assert.match(report, /public_product_release_allowed=false/);
  assert.match(report, /product_runtime_witness_packet=none/);
  assert.match(report, /product_write_route_decision_record=none/);
  assert.match(report, /product_public_beta_approval_packet=none/);
  assert.match(report, /product_live_evidence_ref_intake=none/);
  assert.match(report, /product_live_evidence_local_intake_setup_command=none/);
  assert.match(report, /product_live_evidence_operator_request_command=none/);
  assert.match(report, /product_live_evidence_ref_intake_command=none/);
  assert.match(report, /product_live_evidence_ref_status_command=none/);
  assert.match(report, /product_live_evidence_ref_checklist=none/);
  assert.match(report, /product_live_evidence_operator_runbook=none/);
  assert.match(report, /product_live_evidence_sequence_preflight=none/);
  assert.match(report, /secret_values=not_recorded/);
  assert.doesNotMatch(report, /postgres:\/\//i);
}

function testFormattedJsonStaysPublicSafeAndStructured() {
  const evidence = baseEvidence({
    apiReadiness: {
      apiProductionReadinessState: "Blocked",
      apiDnsPublicationAllowed: false,
      manualEvidenceMissing: ["runtime_host_ready"],
      closedWitnessCount: 0,
    },
  });
  const decision = decideOpsNextAction(evidence);
  const payload = formatOpsNextJson(evidence, decision);

  assert.equal(payload.opsNextState, "AwaitingEvidence");
  assert.equal(payload.apiProductionReadinessState, "Blocked");
  assert.equal(payload.apiRuntimeManualEvidenceIntake, "SolvedVerified");
  assert.equal(payload.apiRuntimeManualEvidenceIntakePath, "ops/api-runtime-manual-evidence-intake-template.json");
  assert.equal(payload.apiRuntimeManualEvidenceIntakeCommand, "node scripts/validate-api-runtime-manual-evidence-intake.mjs");
  assert.equal(payload.apiRuntimeManualEvidenceChecklist, "SolvedVerified");
  assert.equal(payload.apiRuntimeManualEvidenceChecklistPath, "ops/api-runtime-manual-evidence-checklist.md");
  assert.equal(payload.apiRuntimeManualEvidenceChecklistCommand, "node scripts/validate-api-runtime-manual-evidence-checklist.mjs");
  assert.equal(payload.manualEvidenceMissingCount, 0);
  assert.equal(payload.productRuntimeClaimsAllowed, false);
  assert.equal(payload.publicProductReleaseAllowed, false);
  assert.equal(payload.productRuntimeWitnessPacket, "none");
  assert.equal(payload.productWriteRouteDecisionRecord, "none");
  assert.equal(payload.productPublicBetaApprovalPacket, "none");
  assert.equal(payload.productLiveEvidenceRefIntake, "none");
  assert.equal(payload.productLiveEvidenceLocalIntakeSetupCommand, "none");
  assert.equal(payload.productLiveEvidenceOperatorRequestCommand, "none");
  assert.equal(payload.productLiveEvidenceRefIntakeCommand, "none");
  assert.equal(payload.productLiveEvidenceRefStatusCommand, "none");
  assert.equal(payload.productLiveEvidenceRefChecklist, "none");
  assert.equal(payload.productLiveEvidenceOperatorRunbook, "none");
  assert.equal(payload.productLiveEvidenceSequencePreflight, "none");
  assert.equal(payload.secretValues, "not_recorded");
  assert.equal(Object.hasOwn(payload, "apiReadiness"), false);
}

function testUnexpectedStateValuesAreRedacted() {
  const evidence = baseEvidence({
    recoveryWitnessState: "private/recovery-state",
    domainHardeningPreflight: "postgres://user:password@private.example/db",
    apiExposureState: "C:\\secret\\api-exposure.txt",
    apiRuntimePublicState: "private-runtime-host",
    apiRuntimeManualEvidenceIntake: {
      apiRuntimeManualEvidenceIntake: "D:\\private\\intake.json",
    },
    apiRuntimeManualEvidenceChecklist: {
      apiRuntimeManualEvidenceChecklist: "D:\\private\\checklist.json",
      manualEvidenceMissing: [],
    },
    apiReadiness: {
      apiProductionReadinessState: "D:\\private\\readiness.json",
      apiDnsPublicationAllowed: false,
      manualEvidenceMissing: [],
      closedWitnessCount: 0,
    },
  });
  const decision = decideOpsNextAction(evidence);
  const report = formatOpsNextReport(evidence, decision);
  const payload = formatOpsNextJson(evidence, decision);

  assert.match(report, /recovery_witness_state=redacted_value/);
  assert.match(report, /domain_hardening_preflight=redacted_value/);
  assert.match(report, /api_exposure_state=redacted_value/);
  assert.match(report, /api_runtime_public_state=redacted_value/);
  assert.match(report, /api_production_readiness_state=redacted_value/);
  assert.match(report, /api_runtime_manual_evidence_intake=redacted_value/);
  assert.match(report, /api_runtime_manual_evidence_checklist=redacted_value/);
  assert.equal(payload.recoveryWitnessState, "redacted_value");
  assert.equal(payload.domainHardeningPreflight, "redacted_value");
  assert.equal(payload.apiExposureState, "redacted_value");
  assert.equal(payload.apiRuntimePublicState, "redacted_value");
  assert.equal(payload.apiProductionReadinessState, "redacted_value");
  assert.equal(payload.apiRuntimeManualEvidenceIntake, "redacted_value");
  assert.equal(payload.apiRuntimeManualEvidenceChecklist, "redacted_value");
  assert.doesNotMatch(report, /private\/recovery-state|postgres:\/\/user:password@private\.example\/db|C:\\secret\\api-exposure\.txt|private-runtime-host|D:\\private\\readiness\.json|D:\\private\\intake\.json|D:\\private\\checklist\.json/i);
  assert.doesNotMatch(JSON.stringify(payload), /private\/recovery-state|postgres:\/\/user:password@private\.example\/db|C:\\secret\\api-exposure\.txt|private-runtime-host|D:\\private\\readiness\.json|D:\\private\\intake\.json|D:\\private\\checklist\.json/i);
}

function testCliReportsCurrentStateAndRejectsUnsupportedArgs() {
  const result = runReporter();
  assert.equal(result.status, 0);
  assert.match(result.stdout, /ops_next_state=/);
  assert.match(result.stdout, /private_recovery_values=not_read/);
  assert.match(result.stdout, /host_addresses=not_recorded/);
  assert.match(result.stdout, /api_runtime_manual_evidence_intake=SolvedVerified/);
  assert.match(result.stdout, /api_runtime_manual_evidence_intake_path=ops\/api-runtime-manual-evidence-intake-template\.json/);
  assert.match(result.stdout, /api_runtime_manual_evidence_checklist=AwaitingEvidence/);
  assert.match(result.stdout, /api_runtime_manual_evidence_checklist_path=ops\/api-runtime-manual-evidence-checklist\.md/);
  assert.match(result.stdout, /manual_evidence_missing_count=11/);

  const invalid = runReporter(["--invalid"]);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stdout, /ops_next_state=GovernanceBlocked/);
  assert.match(invalid.stdout, /unsupported_args_count:1/);
  assert.doesNotMatch(invalid.stdout, /--invalid/);
}

function testCliJsonModeReportsStructuredFailure() {
  const current = runReporter(["--json"]);
  const payload = JSON.parse(current.stdout);
  assert.equal(current.status, 0);
  assert.equal(typeof payload.opsNextState, "string");
  assert.equal(payload.privateRecoveryValues, "not_read");
  assert.equal(payload.manualEvidenceMissingCount, 11);
  assert.equal(Object.hasOwn(payload, "apiReadiness"), false);

  const invalid = runReporter(["--json", "--invalid"]);
  const invalidPayload = JSON.parse(invalid.stdout);
  assert.equal(invalid.status, 1);
  assert.equal(invalidPayload.opsNextState, "GovernanceBlocked");
  assert.equal(invalidPayload.proofState, "Fail");
  assert.equal(invalidPayload.error, "unsupported_args_count:1");
  assert.doesNotMatch(invalid.stdout, /--invalid/);
}

testRecoveryBlockIsFirstPriority();
testDomainBlockFollowsRecoveryReadiness();
testApiBlockFollowsDomainReadiness();
testReadyForDnsRequiresAllPriorGates();
testSolvedApiExposureMovesToProductRuntimeWitness();
testFormattedReportStaysPublicSafe();
testFormattedJsonStaysPublicSafeAndStructured();
testUnexpectedStateValuesAreRedacted();
testCliReportsCurrentStateAndRejectsUnsupportedArgs();
testCliJsonModeReportsStructuredFailure();

console.log("ops next-action reporter tests passed");
