/*
Purpose: validate that Mullu Govern validators use the shared live evidence private-value scanner.
Governance scope: public-safe evidence scanning, no-secret validation consistency, and preflight validator drift prevention.
Dependencies: Node.js standard library and scripts/govern-live-evidence-ref-contract.mjs.
Invariants: read-only; does not read secret stores, contact providers, mutate files, or print private values.
Test contract: run node scripts/test-validate-govern-shared-evidence-scanner-boundary.mjs.
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const scriptsDir = path.join(repoRoot, "scripts");
const allowedArgs = new Set(["--json"]);

const localScannerPattern = /\bconst\s+forbiddenEvidencePatterns\s*=/;
const governValidatorPattern = /^validate-govern-.*\.mjs$/;
const sharedContractFile = "govern-live-evidence-ref-contract.mjs";

function readUtf8(absolutePath) {
  return fs.readFileSync(absolutePath, "utf8");
}

function unsupportedArgs(args) {
  return args.filter((arg) => arg.startsWith("--") && !allowedArgs.has(arg));
}

function governValidatorFiles(directory = scriptsDir) {
  return fs.readdirSync(directory)
    .filter((fileName) => governValidatorPattern.test(fileName))
    .sort();
}

export function validateGovernSharedEvidenceScannerBoundaryForSources(sources) {
  const findings = [];
  const scannedFiles = Object.keys(sources).sort();

  for (const fileName of scannedFiles) {
    if (fileName === sharedContractFile) continue;
    if (localScannerPattern.test(sources[fileName])) {
      findings.push(`local_forbidden_evidence_scanner_must_use_shared_contract:${fileName}`);
    }
  }

  return {
    findingCount: findings.length,
    findings,
    proofState: findings.length === 0 ? "Pass" : "Fail",
    scannedFileCount: scannedFiles.length,
    solverOutcome: findings.length === 0 ? "SolvedVerified" : "GovernanceBlocked",
  };
}

export function collectGovernSharedEvidenceScannerBoundarySources(directory = scriptsDir) {
  const sources = {};
  for (const fileName of governValidatorFiles(directory)) {
    sources[fileName] = readUtf8(path.join(directory, fileName));
  }
  return sources;
}

export function validateGovernSharedEvidenceScannerBoundary() {
  return validateGovernSharedEvidenceScannerBoundaryForSources(
    collectGovernSharedEvidenceScannerBoundarySources(),
  );
}

export function formatGovernSharedEvidenceScannerBoundaryReport(result) {
  return [
    `govern_shared_evidence_scanner_boundary=${result.solverOutcome}`,
    `proof_state=${result.proofState}`,
    `scanned_file_count=${result.scannedFileCount}`,
    `finding_count=${result.findingCount}`,
    ...result.findings.map((finding) => `finding=${finding}`),
    "secret_values=not_read",
    "provider_values=not_read",
    "raw_payloads=not_read",
  ].join("\n");
}

function main() {
  const args = process.argv.slice(2);
  const invalidArgs = unsupportedArgs(args);
  if (invalidArgs.length > 0) {
    const result = {
      findingCount: invalidArgs.length,
      findings: [`unsupported_args:${invalidArgs.join(",")}`],
      proofState: "Fail",
      scannedFileCount: 0,
      solverOutcome: "GovernanceBlocked",
    };
    if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
    else console.log(formatGovernSharedEvidenceScannerBoundaryReport(result));
    process.exit(1);
    return;
  }

  const result = validateGovernSharedEvidenceScannerBoundary();
  if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
  else console.log(formatGovernSharedEvidenceScannerBoundaryReport(result));
  if (result.findings.length > 0) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
