/*
Purpose: capture and validate a public-safe Mullusi live-safety witness artifact.
Governance scope: scheduled live probes, artifact file boundaries, validation before retention, and failure capture without secrets.
Dependencies: Node.js standard library and live-safety checker scripts.
Invariants: captures public-safe checker output only, does not mutate infrastructure, and never records raw response headers, provider account IDs, tokens, credentials, or DNS target values.
Test contract: run node scripts/test-capture-live-safety-witness.mjs.
*/

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  evaluateLiveSafetyWitnessArtifact,
  formatResult as formatValidationResult,
} from "./check-live-safety-witness.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const defaultArtifactDirectory = "live-safety-witness";

const probeDefinitions = [
  {
    name: "public_visibility",
    fileName: "public-visibility.txt",
    args: ["scripts/check-public-visibility.mjs"],
  },
  {
    name: "regional_public_visibility",
    fileName: "regional-public-visibility.txt",
    args: [
      "scripts/check-public-visibility.mjs",
      "--external-check-host",
      "--check-host-max-nodes=6",
      "--allow-pending",
    ],
  },
  {
    name: "website_origin",
    fileName: "website-origin.txt",
    args: ["scripts/check-website-origin.mjs"],
  },
  {
    name: "security_headers",
    fileName: "security-headers.txt",
    args: ["scripts/check-live-security-headers.mjs"],
  },
  {
    name: "domain_security",
    fileName: "domain-security.txt",
    args: ["scripts/check-domain-security.mjs", "--allow-hardening-gaps"],
  },
  {
    name: "domain_hardening_preflight",
    fileName: "domain-hardening-preflight.txt",
    args: ["scripts/check-domain-hardening-preflight.mjs", "--expect-blocked"],
  },
  {
    name: "search_indexing_surface",
    fileName: "search-indexing-surface.txt",
    args: ["scripts/check-search-indexing-surface.mjs"],
  },
];

function normalizedOutput(content) {
  const trimmed = content.trimEnd();
  return trimmed.length === 0 ? "" : `${trimmed}\n`;
}

function isoSecondTimestamp(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function resolveArtifactDirectory(artifactDirectory) {
  return path.isAbsolute(artifactDirectory)
    ? artifactDirectory
    : path.join(repoRoot, artifactDirectory);
}

export function liveSafetyProbePlan() {
  return probeDefinitions.map((probe) => ({
    name: probe.name,
    fileName: probe.fileName,
    args: [...probe.args],
  }));
}

export function buildRunMetadataContent({ env = process.env, now = new Date() } = {}) {
  return [
    "workflow=live-safety-probes",
    `run_id=${env.GITHUB_RUN_ID || "local"}`,
    `run_attempt=${env.GITHUB_RUN_ATTEMPT || "1"}`,
    `commit=${env.GITHUB_SHA || "local"}`,
    `observed_at=${isoSecondTimestamp(now)}`,
    "raw_response_headers=not_recorded",
  ].join("\n") + "\n";
}

export function runProbeCommand(probe) {
  return spawnSync(process.execPath, probe.args, {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function failureWitness(probe, result) {
  const status = Number.isInteger(result.status) ? result.status : "unknown";
  return [
    "verdict=GovernanceBlocked",
    "proof_state=Fail",
    `probe=${probe.name}`,
    `artifact_file=${probe.fileName}`,
    `error=probe_failed:${status}`,
    "raw_response_headers=not_recorded",
  ].join("\n") + "\n";
}

export function captureLiveSafetyWitnessArtifact({
  artifactDirectory = defaultArtifactDirectory,
  env = process.env,
  now = new Date(),
  runner = runProbeCommand,
} = {}) {
  const resolvedDirectory = resolveArtifactDirectory(artifactDirectory);
  fs.mkdirSync(resolvedDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(resolvedDirectory, "run-metadata.txt"),
    buildRunMetadataContent({ env, now }),
    "utf8",
  );

  const probeResults = [];
  for (const probe of liveSafetyProbePlan()) {
    const result = runner(probe);
    const status = Number.isInteger(result.status) ? result.status : 1;
    const output = status === 0 ? normalizedOutput(result.stdout || "") : failureWitness(probe, result);
    fs.writeFileSync(path.join(resolvedDirectory, probe.fileName), output, "utf8");
    probeResults.push({
      name: probe.name,
      fileName: probe.fileName,
      status,
    });
  }

  const validation = evaluateLiveSafetyWitnessArtifact(resolvedDirectory);
  return {
    artifactDirectory: resolvedDirectory,
    probeResults,
    validation,
  };
}

export function formatCaptureResult(result) {
  const failedProbeLines = result.probeResults
    .filter((probe) => probe.status !== 0)
    .map((probe) => `failed_probe=${probe.name}:${probe.status}`);
  return [
    `capture_state=${result.validation.proofState === "Pass" ? "SolvedVerified" : "GovernanceBlocked"}`,
    `probe_count=${result.probeResults.length}`,
    ...failedProbeLines,
    formatValidationResult(result.validation),
  ].join("\n");
}

function usage() {
  return [
    "Usage:",
    "  node scripts/capture-live-safety-witness.mjs [artifact-directory]",
    "",
    "Captures all public-safe live-safety probe outputs, then validates the artifact.",
  ].join("\n");
}

function runCli() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage());
    return;
  }
  const unsupported = args.filter((arg) => arg.startsWith("--"));
  if (unsupported.length > 0) {
    console.log(`capture_state=GovernanceBlocked\nproof_state=Fail\nerror=unsupported_args:${unsupported.join(",")}`);
    process.exit(1);
    return;
  }
  if (args.length > 1) {
    console.log("capture_state=GovernanceBlocked\nproof_state=Fail\nerror=too_many_arguments");
    process.exit(1);
    return;
  }

  const result = captureLiveSafetyWitnessArtifact({
    artifactDirectory: args[0] || defaultArtifactDirectory,
  });
  console.log(formatCaptureResult(result));
  const probeFailed = result.probeResults.some((probe) => probe.status !== 0);
  if (probeFailed || result.validation.proofState !== "Pass") {
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
