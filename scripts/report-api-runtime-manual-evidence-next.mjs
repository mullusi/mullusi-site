/*
Purpose: report the next public-safe API runtime manual evidence ref to collect before api.mullusi.com DNS publication.
Governance scope: pre-DNS evidence sequencing, public-safe ref guidance, private-value exclusion, and DNS denial.
Dependencies: Node.js standard library, ops/api-runtime-manual-evidence-intake-template.json, and scripts/validate-api-runtime-manual-evidence-checklist.mjs.
Invariants: read-only; does not mutate checklist rows, contact providers, publish DNS, read secret stores, or print private values.
Test contract: run node scripts/test-report-api-runtime-manual-evidence-next.mjs.
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expectedEvidenceKeys } from "./validate-api-runtime-manual-evidence-checklist.mjs";
import {
  scanForbiddenEvidencePatterns,
  validatePublicSafeEvidenceRef,
} from "./govern-live-evidence-ref-contract.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const repoRootPrefix = `${repoRoot}${path.sep}`;
const defaultIntakePath = "ops/api-runtime-manual-evidence-intake-template.json";
const allowedArgs = new Set(["--json"]);

const evidenceGuidance = Object.freeze({
  production_image_published: {
    privateAction: "publish_versioned_api_image",
    acceptedRefs: ["github:actions/runs/NNN:api-image-published", "receipt://api-runtime/image-published/YYYY-MM-DD"],
  },
  runtime_host_ready: {
    privateAction: "provision_private_linux_runtime_host",
    acceptedRefs: ["render:event/host-ready-YYYY-MM-DD", "receipt://api-runtime/host-ready/YYYY-MM-DD"],
  },
  managed_postgres_ready: {
    privateAction: "provision_managed_postgres_with_backups",
    acceptedRefs: ["render:event/postgres-ready-YYYY-MM-DD", "receipt://api-runtime/postgres-ready/YYYY-MM-DD"],
  },
  schema_applied: {
    privateAction: "apply_production_schema",
    acceptedRefs: ["github:actions/runs/NNN:schema-applied", "receipt://api-runtime/schema-applied/YYYY-MM-DD"],
  },
  production_secrets_stored: {
    privateAction: "store_runtime_secrets_outside_git",
    acceptedRefs: ["receipt://api-runtime/secrets-stored/YYYY-MM-DD"],
  },
  deploy_env_check_ready: {
    privateAction: "run_deploy_environment_check",
    acceptedRefs: ["github:actions/runs/NNN:deploy-env-ready", "receipt://api-runtime/deploy-env-ready/YYYY-MM-DD"],
  },
  release_preflight_ready: {
    privateAction: "run_release_preflight",
    acceptedRefs: ["github:actions/runs/NNN:release-preflight-ready", "receipt://api-runtime/release-preflight-ready/YYYY-MM-DD"],
  },
  persistence_check_ready: {
    privateAction: "verify_managed_postgres_persistence",
    acceptedRefs: ["github:actions/runs/NNN:persistence-ready", "receipt://api-runtime/persistence-ready/YYYY-MM-DD"],
  },
  host_firewall_configured: {
    privateAction: "configure_required_host_firewall_only",
    acceptedRefs: ["receipt://api-runtime/firewall-configured/YYYY-MM-DD"],
  },
  tls_certificate_ready: {
    privateAction: "issue_tls_without_premature_dns_publication",
    acceptedRefs: ["cloudflare:audit/tls-ready-YYYY-MM-DD", "receipt://api-runtime/tls-ready/YYYY-MM-DD"],
  },
  rollback_path_defined: {
    privateAction: "confirm_api_only_rollback_path",
    acceptedRefs: ["site:ops/api-production-readiness-gate.md", "approval://api-runtime/rollback/YYYY-MM-DD/operator-approved"],
  },
  private_runtime_witness_ready: {
    privateAction: "collect_private_runtime_witness",
    acceptedRefs: ["github:actions/runs/NNN:private-runtime-witness-ready", "control-plane:receipt/runtime-witness-ready-YYYY-MM-DD"],
  },
  dns_authority_ready: {
    privateAction: "confirm_api_dns_authority_only",
    acceptedRefs: ["cloudflare:audit/dns-authority-YYYY-MM-DD", "approval://api-runtime/dns-authority/YYYY-MM-DD/operator-approved"],
  },
});

function readUtf8(relativePath) {
  const targetPath = path.resolve(repoRoot, relativePath);
  if (targetPath !== repoRoot && !targetPath.startsWith(repoRootPrefix)) {
    throw new Error("api_runtime_evidence_next_path_outside_repo");
  }
  return fs.readFileSync(targetPath, "utf8");
}

function publicErrorCode(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith("api_runtime_evidence_next_")) return message;
  if (message.includes("ENOENT")) return "api_runtime_evidence_next_file_unavailable";
  if (message.includes("JSON") || error instanceof SyntaxError) return "api_runtime_evidence_next_json_invalid";
  if (/secret|token|password|credential|postgres|private|D:\\|C:\\/i.test(message)) {
    return "api_runtime_evidence_next_unavailable";
  }
  return "api_runtime_evidence_next_unavailable";
}

export function evaluateApiRuntimeManualEvidenceNext(content) {
  const findings = scanForbiddenEvidencePatterns("apiRuntimeManualEvidenceNext", content);
  let intake = null;
  try {
    intake = JSON.parse(content);
  } catch {
    findings.push("intake_json_invalid");
  }

  const evidenceRefs = intake?.evidence_refs;
  if (!evidenceRefs || typeof evidenceRefs !== "object" || Array.isArray(evidenceRefs)) {
    findings.push("evidence_refs_object_missing");
  }

  for (const key of expectedEvidenceKeys) {
    const value = evidenceRefs?.[key];
    if (value === undefined) {
      findings.push(`evidence_ref_missing_key:${key}`);
      continue;
    }
    const refResult = validatePublicSafeEvidenceRef(value, { allowMissing: true });
    if (!refResult.valid) {
      for (const finding of refResult.findings) findings.push(`evidence_ref_invalid:${key}:${finding}`);
    }
  }
  for (const key of Object.keys(evidenceRefs || {})) {
    if (!expectedEvidenceKeys.includes(key)) findings.push("evidence_ref_unknown_key:present");
  }

  const nextKey = expectedEvidenceKeys.find((key) => evidenceRefs?.[key] === "missing") || "none";
  const guidance = evidenceGuidance[nextKey] ?? {
    privateAction: "none",
    acceptedRefs: ["none"],
  };
  const missingCount = expectedEvidenceKeys.filter((key) => evidenceRefs?.[key] === "missing").length;

  return {
    apiRuntimeManualEvidenceNext: findings.length === 0 ? (missingCount === 0 ? "SolvedVerified" : "AwaitingEvidence") : "GovernanceBlocked",
    solverOutcome: findings.length === 0 ? (missingCount === 0 ? "SolvedVerified" : "AwaitingEvidence") : "GovernanceBlocked",
    proofState: findings.length === 0 ? (missingCount === 0 ? "Pass" : "Unknown") : "Fail",
    readyForDns: findings.length === 0 && missingCount === 0,
    nextEvidenceKey: findings.length === 0 ? nextKey : "unknown",
    nextPrivateAction: findings.length === 0 ? guidance.privateAction : "unknown",
    acceptedRefExamples: findings.length === 0 ? guidance.acceptedRefs : ["unknown"],
    missingEvidenceRefCount: findings.length === 0 ? missingCount : expectedEvidenceKeys.length,
    findingCount: findings.length,
    findings,
  };
}

export function formatApiRuntimeManualEvidenceNextReport(result) {
  return [
    `api_runtime_manual_evidence_next=${result.apiRuntimeManualEvidenceNext}`,
    `solver_outcome=${result.solverOutcome}`,
    `proof_state=${result.proofState}`,
    `ready_for_dns=${result.readyForDns ? "true" : "false"}`,
    `next_evidence_key=${result.nextEvidenceKey}`,
    `next_private_action=${result.nextPrivateAction}`,
    `accepted_ref_examples=${result.acceptedRefExamples.join(",")}`,
    `missing_evidence_ref_count=${result.missingEvidenceRefCount}`,
    `finding_count=${result.findingCount}`,
    ...result.findings.map((finding) => `finding=${finding}`),
    "secret_values=not_read",
    "provider_values=not_read",
    "host_addresses=not_read",
    "database_urls=not_read",
    "dns_targets=not_read",
    "raw_payloads=not_read",
  ].join("\n");
}

function parseArgs(args) {
  const invalidArgs = args.filter((arg) => arg.startsWith("--") && !allowedArgs.has(arg) && !arg.startsWith("--path="));
  const pathArg = args.find((arg) => arg.startsWith("--path="));
  return {
    invalidArgs,
    outputJson: args.includes("--json"),
    intakePath: pathArg ? pathArg.slice("--path=".length) : defaultIntakePath,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.invalidArgs.length > 0) {
    const result = {
      apiRuntimeManualEvidenceNext: "GovernanceBlocked",
      solverOutcome: "GovernanceBlocked",
      proofState: "Fail",
      readyForDns: false,
      nextEvidenceKey: "unknown",
      nextPrivateAction: "unknown",
      acceptedRefExamples: ["unknown"],
      missingEvidenceRefCount: expectedEvidenceKeys.length,
      findingCount: 1,
      findings: [`unsupported_args_count:${args.invalidArgs.length}`],
    };
    if (args.outputJson) console.log(JSON.stringify(result, null, 2));
    else console.log(formatApiRuntimeManualEvidenceNextReport(result));
    process.exit(1);
    return;
  }

  try {
    const result = evaluateApiRuntimeManualEvidenceNext(readUtf8(args.intakePath));
    if (args.outputJson) console.log(JSON.stringify(result, null, 2));
    else console.log(formatApiRuntimeManualEvidenceNextReport(result));
    if (result.findings.length > 0) process.exit(1);
  } catch (error) {
    const result = {
      apiRuntimeManualEvidenceNext: "GovernanceBlocked",
      solverOutcome: "GovernanceBlocked",
      proofState: "Fail",
      readyForDns: false,
      nextEvidenceKey: "unknown",
      nextPrivateAction: "unknown",
      acceptedRefExamples: ["unknown"],
      missingEvidenceRefCount: expectedEvidenceKeys.length,
      findingCount: 1,
      findings: [`next_evidence_error:${publicErrorCode(error)}`],
    };
    if (args.outputJson) console.log(JSON.stringify(result, null, 2));
    else console.log(formatApiRuntimeManualEvidenceNextReport(result));
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
