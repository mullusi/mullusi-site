/*
Purpose: report the public-safe API gateway production readiness state before api.mullusi.com DNS activation.
Governance scope: recovery gate, runtime host evidence, managed PostgreSQL evidence, secret-store boundary, TLS, rollback, gateway runtime evidence, and product runtime witness separation.
Dependencies: Node.js standard library, ops API readiness documents, recovery witness, and runtime witness registry.
Invariants: fail-closed readiness; optional JSON output writes only aggregate public-safe state; no secret values, host addresses, provider account IDs, database URLs, or private recovery values are read, printed, or written.
Test contract: run node scripts/test-check-api-production-readiness.mjs.
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { scanForbiddenEvidencePatterns } from "./govern-live-evidence-ref-contract.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const repoRootPrefix = `${repoRoot}${path.sep}`;

const readinessFlags = [
  { flag: "--production-image-published", key: "production_image_published" },
  { flag: "--runtime-host-ready", key: "runtime_host_ready" },
  { flag: "--managed-postgres-ready", key: "managed_postgres_ready" },
  { flag: "--schema-applied", key: "schema_applied" },
  { flag: "--production-secrets-stored", key: "production_secrets_stored" },
  { flag: "--deploy-env-ready", key: "deploy_env_check_ready" },
  { flag: "--release-preflight-ready", key: "release_preflight_ready" },
  { flag: "--persistence-ready", key: "persistence_check_ready" },
  { flag: "--host-firewall-configured", key: "host_firewall_configured" },
  { flag: "--tls-certificate-ready", key: "tls_certificate_ready" },
  { flag: "--rollback-path-defined", key: "rollback_path_defined" },
  { flag: "--private-runtime-witness-ready", key: "private_runtime_witness_ready" },
  { flag: "--dns-authority-ready", key: "dns_authority_ready" },
];

const requiredRuntimeWitnessEndpoints = ["/health", "/gateway/witness", "/runtime/conformance"];
const allowedCliOptions = new Set(["--help", "-h", "--json", "--require-ready", "--expect-blocked"]);
for (const { flag } of readinessFlags) allowedCliOptions.add(flag);

const highSignalSecretPatterns = [
  /g(?:ho|hp|hr|hs)_[A-Za-z0-9_]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /-----BEGIN (?:RSA |OPENSSH |EC |)PRIVATE KEY-----/,
  /postgres(?:ql)?:\/\/[^:\s]+:[^@\s]+@/i,
  /[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{24,}/,
];

function readUtf8(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readUtf8(relativePath));
}

function lineValue(content, key) {
  const match = content.match(new RegExp(`^${key}=([^\\s]+)$`, "m"));
  return match?.[1] ?? "";
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function runtimeWitnessClosed(witness) {
  if (!isPlainObject(witness)) return false;
  if (witness.proofState !== "SolvedVerified") return false;
  if (witness.runtimeState !== "production-ready" && witness.runtimeState !== "public-witness-ready") return false;
  if (witness.health?.evidenceState !== "pass") return false;
  if (witness.preflight?.mode !== "fail-closed" || witness.preflight?.decision !== "allow") return false;
  if (witness.publicExposure?.allowed !== true || witness.publicExposure?.state !== "allowed") return false;
  if (witness.rollback?.state !== "Ready") return false;
  const observations = Array.isArray(witness.health?.observations) ? witness.health.observations : [];
  return requiredRuntimeWitnessEndpoints.every((endpoint) =>
    observations.some((observation) => observation.endpoint === endpoint && observation.state === "Pass"),
  );
}

function assertDocumentIncludes(hardFindings, documentName, content, requiredPhrases) {
  for (const phrase of requiredPhrases) {
    if (!content.includes(phrase)) {
      hardFindings.push(`${documentName}_missing:${phrase.replace(/[^a-zA-Z0-9]+/g, "_")}`);
    }
  }
}

function validateSecretBoundary(hardFindings, namedDocuments) {
  for (const [documentName, content] of Object.entries(namedDocuments)) {
    hardFindings.push(...scanForbiddenEvidencePatterns(documentName, content));
    for (const pattern of highSignalSecretPatterns) {
      if (pattern.test(content)) {
        hardFindings.push(`secret_like_value_present:${documentName}`);
      }
    }
  }
}

export function publicReadinessScalarLabel(value) {
  if (typeof value !== "string" || value.length === 0) return "missing";
  return /^[A-Za-z0-9_.:-]{1,80}$/.test(value) ? value : "redacted_value";
}

function validateRuntimeWitnessRegistry(hardFindings, registry) {
  if (!isPlainObject(registry)) {
    hardFindings.push("runtime_witness_registry_object_required");
    return { witnessCount: 0, closedWitnessCount: 0, blockedWitnessCount: 0 };
  }
  if (registry.authority !== "mullusi-runtime-witness-authority") {
    hardFindings.push(`runtime_witness_authority_invalid:${publicReadinessScalarLabel(registry.authority)}`);
  }
  const witnesses = Array.isArray(registry.witnesses) ? registry.witnesses : [];
  if (witnesses.length === 0) hardFindings.push("runtime_witness_rows_required");

  let closedWitnessCount = 0;
  for (const witness of witnesses) {
    if (!isPlainObject(witness)) {
      hardFindings.push("runtime_witness_row_object_required");
      continue;
    }
    const productId = publicReadinessScalarLabel(witness.productId);
    if (witness.controlPlane?.required !== true) {
      hardFindings.push(`runtime_witness_control_plane_required_missing:${productId}`);
    }
    if (witness.controlPlane?.bypassAllowed !== false) {
      hardFindings.push(`runtime_witness_control_plane_bypass_allowed:${productId}`);
    }
    const endpoints = Array.isArray(witness.health?.requiredEndpoints) ? witness.health.requiredEndpoints : [];
    for (const endpoint of requiredRuntimeWitnessEndpoints) {
      if (!endpoints.includes(endpoint)) {
        hardFindings.push(`runtime_witness_required_endpoint_missing:${productId}:${endpoint}`);
      }
    }
    if (witness.preflight?.mode !== "fail-closed") {
      hardFindings.push(`runtime_witness_preflight_not_fail_closed:${productId}`);
    }
    if (typeof witness.rollback?.path !== "string" || !witness.rollback.path.startsWith("ops/")) {
      hardFindings.push(`runtime_witness_rollback_path_invalid:${productId}`);
    }
    if (runtimeWitnessClosed(witness)) closedWitnessCount += 1;
  }

  return {
    witnessCount: witnesses.length,
    closedWitnessCount,
    blockedWitnessCount: Math.max(witnesses.length - closedWitnessCount, 0),
  };
}

export function collectLocalApiProductionEvidence(flagSet = new Set()) {
  return {
    documents: {
      runtimeHostPath: readUtf8("ops/api-runtime-host-path.md"),
      productionReadinessGate: readUtf8("ops/api-production-readiness-gate.md"),
      recoveryWitness: readUtf8("ops/recovery-completion-witness.md"),
      runtimeWitnessReadme: readUtf8("ops/runtime-witness/README.md"),
    },
    runtimeWitnessRegistry: readJson("ops/runtime-witness/registry.json"),
    readinessFlags: Object.fromEntries(readinessFlags.map(({ flag, key }) => [key, flagSet.has(flag)])),
  };
}

export function evaluateApiProductionReadinessEvidence(evidence) {
  const hardFindings = [];
  const blockers = [];
  const documents = evidence.documents ?? {};
  const runtimeHostPath = documents.runtimeHostPath ?? "";
  const productionReadinessGate = documents.productionReadinessGate ?? "";
  const recoveryWitness = documents.recoveryWitness ?? "";
  const runtimeWitnessReadme = documents.runtimeWitnessReadme ?? "";
  const readinessEvidence = evidence.readinessFlags ?? {};

  assertDocumentIncludes(hardFindings, "runtime_host_path", runtimeHostPath, [
    "api.mullusi.com",
    "external managed PostgreSQL",
    "Strict-Transport-Security: max-age=86400",
    "rollback_path_defined=Pass",
    "rollback_path_evidence_ref=site:ops/api-production-readiness-gate.md",
  ]);
  assertDocumentIncludes(hardFindings, "production_readiness_gate", productionReadinessGate, [
    "no_gateway_runtime_evidence -> no_api_dns",
    "python scripts/check_deploy_env.py",
    "python scripts/preflight_release.py",
    "python scripts/apply_schema.py",
    "python scripts/check_persistence.py",
    "curl https://api.mullusi.com/health",
    "curl https://api.mullusi.com/gateway/witness",
    "curl https://api.mullusi.com/runtime/conformance",
  ]);
  assertDocumentIncludes(hardFindings, "runtime_witness_readme", runtimeWitnessReadme, [
    "controlPlane.required",
    "controlPlane.bypassAllowed",
    "runtimeWitnessClosed",
  ]);
  validateSecretBoundary(hardFindings, {
    runtimeHostPath,
    productionReadinessGate,
    recoveryWitness,
    runtimeWitnessReadme,
  });

  const recoveryState = lineValue(recoveryWitness, "recovery_witness_state");
  const apiProvisioningAllowed = lineValue(recoveryWitness, "api_provisioning_allowed");
  if (!["AwaitingEvidence", "ReadyForProvisioning"].includes(recoveryState)) {
    hardFindings.push(`recovery_witness_state_invalid:${publicReadinessScalarLabel(recoveryState)}`);
  }
  if (!["false", "true"].includes(apiProvisioningAllowed)) {
    hardFindings.push(`api_provisioning_allowed_invalid:${publicReadinessScalarLabel(apiProvisioningAllowed)}`);
  }
  if (recoveryState !== "ReadyForProvisioning" || apiProvisioningAllowed !== "true") {
    blockers.push("recovery_witness_not_ready");
  }

  const missingReadinessEvidence = readinessFlags
    .filter(({ key }) => readinessEvidence[key] !== true)
    .map(({ key }) => key);
  for (const key of missingReadinessEvidence) blockers.push(`manual_evidence_missing:${key}`);

  const runtimeWitnessSummary = validateRuntimeWitnessRegistry(hardFindings, evidence.runtimeWitnessRegistry);
  let apiProductionReadinessState = "ReadyForDns";
  let solverOutcome = "SolvedVerified";
  let proofState = "Pass";
  if (hardFindings.length > 0) {
    apiProductionReadinessState = "GovernanceBlocked";
    solverOutcome = "GovernanceBlocked";
    proofState = "Fail";
  } else if (blockers.includes("recovery_witness_not_ready")) {
    apiProductionReadinessState = "Blocked";
    solverOutcome = "AwaitingEvidence";
    proofState = "Unknown";
  } else if (blockers.length > 0) {
    apiProductionReadinessState = "AwaitingEvidence";
    solverOutcome = "AwaitingEvidence";
    proofState = "Unknown";
  }

  return {
    apiProductionReadinessState,
    solverOutcome,
    proofState,
    apiDnsPublicationAllowed: apiProductionReadinessState === "ReadyForDns",
    recoveryGate: recoveryState === "ReadyForProvisioning" && apiProvisioningAllowed === "true"
      ? "ReadyForProvisioning"
      : "Blocked",
    recoveryWitnessState: ["AwaitingEvidence", "ReadyForProvisioning"].includes(recoveryState)
      ? recoveryState
      : publicReadinessScalarLabel(recoveryState),
    apiProvisioningAllowed: apiProvisioningAllowed === "true",
    manualEvidenceReady: missingReadinessEvidence.length === 0,
    manualEvidenceMissing: missingReadinessEvidence,
    runtimeWitnessRegistry: hardFindings.some((finding) => finding.startsWith("runtime_witness_")) ? "Fail" : "Pass",
    ...runtimeWitnessSummary,
    hostPathContract: hardFindings.some((finding) => finding.startsWith("runtime_host_path_")) ? "Fail" : "Pass",
    readinessGateContract: hardFindings.some((finding) => finding.startsWith("production_readiness_gate_")) ? "Fail" : "Pass",
    secretBoundary: hardFindings.some((finding) => finding.startsWith("secret_like_value_present:")) ? "Fail" : "Pass",
    hardFindings,
    blockers,
  };
}

export function formatApiProductionReadinessResult(result) {
  const findingLines = result.hardFindings.length > 0
    ? result.hardFindings.map((finding) => `finding=${finding}`)
    : ["finding=none"];
  const blockerLines = result.blockers.length > 0
    ? result.blockers.map((blocker) => `blocker=${blocker}`)
    : ["blocker=none"];
  return [
    `api_production_readiness_state=${result.apiProductionReadinessState}`,
    `solver_outcome=${result.solverOutcome}`,
    `proof_state=${result.proofState}`,
    `api_dns_publication_allowed=${result.apiDnsPublicationAllowed ? "true" : "false"}`,
    `recovery_gate=${result.recoveryGate}`,
    `recovery_witness_state=${result.recoveryWitnessState}`,
    `api_provisioning_allowed=${result.apiProvisioningAllowed ? "true" : "false"}`,
    `manual_evidence_ready=${result.manualEvidenceReady ? "true" : "false"}`,
    `manual_evidence_missing_count=${result.manualEvidenceMissing.length}`,
    `runtime_witness_registry=${result.runtimeWitnessRegistry}`,
    `runtime_witness_count=${result.witnessCount}`,
    `runtime_witness_closed_count=${result.closedWitnessCount}`,
    `runtime_witness_blocked_count=${result.blockedWitnessCount}`,
    `host_path_contract=${result.hostPathContract}`,
    `readiness_gate_contract=${result.readinessGateContract}`,
    `secret_boundary=${result.secretBoundary}`,
    ...findingLines,
    ...blockerLines,
    "secret_values=not_recorded",
    "host_addresses=not_recorded",
    "database_urls=not_recorded",
    "private_recovery_values=not_read",
  ].join("\n");
}

function parseCliArgs(args) {
  const outputArg = args.find((arg) => arg.startsWith("--output="));
  const outputValue = outputArg ? outputArg.slice("--output=".length) : "";
  const outputPath = outputValue ? path.resolve(repoRoot, outputValue) : "";
  const outputPathError = outputPath && outputPath !== repoRoot && !outputPath.startsWith(repoRootPrefix)
    ? "output_path_outside_repo"
    : "";
  const invalidOptions = args.filter((arg) =>
    arg.startsWith("--")
    && !allowedCliOptions.has(arg)
    && !(arg.startsWith("--output=") && arg !== "--output="));
  const flagSet = new Set(args.filter((arg) => readinessFlags.some(({ flag }) => flag === arg)));
  return {
    invalidOptions,
    flagSet,
    outputJson: args.includes("--json"),
    outputPath: outputPathError ? "" : outputPath,
    outputPathError,
    requireReady: args.includes("--require-ready"),
    expectBlocked: args.includes("--expect-blocked"),
    help: args.includes("--help") || args.includes("-h"),
  };
}

function usage() {
  return [
    "Usage:",
    "  node scripts/check-api-production-readiness.mjs [flags] [--require-ready] [--expect-blocked] [--json] [--output=FILE]",
    "",
    "Evidence flags:",
    ...readinessFlags.map(({ flag }) => `  ${flag}`),
    "",
    "The command records public-safe readiness state without printing or writing secret values.",
  ].join("\n");
}

function printResult(result, args) {
  if (args.outputPath) {
    fs.mkdirSync(path.dirname(args.outputPath), { recursive: true });
    fs.writeFileSync(args.outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  }
  if (args.outputJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(formatApiProductionReadinessResult(result));
}

export function publicErrorCode(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith("api_production_readiness_")) {
    return message;
  }
  if (message.includes("ENOENT")) {
    return "api_production_readiness_file_unavailable";
  }
  if (message.includes("JSON") || error instanceof SyntaxError) {
    return "api_production_readiness_json_invalid";
  }
  if (/secret|token|password|credential|postgres|private|D:\\|C:\\/i.test(message)) {
    return "api_production_readiness_unavailable";
  }
  return "api_production_readiness_unavailable";
}

function runCli() {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (args.invalidOptions.length > 0) {
    const result = {
      apiProductionReadinessState: "GovernanceBlocked",
      solverOutcome: "GovernanceBlocked",
      proofState: "Fail",
      apiDnsPublicationAllowed: false,
      recoveryGate: "Unknown",
      recoveryWitnessState: "",
      apiProvisioningAllowed: false,
      manualEvidenceReady: false,
      manualEvidenceMissing: readinessFlags.map(({ key }) => key),
      runtimeWitnessRegistry: "Unknown",
      witnessCount: 0,
      closedWitnessCount: 0,
      blockedWitnessCount: 0,
      hostPathContract: "Unknown",
      readinessGateContract: "Unknown",
      secretBoundary: "Unknown",
      hardFindings: [`unsupported_args_count:${args.invalidOptions.length}`],
      blockers: [],
    };
    printResult(result, args);
    process.exit(1);
    return;
  }
  if (args.outputPathError) {
    const result = {
      apiProductionReadinessState: "GovernanceBlocked",
      solverOutcome: "GovernanceBlocked",
      proofState: "Fail",
      apiDnsPublicationAllowed: false,
      recoveryGate: "Unknown",
      recoveryWitnessState: "",
      apiProvisioningAllowed: false,
      manualEvidenceReady: false,
      manualEvidenceMissing: readinessFlags.map(({ key }) => key),
      runtimeWitnessRegistry: "Unknown",
      witnessCount: 0,
      closedWitnessCount: 0,
      blockedWitnessCount: 0,
      hostPathContract: "Unknown",
      readinessGateContract: "Unknown",
      secretBoundary: "Unknown",
      hardFindings: [args.outputPathError],
      blockers: [],
    };
    printResult(result, args);
    process.exit(1);
    return;
  }

  try {
    const evidence = collectLocalApiProductionEvidence(args.flagSet);
    const result = evaluateApiProductionReadinessEvidence(evidence);
    printResult(result, args);
    if (
      result.proofState === "Fail"
      || (args.requireReady && result.apiProductionReadinessState !== "ReadyForDns")
      || (args.expectBlocked && result.apiProductionReadinessState !== "Blocked")
    ) {
      process.exit(1);
    }
  } catch (error) {
    const result = {
      apiProductionReadinessState: "GovernanceBlocked",
      solverOutcome: "GovernanceBlocked",
      proofState: "Fail",
      apiDnsPublicationAllowed: false,
      recoveryGate: "Unknown",
      recoveryWitnessState: "",
      apiProvisioningAllowed: false,
      manualEvidenceReady: false,
      manualEvidenceMissing: readinessFlags.map(({ key }) => key),
      runtimeWitnessRegistry: "Unknown",
      witnessCount: 0,
      closedWitnessCount: 0,
      blockedWitnessCount: 0,
      hostPathContract: "Unknown",
      readinessGateContract: "Unknown",
      secretBoundary: "Unknown",
      hardFindings: [`readiness_check_error:${publicErrorCode(error)}`],
      blockers: [],
    };
    printResult(result, args);
    process.exit(1);
  }
}

export { readinessFlags, runtimeWitnessClosed };

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
