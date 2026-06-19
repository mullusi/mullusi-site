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
const repoRootPrefix = `${repoRoot}${path.sep}`;
const defaultChecklistPath = "ops/mullu-govern-live-evidence-ref-collection-checklist.md";
const allowedArgs = new Set(["--json"]);

const requiredChecklistTerms = [
  { id: "collection_checklist_state", text: "collection_checklist_state=Ready" },
  { id: "solver_outcome", text: "solver_outcome=SolvedVerified" },
  { id: "proof_state", text: "proof_state=Pass" },
  { id: "ready_for_live_evidence", text: "ready_for_live_evidence=false" },
  { id: "public_write_route_allowed", text: "public_write_route_allowed=false" },
  { id: "intake_template", text: "intake_template=ops/mullu-govern-live-evidence-ref-intake-template.json" },
  {
    id: "intake_validator",
    text: "intake_validator=node scripts/validate-govern-live-evidence-ref-intake.mjs --require-complete",
  },
  { id: "secret_values_allowed", text: "secret_values_allowed=false" },
  { id: "raw_payloads_allowed", text: "raw_payloads_allowed=false" },
  { id: "provider_values_allowed", text: "provider_values_allowed=false" },
  { id: "status_block", text: "STATUS:" },
];

const requiredStopTerms = [
  { id: "private_value_stop", text: "private_value_must_not_enter_public_ref" },
  { id: "raw_payload_stop", text: "raw_payload_must_not_enter_public_ref" },
  { id: "ref_grammar_stop", text: "ref_grammar_invalid" },
  { id: "approval_packet_stop", text: "approval_packet_not_ready" },
];

const requiredForbiddenValueTerms = [
  { id: "secret", text: "secret" },
  { id: "token", text: "token" },
  { id: "raw_payload", text: "raw payload" },
  { id: "authorization_headers", text: "authorization headers" },
  { id: "account_ids", text: "account ids" },
  { id: "provider_host_values", text: "provider host values" },
  { id: "database_urls", text: "database URLs" },
];

function blockedResult(finding) {
  return {
    checklistState: "Blocked",
    findingCount: 1,
    findings: [finding],
    proofState: "Fail",
    readyForLiveEvidence: false,
    solverOutcome: "GovernanceBlocked",
  };
}

function readUtf8Result(relativePath) {
  if (typeof relativePath !== "string" || relativePath.trim() === "") {
    return { content: "", finding: "collection_checklist_path_invalid" };
  }

  const targetPath = path.resolve(repoRoot, relativePath);
  if (targetPath !== repoRoot && !targetPath.startsWith(repoRootPrefix)) {
    return { content: "", finding: "collection_checklist_path_outside_repo" };
  }

  try {
    return { content: fs.readFileSync(targetPath, "utf8"), finding: "" };
  } catch {
    return { content: "", finding: "collection_checklist_unreadable" };
  }
}

function unsupportedArgs(args) {
  return args.filter((arg) => arg.startsWith("--") && !allowedArgs.has(arg));
}

export function validateGovernLiveEvidenceRefCollectionChecklistContent(checklist) {
  const findings = [];

  for (const term of requiredChecklistTerms) {
    if (!checklist.includes(term.text)) findings.push(`required_checklist_term_missing:${term.id}`);
  }

  for (const key of requiredLiveEvidenceApprovalKeys) {
    if (!checklist.includes(`| \`${key}\` |`)) {
      findings.push(`required_approval_key_missing_from_table:${key}`);
    }
  }

  for (const term of requiredStopTerms) {
    if (!checklist.includes(term.text)) findings.push(`required_stop_condition_missing:${term.id}`);
  }

  for (const term of requiredForbiddenValueTerms) {
    if (!checklist.includes(term.text)) findings.push(`required_forbidden_value_term_missing:${term.id}`);
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
  const readResult = readUtf8Result(relativePath);
  if (readResult.finding) return blockedResult(readResult.finding);
  return validateGovernLiveEvidenceRefCollectionChecklistContent(readResult.content);
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
    findings: [`unsupported_args_count:${invalidArgs.length}`],
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
