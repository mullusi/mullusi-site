/*
Purpose: validate the public-safe Mullu Govern live evidence ref collection checklist.
Governance scope: checklist completeness, accepted ref shapes, forbidden value classes, non-operative collection state, and no-secret evidence.
Dependencies: Node.js standard library, ops/mullu-govern-live-evidence-ref-collection-checklist.md, and scripts/govern-live-evidence-ref-contract.mjs.
Invariants: read-only; does not approve live evidence collection, publish routes, mutate DNS/runtime/auth, read providers, or print private values.
Test contract: run node scripts/test-validate-govern-live-evidence-ref-collection-checklist.mjs.
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  requiredLiveEvidenceApprovalKeys,
  scanForbiddenEvidencePatterns,
} from "./govern-live-evidence-ref-contract.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const defaultChecklistPath = "ops/mullu-govern-live-evidence-ref-collection-checklist.md";
const allowedArgs = new Set(["--json"]);

const requiredChecklistTerms = [
  "collection_checklist_state=Ready",
  "solver_outcome=SolvedVerified",
  "proof_state=Pass",
  "ready_for_live_evidence=false",
  "public_write_route_allowed=false",
  "intake_template=ops/mullu-govern-live-evidence-ref-intake-template.json",
  "intake_validator=node scripts/validate-govern-live-evidence-ref-intake.mjs --require-complete",
  "secret_values_allowed=false",
  "raw_payloads_allowed=false",
  "provider_values_allowed=false",
  "STATUS:",
];

const requiredStopTerms = [
  "private_value_must_not_enter_public_ref",
  "raw_payload_must_not_enter_public_ref",
  "ref_grammar_invalid",
  "approval_packet_not_ready",
];

const requiredForbiddenValueTerms = [
  "secret",
  "token",
  "raw payload",
  "authorization headers",
  "account ids",
  "provider host values",
  "database URLs",
];

function readUtf8(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function unsupportedArgs(args) {
  return args.filter((arg) => arg.startsWith("--") && !allowedArgs.has(arg));
}

export function validateGovernLiveEvidenceRefCollectionChecklistContent(checklist) {
  const findings = [];

  for (const term of requiredChecklistTerms) {
    if (!checklist.includes(term)) findings.push(`required_checklist_term_missing:${term}`);
  }

  for (const key of requiredLiveEvidenceApprovalKeys) {
    if (!checklist.includes(`| \`${key}\` |`)) {
      findings.push(`required_approval_key_missing_from_table:${key}`);
    }
  }

  for (const term of requiredStopTerms) {
    if (!checklist.includes(term)) findings.push(`required_stop_condition_missing:${term}`);
  }

  for (const term of requiredForbiddenValueTerms) {
    if (!checklist.includes(term)) findings.push(`required_forbidden_value_term_missing:${term}`);
  }

  findings.push(...scanForbiddenEvidencePatterns("collectionChecklist", checklist));

  return {
    checklistState: findings.length === 0 ? "Ready" : "Blocked",
    findingCount: findings.length,
    findings,
    proofState: findings.length === 0 ? "Pass" : "Fail",
    readyForLiveEvidence: false,
    solverOutcome: findings.length === 0 ? "SolvedVerified" : "GovernanceBlocked",
  };
}

export function validateGovernLiveEvidenceRefCollectionChecklist(relativePath = defaultChecklistPath) {
  return validateGovernLiveEvidenceRefCollectionChecklistContent(readUtf8(relativePath));
}

export function formatGovernLiveEvidenceRefCollectionChecklistReport(result) {
  return [
    `govern_live_evidence_ref_collection_checklist=${result.solverOutcome}`,
    `proof_state=${result.proofState}`,
    `collection_checklist_state=${result.checklistState}`,
    `ready_for_live_evidence=${result.readyForLiveEvidence ? "true" : "false"}`,
    `finding_count=${result.findingCount}`,
    ...result.findings.map((finding) => `finding=${finding}`),
    "secret_values=not_recorded",
    "provider_values=not_recorded",
    "raw_payloads=not_recorded",
  ].join("\n");
}

function blockedResultForInvalidArgs(invalidArgs) {
  return {
    checklistState: "Blocked",
    findingCount: invalidArgs.length,
    findings: [`unsupported_args:${invalidArgs.join(",")}`],
    proofState: "Fail",
    readyForLiveEvidence: false,
    solverOutcome: "GovernanceBlocked",
  };
}

function main() {
  const args = process.argv.slice(2);
  const invalidArgs = unsupportedArgs(args);
  if (invalidArgs.length > 0) {
    const result = blockedResultForInvalidArgs(invalidArgs);
    if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
    else console.log(formatGovernLiveEvidenceRefCollectionChecklistReport(result));
    process.exit(1);
    return;
  }

  const result = validateGovernLiveEvidenceRefCollectionChecklist();
  if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
  else console.log(formatGovernLiveEvidenceRefCollectionChecklistReport(result));
  if (result.findings.length > 0) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
