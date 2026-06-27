/*
Purpose: initialize the ignored local Mullu Govern live evidence ref intake file from the committed template.
Governance scope: local-only intake bootstrap, overwrite protection, template validation, and no-secret output.
Dependencies: Node.js standard library and scripts/validate-govern-live-evidence-ref-intake.mjs.
Invariants: writes only a .local.json file inside this repository; does not mutate committed templates, approval packets, routes, privacy, retention, runtime witnesses, provider systems, or secret stores.
Test contract: run node scripts/test-init-govern-live-evidence-local-intake.mjs.
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  validateGovernLiveEvidenceRefIntakeContent,
} from "./validate-govern-live-evidence-ref-intake.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const repoRootPrefix = `${repoRoot}${path.sep}`;
const defaultTemplatePath = "ops/mullu-govern-live-evidence-ref-intake-template.json";
const defaultTargetPath = "ops/mullu-govern-live-evidence-ref-intake.local.json";
const allowedArgs = new Set(["--help", "-h", "--json", "--force"]);

function usage() {
  return [
    "Usage:",
    "  node scripts/init-govern-live-evidence-local-intake.mjs [--force] [--json]",
    "",
    "Initializes ops/mullu-govern-live-evidence-ref-intake.local.json from the committed template.",
  ].join("\n");
}

function unsupportedArgs(args) {
  return args.filter((arg) => arg.startsWith("--") && !allowedArgs.has(arg) && !arg.startsWith("--target="));
}

function targetArg(args) {
  const match = args.find((arg) => arg.startsWith("--target="));
  return match ? match.slice("--target=".length) : defaultTargetPath;
}

function safeResolve(relativePath) {
  if (typeof relativePath !== "string" || relativePath.trim() === "") {
    return { finding: "target_path_invalid", path: "" };
  }
  const resolvedPath = path.resolve(repoRoot, relativePath);
  if (resolvedPath !== repoRoot && !resolvedPath.startsWith(repoRootPrefix)) {
    return { finding: "target_path_outside_repo", path: "" };
  }
  if (!relativePath.endsWith(".local.json")) {
    return { finding: "target_must_end_with_local_json", path: "" };
  }
  return { finding: "", path: resolvedPath };
}

function blockedResult(finding, targetPath = "not_written") {
  return {
    findingCount: 1,
    findings: [finding],
    initialized: false,
    proofState: "Fail",
    solverOutcome: "GovernanceBlocked",
    targetPath,
  };
}

export function initializeGovernLiveEvidenceLocalIntake(options = {}) {
  const targetRelativePath = options.targetPath || defaultTargetPath;
  const resolvedTarget = safeResolve(targetRelativePath);
  if (resolvedTarget.finding) return blockedResult(resolvedTarget.finding);

  if (fs.existsSync(resolvedTarget.path) && options.force !== true) {
    return blockedResult("target_exists_requires_force", targetRelativePath);
  }

  let templateContent = "";
  try {
    templateContent = fs.readFileSync(path.join(repoRoot, defaultTemplatePath), "utf8");
  } catch {
    return blockedResult("template_unreadable", targetRelativePath);
  }

  const templateValidation = validateGovernLiveEvidenceRefIntakeContent(templateContent);
  if (templateValidation.findingCount > 0) {
    return {
      findingCount: templateValidation.findingCount,
      findings: templateValidation.findings,
      initialized: false,
      proofState: "Fail",
      solverOutcome: "GovernanceBlocked",
      targetPath: targetRelativePath,
    };
  }

  fs.mkdirSync(path.dirname(resolvedTarget.path), { recursive: true });
  fs.writeFileSync(resolvedTarget.path, templateContent.endsWith("\n") ? templateContent : `${templateContent}\n`, "utf8");

  const writtenValidation = validateGovernLiveEvidenceRefIntakeContent(
    fs.readFileSync(resolvedTarget.path, "utf8"),
  );
  if (writtenValidation.findingCount > 0) {
    return {
      findingCount: writtenValidation.findingCount,
      findings: writtenValidation.findings,
      initialized: false,
      proofState: "Fail",
      solverOutcome: "GovernanceBlocked",
      targetPath: targetRelativePath,
    };
  }

  return {
    findingCount: 0,
    findings: [],
    initialized: true,
    missingApprovalInputCount: writtenValidation.missingApprovalInputCount,
    proofState: "Pass",
    solverOutcome: "SolvedVerified",
    targetPath: targetRelativePath,
  };
}

export function formatGovernLiveEvidenceLocalIntakeInitReport(result) {
  return [
    `govern_live_evidence_local_intake_init=${result.solverOutcome}`,
    `proof_state=${result.proofState}`,
    `initialized=${result.initialized ? "true" : "false"}`,
    `target=${result.targetPath}`,
    `missing_approval_input_count=${result.missingApprovalInputCount ?? 0}`,
    `finding_count=${result.findingCount}`,
    ...result.findings.map((finding) => `finding=${finding}`),
    "secret_values=not_read",
    "provider_values=not_read",
    "raw_payloads=not_read",
  ].join("\n");
}

function runCli() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage());
    return;
  }

  const invalidArgs = unsupportedArgs(args);
  if (invalidArgs.length > 0) {
    const result = blockedResult(`unsupported_args_count:${invalidArgs.length}`);
    if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
    else console.log(formatGovernLiveEvidenceLocalIntakeInitReport(result));
    process.exit(1);
    return;
  }

  const result = initializeGovernLiveEvidenceLocalIntake({
    force: args.includes("--force"),
    targetPath: targetArg(args),
  });
  if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
  else console.log(formatGovernLiveEvidenceLocalIntakeInitReport(result));
  if (result.solverOutcome !== "SolvedVerified") process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
