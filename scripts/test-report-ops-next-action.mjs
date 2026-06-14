/*
Purpose: test the public-safe Mullusi next-action reporter.
Governance scope: blocked recovery guidance, domain evidence guidance, API evidence guidance, ready-for-DNS guidance, and CLI output safety.
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
}

function testDomainBlockFollowsRecoveryReadiness() {
  const decision = decideOpsNextAction(baseEvidence({
    domainHardeningPreflight: "GovernanceBlocked",
  }));
  assert.equal(decision.opsNextState, "AwaitingEvidence");
  assert.equal(decision.nextAction, "collect_domain_hardening_preflight_evidence");
  assert.equal(decision.blockedSurface, "domain_security_hardening");
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
}

function testReadyForDnsRequiresAllPriorGates() {
  const decision = decideOpsNextAction(baseEvidence());
  assert.equal(decision.opsNextState, "ReadyForDns");
  assert.equal(decision.nextAction, "publish_only_api_dns_after_final_manual_review");
  assert.equal(decision.blockedSurface, "none");
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
  assert.equal(decision.nextAction, "decide_product_evaluate_public_write_route");
  assert.equal(decision.blockedSurface, "product_evaluate_write_route_promotion_boundary");
  assert.equal(decision.packetPath, "ops/runtime-witness/mullu-govern-closure-packet.md");
  assert.equal(decision.decisionRecordPath, "ops/mullu-govern-evaluate-write-route-decision.md");
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
  assert.match(report, /product_runtime_witness_packet=none/);
  assert.match(report, /product_write_route_decision_record=none/);
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
  assert.equal(payload.manualEvidenceMissingCount, 1);
  assert.equal(payload.productRuntimeWitnessPacket, "none");
  assert.equal(payload.productWriteRouteDecisionRecord, "none");
  assert.equal(payload.secretValues, "not_recorded");
  assert.equal(Object.hasOwn(payload, "apiReadiness"), false);
}

function testCliReportsCurrentStateAndRejectsUnsupportedArgs() {
  const result = runReporter();
  assert.equal(result.status, 0);
  assert.match(result.stdout, /ops_next_state=/);
  assert.match(result.stdout, /private_recovery_values=not_read/);
  assert.match(result.stdout, /host_addresses=not_recorded/);

  const invalid = runReporter(["--invalid"]);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stdout, /ops_next_state=GovernanceBlocked/);
  assert.match(invalid.stdout, /unsupported_args:--invalid/);
}

function testCliJsonModeReportsStructuredFailure() {
  const current = runReporter(["--json"]);
  const payload = JSON.parse(current.stdout);
  assert.equal(current.status, 0);
  assert.equal(typeof payload.opsNextState, "string");
  assert.equal(payload.privateRecoveryValues, "not_read");
  assert.equal(Object.hasOwn(payload, "apiReadiness"), false);

  const invalid = runReporter(["--json", "--invalid"]);
  const invalidPayload = JSON.parse(invalid.stdout);
  assert.equal(invalid.status, 1);
  assert.equal(invalidPayload.opsNextState, "GovernanceBlocked");
  assert.equal(invalidPayload.proofState, "Fail");
  assert.equal(invalidPayload.error, "unsupported_args:--invalid");
}

testRecoveryBlockIsFirstPriority();
testDomainBlockFollowsRecoveryReadiness();
testApiBlockFollowsDomainReadiness();
testReadyForDnsRequiresAllPriorGates();
testSolvedApiExposureMovesToProductRuntimeWitness();
testFormattedReportStaysPublicSafe();
testFormattedJsonStaysPublicSafeAndStructured();
testCliReportsCurrentStateAndRejectsUnsupportedArgs();
testCliJsonModeReportsStructuredFailure();

console.log("ops next-action reporter tests passed");
