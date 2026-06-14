/*
Purpose: test the Mullu Govern support readiness validator.
Governance scope: support contact routing, incident intake, fail-closed public write-route boundary, unsupported args, and no-secret pattern rejection.
Dependencies: Node.js standard library and scripts/validate-govern-support-readiness.mjs.
Invariants: tests use public-safe repository evidence or synthetic fixtures only; they never contact mailboxes or provider dashboards.
*/

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatGovernSupportReadinessReport,
  validateGovernSupportReadiness,
  validateGovernSupportReadinessEvidence,
} from "./validate-govern-support-readiness.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptsDir, "..");
const validatorScript = path.join(scriptsDir, "validate-govern-support-readiness.mjs");

function runValidator(args = []) {
  return spawnSync(process.execPath, [validatorScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function validEvidence(overrides = {}) {
  return {
    approvalPacket: "public_write_route_allowed=false\nsupport_readiness_ref=site:ops/mullu-govern-support-readiness.md\n",
    contactPage: '<a href="mailto:support@mullusi.com">support@mullusi.com</a>',
    manifest: { ownership: { supportEmail: "support@mullusi.com" } },
    privacyPage: '<a href="mailto:support@mullusi.com?subject=Mullusi%20privacy%20question">support@mullusi.com</a>',
    privateValueScanSources: {
      approvalPacket: "public_write_route_allowed=false\nsupport_readiness_ref=site:ops/mullu-govern-support-readiness.md\n",
      witness: [
        "support_readiness_state=Ready",
        "solver_outcome=SolvedVerified",
        "proof_state=Pass",
        "public_write_route_allowed=false",
        "support_contact=support@mullusi.com",
        "contact_route=/contact/",
        "privacy_contact=support@mullusi.com",
        "responsible_disclosure_route=/responsible-disclosure/",
        "route_publication_action=none",
        "dns_mutation=none",
        "runtime_mutation=none",
        "secret_rotation_required=false",
        "customer_sla=not_published",
        "external_ticketing_system=not_claimed",
        "STATUS:",
      ].join("\n"),
    },
    responsibleDisclosurePage: "<h1>Responsible Disclosure</h1>",
    securityTxt: "Contact: mailto:support@mullusi.com\nPolicy: https://mullusi.com/responsible-disclosure/\n",
    witness: [
      "support_readiness_state=Ready",
      "solver_outcome=SolvedVerified",
      "proof_state=Pass",
      "public_write_route_allowed=false",
      "support_contact=support@mullusi.com",
      "contact_route=/contact/",
      "privacy_contact=support@mullusi.com",
      "responsible_disclosure_route=/responsible-disclosure/",
      "route_publication_action=none",
      "dns_mutation=none",
      "runtime_mutation=none",
      "secret_rotation_required=false",
      "customer_sla=not_published",
      "external_ticketing_system=not_claimed",
      "STATUS:",
    ].join("\n"),
    ...overrides,
  };
}

function testCurrentSupportReadinessPasses() {
  const result = validateGovernSupportReadiness();
  const report = formatGovernSupportReadinessReport(result);

  assert.equal(result.solverOutcome, "SolvedVerified");
  assert.equal(result.proofState, "Pass");
  assert.equal(result.supportReadinessState, "Ready");
  assert.equal(result.publicWriteRouteAllowed, false);
  assert.equal(result.findings.length, 0);
  assert.match(report, /support_contact=support@mullusi.com/);
  assert.match(report, /secret_values=not_recorded/);
}

function testSyntheticMissingSupportContactFailsClosed() {
  const evidence = validEvidence({
    contactPage: "<a>hello@mullusi.com</a>",
  });
  const result = validateGovernSupportReadinessEvidence(evidence);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.supportReadinessState, "Blocked");
  assert.equal(result.publicWriteRouteAllowed, false);
  assert.match(result.findings.join("\n"), /contact_route_support_mailto_missing/);
}

function testSyntheticSecretPatternFailsClosed() {
  const evidence = validEvidence({
    privateValueScanSources: {
      approvalPacket: "public_write_route_allowed=false\nsupport_readiness_ref=site:ops/mullu-govern-support-readiness.md\n",
      witness: "Bearer abcdefghijklmnopqrstuvwxyz123456",
    },
  });
  const result = validateGovernSupportReadinessEvidence(evidence);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.publicWriteRouteAllowed, false);
  assert.match(result.findings.join("\n"), /forbidden_private_value_pattern:witness:bearer_token/);
}

function testSyntheticMalformedSupportRefFailsClosed() {
  const evidence = validEvidence({
    approvalPacket: "public_write_route_allowed=false\nsupport_readiness_ref=ops/mullu-govern-support-readiness.md\n",
  });
  const result = validateGovernSupportReadinessEvidence(evidence);

  assert.equal(result.solverOutcome, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.publicWriteRouteAllowed, false);
  assert.match(result.findings.join("\n"), /approval_packet_support_readiness_ref_invalid:ops\/mullu-govern-support-readiness.md/);
  assert.match(result.findings.join("\n"), /approval_packet_support_readiness_ref_invalid:evidence_ref_family_not_allowed/);
}

function testCliJsonAndUnsupportedArgs() {
  const jsonResult = runValidator(["--json"]);
  const payload = JSON.parse(jsonResult.stdout);
  assert.equal(jsonResult.status, 0);
  assert.equal(payload.solverOutcome, "SolvedVerified");
  assert.equal(payload.proofState, "Pass");

  const invalid = runValidator(["--unknown"]);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stdout, /unsupported_args:--unknown/);
  assert.match(invalid.stdout, /govern_support_readiness=GovernanceBlocked/);
}

testCurrentSupportReadinessPasses();
testSyntheticMissingSupportContactFailsClosed();
testSyntheticSecretPatternFailsClosed();
testSyntheticMalformedSupportRefFailsClosed();
testCliJsonAndUnsupportedArgs();

console.log("govern support readiness validator tests passed");
