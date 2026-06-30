/*
Purpose: emit a public-safe operator request packet for missing Mullu Govern live evidence refs.
Governance scope: missing approval ref request generation, no-secret redaction, optional local-only output, and no approval mutation.
Dependencies: Node.js standard library and scripts/report-govern-live-evidence-ref-status.mjs.
Invariants: read-only by default; optional output is confined to ignored local paths; does not approve live collection, mutate intake refs, publish routes, activate privacy/retention, update runtime witnesses, or read provider/private values.
Test contract: run node scripts/test-emit-govern-live-evidence-operator-request.mjs.
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  collectGovernLiveEvidenceRefStatus,
  governLiveEvidenceRefPlan,
} from "./report-govern-live-evidence-ref-status.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const repoRootPrefix = `${repoRoot}${path.sep}`;
const defaultLocalIntakePath = "ops/mullu-govern-live-evidence-ref-intake.local.json";
const defaultTemplateIntakePath = "ops/mullu-govern-live-evidence-ref-intake-template.json";
const allowedArgs = new Set(["--help", "-h", "--json"]);

function usage() {
  return [
    "Usage:",
    "  node scripts/emit-govern-live-evidence-operator-request.mjs [--path=FILE] [--output=FILE] [--json]",
    "",
    "Emits a public-safe request packet for missing live evidence refs.",
    "Default input prefers ignored local intake when present, then the committed public template.",
  ].join("\n");
}

function unsupportedArgs(args) {
  return args.filter((arg) => (
    arg.startsWith("--")
    && !allowedArgs.has(arg)
    && !arg.startsWith("--path=")
    && !arg.startsWith("--output=")
  ));
}

function pathArg(args, prefix, fallback) {
  const match = args.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function safeOutputPath(relativePath) {
  if (!relativePath) return { finding: "", path: "" };
  const resolvedPath = path.resolve(repoRoot, relativePath);
  if (resolvedPath !== repoRoot && !resolvedPath.startsWith(repoRootPrefix)) {
    return { finding: "output_path_outside_repo", path: "" };
  }
  const normalized = relativePath.replaceAll("\\", "/");
  if (!normalized.startsWith(".tmp/") && !normalized.endsWith(".local.json")) {
    return { finding: "output_path_must_be_tmp_or_local_json", path: "" };
  }
  return { finding: "", path: resolvedPath };
}

function stableDate() {
  return new Date().toISOString().slice(0, 10);
}

function publicIntakePathLabel(intakePath) {
  if (intakePath === defaultTemplateIntakePath) return "template_intake";
  if (typeof intakePath === "string") {
    const resolvedPath = path.resolve(repoRoot, intakePath);
    if (
      resolvedPath !== repoRoot
      && resolvedPath.startsWith(repoRootPrefix)
      && intakePath.endsWith(".local.json")
    ) {
      return "local_intake";
    }
  }
  return "redacted_path";
}

export function resolveGovernLiveEvidenceOperatorRequestIntakePath(
  localIntakePath = defaultLocalIntakePath,
  templateIntakePath = defaultTemplateIntakePath,
) {
  const localResolvedPath = path.resolve(repoRoot, localIntakePath);
  if (
    localResolvedPath !== repoRoot
    && localResolvedPath.startsWith(repoRootPrefix)
    && fs.existsSync(localResolvedPath)
  ) {
    return localIntakePath;
  }
  return templateIntakePath;
}

function exampleForAcceptedShape(acceptedShape, generatedAtUtc) {
  const requestDate = String(generatedAtUtc || `${stableDate()}T00:00:00Z`).slice(0, 10);
  return acceptedShape
    .replaceAll("YYYY-MM-DD", requestDate)
    .replaceAll("NNN", "123");
}

function requestForRef(ref, generatedAtUtc) {
  const plan = governLiveEvidenceRefPlan[ref.key];
  return {
    accepted_example: exampleForAcceptedShape(plan.acceptedShape, generatedAtUtc),
    accepted_shape: plan.acceptedShape,
    evidence_kind: plan.evidenceKind,
    key: ref.key,
    must_not_include: [
      "secret values",
      "raw payloads",
      "provider values",
      "account ids",
      "host addresses",
      "database URLs",
      "authorization headers",
    ],
    requested_action: plan.nextAction,
    status: ref.status,
  };
}

export function buildGovernLiveEvidenceOperatorRequest(statusResult, options = {}) {
  const missingRefs = statusResult.refs.filter((ref) => ref.status === "missing" || ref.status === "candidate_without_local_activation");
  const invalidRefs = statusResult.refs.filter((ref) => ref.status === "invalid");
  const generatedAtUtc = options.generatedAtUtc || `${stableDate()}T00:00:00Z`;

  return {
    generated_at_utc: generatedAtUtc,
    intake_path: publicIntakePathLabel(options.intakePath || resolveGovernLiveEvidenceOperatorRequestIntakePath()),
    invalid_ref_count: invalidRefs.length,
    missing_ref_count: missingRefs.length,
    next_action: missingRefs.length > 0
      ? "supply_public_safe_refs_in_ignored_local_intake"
      : invalidRefs.length > 0
        ? "repair_invalid_public_safe_refs"
        : "run_complete_mode_validation",
    product_id: "mullu-govern",
    proof_state: invalidRefs.length > 0 ? "Fail" : missingRefs.length > 0 ? "Unknown" : "Pass",
    public_write_route_allowed: false,
    raw_payloads_allowed: false,
    requests: missingRefs.map((ref) => requestForRef(ref, generatedAtUtc)),
    secret_values_allowed: false,
    solver_outcome: invalidRefs.length > 0 ? "GovernanceBlocked" : missingRefs.length > 0 ? "AwaitingEvidence" : "SolvedVerified",
  };
}

export function formatGovernLiveEvidenceOperatorRequest(packet) {
  return [
    `govern_live_evidence_operator_request=${packet.solver_outcome}`,
    `proof_state=${packet.proof_state}`,
    `product_id=${packet.product_id}`,
    `intake_path=${packet.intake_path}`,
    `missing_ref_count=${packet.missing_ref_count}`,
    `invalid_ref_count=${packet.invalid_ref_count}`,
    `public_write_route_allowed=${packet.public_write_route_allowed ? "true" : "false"}`,
    `next_action=${packet.next_action}`,
    ...packet.requests.map((request) => [
      `request=${request.key}`,
      `status=${request.status}`,
      `accepted_shape=${request.accepted_shape}`,
      `accepted_example=${request.accepted_example}`,
      `requested_action=${request.requested_action}`,
    ].join(" ")),
    "secret_values=not_read",
    "provider_values=not_read",
    "raw_payloads=not_read",
  ].join("\n");
}

export function emitGovernLiveEvidenceOperatorRequest(options = {}) {
  const intakePath = options.intakePath || resolveGovernLiveEvidenceOperatorRequestIntakePath();
  const statusResult = collectGovernLiveEvidenceRefStatus(intakePath);
  const packet = buildGovernLiveEvidenceOperatorRequest(statusResult, {
    generatedAtUtc: options.generatedAtUtc,
    intakePath,
  });

  if (options.outputPath) {
    const output = safeOutputPath(options.outputPath);
    if (output.finding) {
      return {
        packet: {
          generated_at_utc: options.generatedAtUtc || `${stableDate()}T00:00:00Z`,
          intake_path: publicIntakePathLabel(intakePath),
          invalid_ref_count: 0,
          missing_ref_count: 0,
          next_action: "select_public_safe_output_path",
          product_id: "mullu-govern",
          proof_state: "Fail",
          public_write_route_allowed: false,
          raw_payloads_allowed: false,
          requests: [],
          secret_values_allowed: false,
          solver_outcome: "GovernanceBlocked",
        },
        writeFinding: output.finding,
      };
    }
    fs.mkdirSync(path.dirname(output.path), { recursive: true });
    fs.writeFileSync(output.path, `${JSON.stringify(packet, null, 2)}\n`, "utf8");
  }

  return { packet, writeFinding: "" };
}

function runCli() {
  const args = process.argv.slice(2);
  const defaultIntakePath = resolveGovernLiveEvidenceOperatorRequestIntakePath();
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage());
    return;
  }

  const invalidArgs = unsupportedArgs(args);
  if (invalidArgs.length > 0) {
    const packet = {
      generated_at_utc: `${stableDate()}T00:00:00Z`,
      intake_path: defaultIntakePath,
      invalid_ref_count: 0,
      missing_ref_count: 0,
      next_action: "remove_unsupported_args",
      product_id: "mullu-govern",
      proof_state: "Fail",
      public_write_route_allowed: false,
      raw_payloads_allowed: false,
      requests: [],
      secret_values_allowed: false,
      solver_outcome: "GovernanceBlocked",
    };
    const result = { packet, writeFinding: `unsupported_args_count:${invalidArgs.length}` };
    if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
    else console.log(`${formatGovernLiveEvidenceOperatorRequest(packet)}\nfinding=${result.writeFinding}`);
    process.exit(1);
    return;
  }

  const result = emitGovernLiveEvidenceOperatorRequest({
    intakePath: pathArg(args, "--path=", defaultIntakePath),
    outputPath: pathArg(args, "--output=", ""),
  });
  if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
  else {
    console.log([
      formatGovernLiveEvidenceOperatorRequest(result.packet),
      result.writeFinding ? `finding=${result.writeFinding}` : "",
    ].filter(Boolean).join("\n"));
  }
  if (result.packet.solver_outcome === "GovernanceBlocked" || result.writeFinding) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
