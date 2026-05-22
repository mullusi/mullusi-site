/*
Purpose: report Mullusi operational gate state before API provisioning.
Governance scope: recovery witness, API readiness dependency, staged HSTS, and secret-free ops documents.
Dependencies: Node.js standard library, ops gate files, and optional backend Nginx deployment template.
Invariants: this script performs read-only checks and never reads private recovery inventories.
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const failures = [];
const mode = process.argv[2] ?? "--check";

const opsFiles = [
  "ops/MULLUSI_INFRASTRUCTURE_ROOT.md",
  "ops/api-runtime-host-path.md",
  "ops/api-production-readiness-gate.md",
  "ops/recovery-inventory-template.md",
  "ops/recovery-completion-witness.md",
];

function readUtf8(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function pathExists(relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

function recordFailure(message) {
  failures.push(message);
}

function lineValue(content, key) {
  const match = content.match(new RegExp(`^${key}=([^\\s]+)$`, "m"));
  return match?.[1] ?? "";
}

function validateSecretBoundary() {
  const highSignalSecretPatterns = [
    /g(?:ho|hp|hr|hs)_[A-Za-z0-9_]{20,}/,
    /github_pat_[A-Za-z0-9_]{20,}/,
    /-----BEGIN (?:RSA |OPENSSH |EC |)PRIVATE KEY-----/,
    /postgres(?:ql)?:\/\/[^:\s]+:[^@\s]+@/i,
    /[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{24,}/,
  ];

  for (const opsFile of opsFiles) {
    const content = readUtf8(opsFile);
    for (const pattern of highSignalSecretPatterns) {
      if (pattern.test(content)) {
        recordFailure(`ops_secret_like_value_present:${opsFile}:${pattern}`);
      }
    }
  }
}

function validateHstsStage() {
  if (pathExists("backend/deploy/nginx/api.mullusi.com.conf")) {
    const nginxTemplate = readUtf8("backend/deploy/nginx/api.mullusi.com.conf");
    if (!nginxTemplate.includes('Strict-Transport-Security "max-age=86400"')) {
      recordFailure("api_nginx_hsts_stage_one_missing");
    }
    if (/includeSubDomains|preload/i.test(nginxTemplate)) {
      recordFailure("api_nginx_hsts_premature_strict_mode");
    }
    return;
  }

  const runtimeHostPath = readUtf8("ops/api-runtime-host-path.md");
  const infrastructureRoot = readUtf8("ops/MULLUSI_INFRASTRUCTURE_ROOT.md");
  if (!runtimeHostPath.includes("Strict-Transport-Security: max-age=86400")) {
    recordFailure("api_ops_hsts_stage_one_missing");
  }
  if (!infrastructureRoot.includes("HSTS: deferred") || !infrastructureRoot.includes("Stage 1: max-age=86400, no includeSubDomains, no preload")) {
    recordFailure("api_ops_hsts_rollout_boundary_missing");
  }
}

function evaluateRecoveryGate() {
  const recoveryWitness = readUtf8("ops/recovery-completion-witness.md");
  const apiGate = readUtf8("ops/api-production-readiness-gate.md");
  const recoveryState = lineValue(recoveryWitness, "recovery_witness_state");
  const apiAllowed = lineValue(recoveryWitness, "api_provisioning_allowed");

  if (!["AwaitingEvidence", "ReadyForProvisioning"].includes(recoveryState)) {
    recordFailure(`recovery_witness_state_invalid:${recoveryState}`);
  }
  if (!["false", "true"].includes(apiAllowed)) {
    recordFailure(`api_provisioning_allowed_invalid:${apiAllowed}`);
  }
  if (recoveryState === "AwaitingEvidence" && apiAllowed !== "false") {
    recordFailure("recovery_awaiting_evidence_must_block_api_provisioning");
  }
  if (recoveryState === "ReadyForProvisioning" && apiAllowed !== "true") {
    recordFailure("recovery_ready_must_allow_api_provisioning");
  }
  if (apiAllowed === "true" && recoveryWitness.includes("AwaitingEvidence")) {
    recordFailure("api_provisioning_allowed_with_unconfirmed_recovery_rows");
  }
  if (!apiGate.includes("ops/recovery-completion-witness.md") || !apiGate.includes("ReadyForProvisioning")) {
    recordFailure("api_readiness_gate_missing_recovery_witness_dependency");
  }

  if (recoveryState === "ReadyForProvisioning" && apiAllowed === "true") {
    return "ReadyForProvisioning";
  }
  return "Blocked";
}

function runGateCheck() {
  if (!["--check", "--require-ready", "--expect-blocked"].includes(mode)) {
    recordFailure(`unsupported_mode:${mode}`);
  }

  const gateState = evaluateRecoveryGate();
  validateHstsStage();
  validateSecretBoundary();

  if (mode === "--require-ready" && gateState !== "ReadyForProvisioning") {
    recordFailure("api_provisioning_not_ready");
  }
  if (mode === "--expect-blocked" && gateState !== "Blocked") {
    recordFailure("api_provisioning_not_blocked");
  }

  if (failures.length > 0) {
    console.error(failures.join("\n"));
    process.exit(1);
  }

  if (gateState === "ReadyForProvisioning") {
    console.log("ops_gate state=ReadyForProvisioning api_provisioning_allowed=true");
    return;
  }
  console.log("ops_gate state=Blocked reason=recovery_awaiting_evidence api_provisioning_allowed=false");
}

runGateCheck();
