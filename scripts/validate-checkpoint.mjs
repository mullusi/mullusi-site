/*
Purpose: run the Mullusi local checkpoint gates in a deterministic order for solo-developer handoff.
Governance scope: architecture boundary, ops gate, API exposure gate, domain-hardening preflight, private recovery inventory boundary, public-boundary test parity, generated platform drift, manifest authority, runtime witness state, public registry boundary, static site validation, Cloudflare artifact boundary, and optional backend tests.
Dependencies: Node.js standard library, repository validation scripts, and optional Python backend test runtime.
Invariants: commands run without shell interpolation, child gates are time-bounded, failures are reported with step labels, and backend tests run only when explicitly requested.
*/

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const backendRoot = path.join(repoRoot, "backend");

const nodeExecutable = process.execPath;
const requestedArgs = new Set(process.argv.slice(2));
const defaultStepTimeoutMs = 60_000;

function nodeStep(label, args, timeoutMs = defaultStepTimeoutMs) {
  return {
    args: [nodeExecutable, ...args],
    cwd: repoRoot,
    label,
    timeoutMs,
  };
}

function backendStep() {
  return {
    args: ["python", "-m", "unittest", "discover", "-s", "tests"],
    cwd: backendRoot,
    label: "backend tests",
    timeoutMs: defaultStepTimeoutMs,
  };
}

function frontendSyntaxSteps() {
  return [
    ["homepage boot syntax", "assets/app.js"],
    ["page runtime syntax", "assets/runtime/page-runtime.js"],
    ["preference runtime syntax", "assets/runtime/preference-runtime.js"],
    ["substrate runtime syntax", "assets/runtime/substrate-runtime.js"],
    ["homepage lifecycle plan syntax", "assets/runtime/homepage-lifecycle-plan.js"],
    ["homepage controller syntax", "assets/runtime/homepage-controller.js"],
    ["homepage context syntax", "assets/runtime/homepage-context.js"],
    ["homepage registry loader syntax", "assets/registry/homepage-registry.js"],
    ["site content renderer syntax", "assets/render/site-content.js"],
    ["public surface renderer syntax", "assets/render/public-surface-registry.js"],
    ["product registry renderer syntax", "assets/render/product-registry.js"],
    ["news activity renderer syntax", "assets/render/news-activity.js"],
    ["route preferences syntax", "assets/pages/route-preferences.js"],
    ["mullu route boot syntax", "assets/pages/mullu.js"],
    ["playground simulator syntax", "assets/pages/playground-simulator.js"],
    ["playground route boot syntax", "assets/pages/playground.js"],
    ["proof renderer syntax", "assets/pages/proof-renderer.js"],
    ["proof route boot syntax", "assets/pages/proof.js"],
    ["Mullu Eye Helper syntax", "assets/helper/mullu-eye-helper-v3.bundle.js"],
    ["Mullu Eye Helper install syntax", "assets/helper/mullu-eye-helper-v3.install.js"],
  ].map(([label, filePath]) => nodeStep(label, ["--check", filePath]));
}

export function checkpointSteps(options = {}) {
  const includeBackend = options.includeBackend === true;
  const steps = [
    ...frontendSyntaxSteps(),
    nodeStep("product scaffold syntax", ["--check", "scripts/scaffold-product.mjs"]),
    nodeStep("local preview server syntax", ["--check", "scripts/serve-local-preview.mjs"]),
    nodeStep("search indexing surface syntax", ["--check", "scripts/check-search-indexing-surface.mjs"]),
    nodeStep("website origin checker syntax", ["--check", "scripts/check-website-origin.mjs"]),
    nodeStep("public visibility checker syntax", ["--check", "scripts/check-public-visibility.mjs"]),
    nodeStep("live safety witness capture syntax", ["--check", "scripts/capture-live-safety-witness.mjs"]),
    nodeStep("live safety witness checker syntax", ["--check", "scripts/check-live-safety-witness.mjs"]),
    nodeStep("live security header checker syntax", ["--check", "scripts/check-live-security-headers.mjs"]),
    nodeStep("live deployment integrity checker syntax", ["--check", "scripts/check-live-deployment-integrity.mjs"]),
    nodeStep("domain security checker syntax", ["--check", "scripts/check-domain-security.mjs"]),
    nodeStep("ops next-action reporter syntax", ["--check", "scripts/report-ops-next-action.mjs"]),
    nodeStep("release readiness summary validator syntax", ["--check", "scripts/validate-release-readiness-summary.mjs"]),
    nodeStep("govern public beta approval validator syntax", ["--check", "scripts/validate-govern-public-beta-approval-packet.mjs"]),
    nodeStep("govern evaluate write-route decision validator syntax", ["--check", "scripts/validate-govern-evaluate-write-route-decision.mjs"]),
    nodeStep("govern runtime closure packet validator syntax", ["--check", "scripts/validate-govern-runtime-closure-packet.mjs"]),
    nodeStep("govern support readiness validator syntax", ["--check", "scripts/validate-govern-support-readiness.mjs"]),
    nodeStep("govern privacy-retention preflight validator syntax", ["--check", "scripts/validate-govern-privacy-retention-preflight.mjs"]),
    nodeStep("govern evaluate contract preflight validator syntax", ["--check", "scripts/validate-govern-evaluate-contract-preflight.mjs"]),
    nodeStep("govern product-status preflight validator syntax", ["--check", "scripts/validate-govern-product-status-preflight.mjs"]),
    nodeStep("govern dashboard operator-readiness preflight validator syntax", ["--check", "scripts/validate-govern-dashboard-operator-readiness-preflight.mjs"]),
    nodeStep("govern public-claim update preflight validator syntax", ["--check", "scripts/validate-govern-public-claim-update-preflight.mjs"]),
    nodeStep("govern approval-readiness preflight validator syntax", ["--check", "scripts/validate-govern-approval-readiness-preflight.mjs"]),
    nodeStep("govern live evidence ref contract syntax", ["--check", "scripts/govern-live-evidence-ref-contract.mjs"]),
    nodeStep("govern live evidence ref intake validator syntax", ["--check", "scripts/validate-govern-live-evidence-ref-intake.mjs"]),
    nodeStep("govern live evidence ref status reporter syntax", ["--check", "scripts/report-govern-live-evidence-ref-status.mjs"]),
    nodeStep("govern live evidence ref collection checklist validator syntax", ["--check", "scripts/validate-govern-live-evidence-ref-collection-checklist.mjs"]),
    nodeStep("govern shared evidence scanner boundary syntax", ["--check", "scripts/validate-govern-shared-evidence-scanner-boundary.mjs"]),
    nodeStep("govern live evidence sequence preflight validator syntax", ["--check", "scripts/validate-govern-live-evidence-sequence-preflight.mjs"]),
    nodeStep("govern live evidence operator runbook validator syntax", ["--check", "scripts/validate-govern-live-evidence-operator-runbook.mjs"]),
    nodeStep("architecture boundaries", ["scripts/validate-architecture-boundaries.mjs"]),
    nodeStep("product scaffold tests", ["scripts/test-scaffold-product.mjs"]),
    nodeStep("local preview server tests", ["scripts/test-serve-local-preview.mjs"]),
    nodeStep("architecture boundary tests", ["scripts/test-validate-architecture-boundaries.mjs"]),
    nodeStep("checkpoint runner tests", ["scripts/test-validate-checkpoint.mjs"]),
    nodeStep("Mullu Eye Helper contract tests", ["scripts/test-mullu-eye-helper-contract.mjs"]),
    nodeStep("ops gate", ["scripts/check-ops-gates.mjs"]),
    nodeStep("ops gate tests", ["scripts/test-ops-gates.mjs"]),
    nodeStep("ops next-action reporter", ["scripts/report-ops-next-action.mjs"]),
    nodeStep("ops next-action reporter tests", ["scripts/test-report-ops-next-action.mjs"]),
    nodeStep("release readiness summary", ["scripts/validate-release-readiness-summary.mjs"]),
    nodeStep("release readiness summary tests", ["scripts/test-validate-release-readiness-summary.mjs"]),
    nodeStep("govern public beta approval packet", ["scripts/validate-govern-public-beta-approval-packet.mjs"]),
    nodeStep("govern public beta approval packet tests", ["scripts/test-validate-govern-public-beta-approval-packet.mjs"]),
    nodeStep("govern evaluate write-route decision", ["scripts/validate-govern-evaluate-write-route-decision.mjs"]),
    nodeStep("govern evaluate write-route decision tests", ["scripts/test-validate-govern-evaluate-write-route-decision.mjs"]),
    nodeStep("govern runtime closure packet", ["scripts/validate-govern-runtime-closure-packet.mjs"]),
    nodeStep("govern runtime closure packet tests", ["scripts/test-validate-govern-runtime-closure-packet.mjs"]),
    nodeStep("govern support readiness", ["scripts/validate-govern-support-readiness.mjs"]),
    nodeStep("govern support readiness tests", ["scripts/test-validate-govern-support-readiness.mjs"]),
    nodeStep("govern privacy-retention preflight", ["scripts/validate-govern-privacy-retention-preflight.mjs"]),
    nodeStep("govern privacy-retention preflight tests", ["scripts/test-validate-govern-privacy-retention-preflight.mjs"]),
    nodeStep("govern evaluate contract preflight", ["scripts/validate-govern-evaluate-contract-preflight.mjs"]),
    nodeStep("govern evaluate contract preflight tests", ["scripts/test-validate-govern-evaluate-contract-preflight.mjs"]),
    nodeStep("govern product-status preflight", ["scripts/validate-govern-product-status-preflight.mjs"]),
    nodeStep("govern product-status preflight tests", ["scripts/test-validate-govern-product-status-preflight.mjs"]),
    nodeStep("govern dashboard operator-readiness preflight", ["scripts/validate-govern-dashboard-operator-readiness-preflight.mjs"]),
    nodeStep("govern dashboard operator-readiness preflight tests", ["scripts/test-validate-govern-dashboard-operator-readiness-preflight.mjs"]),
    nodeStep("govern public-claim update preflight", ["scripts/validate-govern-public-claim-update-preflight.mjs"]),
    nodeStep("govern public-claim update preflight tests", ["scripts/test-validate-govern-public-claim-update-preflight.mjs"]),
    nodeStep("govern approval-readiness preflight", ["scripts/validate-govern-approval-readiness-preflight.mjs"]),
    nodeStep("govern approval-readiness preflight tests", ["scripts/test-validate-govern-approval-readiness-preflight.mjs"]),
    nodeStep("govern live evidence ref contract tests", ["scripts/test-govern-live-evidence-ref-contract.mjs"]),
    nodeStep("govern live evidence ref intake", ["scripts/validate-govern-live-evidence-ref-intake.mjs"]),
    nodeStep("govern live evidence ref intake tests", ["scripts/test-validate-govern-live-evidence-ref-intake.mjs"]),
    nodeStep("govern live evidence ref status", ["scripts/report-govern-live-evidence-ref-status.mjs"]),
    nodeStep("govern live evidence ref status tests", ["scripts/test-report-govern-live-evidence-ref-status.mjs"]),
    nodeStep("govern live evidence ref collection checklist", ["scripts/validate-govern-live-evidence-ref-collection-checklist.mjs"]),
    nodeStep("govern live evidence ref collection checklist tests", ["scripts/test-validate-govern-live-evidence-ref-collection-checklist.mjs"]),
    nodeStep("govern shared evidence scanner boundary", ["scripts/validate-govern-shared-evidence-scanner-boundary.mjs"]),
    nodeStep("govern shared evidence scanner boundary tests", ["scripts/test-validate-govern-shared-evidence-scanner-boundary.mjs"]),
    nodeStep("govern live evidence sequence preflight", ["scripts/validate-govern-live-evidence-sequence-preflight.mjs"]),
    nodeStep("govern live evidence sequence preflight tests", ["scripts/test-validate-govern-live-evidence-sequence-preflight.mjs"]),
    nodeStep("govern live evidence operator runbook", ["scripts/validate-govern-live-evidence-operator-runbook.mjs"]),
    nodeStep("govern live evidence operator runbook tests", ["scripts/test-validate-govern-live-evidence-operator-runbook.mjs"]),
    nodeStep("API exposure gate", ["scripts/check-api-exposure-gate.mjs"]),
    nodeStep("API exposure gate tests", ["scripts/test-check-api-exposure-gate.mjs"]),
    nodeStep("API production readiness", ["scripts/check-api-production-readiness.mjs"]),
    nodeStep("API production readiness tests", ["scripts/test-check-api-production-readiness.mjs"]),
    nodeStep("domain hardening preflight", ["scripts/check-domain-hardening-preflight.mjs"]),
    nodeStep("domain hardening preflight tests", ["scripts/test-check-domain-hardening-preflight.mjs"]),
    nodeStep("private recovery inventory boundary", ["scripts/check-private-recovery-inventory.mjs", "--allow-missing"]),
    nodeStep("private recovery inventory tests", ["scripts/test-private-recovery-inventory.mjs"]),
    nodeStep("doctrine wording tests", ["scripts/test-validate-site-doctrine-wording.mjs"]),
    nodeStep("search indexing surface tests", ["scripts/test-check-search-indexing-surface.mjs"]),
    nodeStep("website origin classification tests", ["scripts/test-check-website-origin.mjs"]),
    nodeStep("public visibility gate tests", ["scripts/test-check-public-visibility.mjs"]),
    nodeStep("news fetch error tests", ["scripts/test-fetch-news-errors.mjs"]),
    nodeStep("live safety witness capture tests", ["scripts/test-capture-live-safety-witness.mjs"]),
    nodeStep("live safety witness artifact tests", ["scripts/test-check-live-safety-witness.mjs"]),
    nodeStep("security txt metadata", ["scripts/check-security-txt.mjs"]),
    nodeStep("security txt tests", ["scripts/test-check-security-txt.mjs"]),
    nodeStep("live security header tests", ["scripts/test-check-live-security-headers.mjs"]),
    nodeStep("live deployment integrity tests", ["scripts/test-check-live-deployment-integrity.mjs"]),
    nodeStep("domain security tests", ["scripts/test-check-domain-security.mjs"]),
    nodeStep("www canonical redirect gate", ["scripts/check-www-canonical-redirect-gate.mjs", "--allow-pending"]),
    nodeStep("www canonical redirect gate tests", ["scripts/test-www-canonical-redirect-gate.mjs"]),
    nodeStep("domain hardening promotion tests", ["scripts/test-promote-domain-hardening-preflight.mjs"]),
    nodeStep("recovery witness promotion tests", ["scripts/test-promote-recovery-witness.mjs"]),
    nodeStep("static site validation", ["scripts/validate-site.mjs"]),
    nodeStep("product manifests", ["scripts/validate-manifests.mjs"]),
    nodeStep("runtime witnesses", ["scripts/validate-runtime-witnesses.mjs"]),
    nodeStep("generated platform error tests", ["scripts/test-generate-platform-errors.mjs"]),
    nodeStep("generated platform drift", ["scripts/generate-platform.mjs", "--check"]),
    nodeStep("Cloudflare artifact boundary", ["scripts/test-build-cloudflare-pages.mjs"], 180_000),
    nodeStep("registry source boundary tests", ["scripts/test-verify-registry-repos.mjs"]),
    nodeStep("registry source boundary", ["scripts/verify-registry-repos.mjs"]),
  ];
  if (includeBackend) steps.push(backendStep());
  return steps;
}

function runStep(step) {
  console.log(`checkpoint_step:${step.label}`);
  const [command, ...args] = step.args;
  return spawnSync(command, args, {
    cwd: step.cwd,
    shell: false,
    stdio: "inherit",
    timeout: step.timeoutMs ?? defaultStepTimeoutMs,
  });
}

export function publicStepErrorCode(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/ETIMEDOUT|timed?\s*out|timeout/i.test(message)) {
    return "step_timed_out";
  }
  if (/ENOENT|not found|command/i.test(message)) {
    return "step_command_unavailable";
  }
  return "step_execution_unavailable";
}

export function runCheckpoint(options = {}) {
  const failures = [];
  const steps = checkpointSteps(options);
  for (const step of steps) {
    const result = runStep(step);
    if (result.error) {
      failures.push(`${step.label}:${publicStepErrorCode(result.error)}`);
      continue;
    }
    if (result.status !== 0) {
      failures.push(`${step.label}:exit_${result.status}`);
    }
  }
  return {
    failures,
    state: failures.length > 0 ? "blocked" : "passed",
    stepCount: steps.length,
  };
}

function printHelp() {
  console.log([
    "Usage: node scripts/validate-checkpoint.mjs [--backend]",
    "",
    "Runs the core Mullusi handoff gates in deterministic order.",
    "--backend also runs backend Python unit tests.",
  ].join("\n"));
}

function main() {
  if (requestedArgs.has("--help") || requestedArgs.has("-h")) {
    printHelp();
    return;
  }
  const result = runCheckpoint({
    includeBackend: requestedArgs.has("--backend"),
  });
  if (result.failures.length > 0) {
    console.error(result.failures.join("\n"));
    process.exit(1);
  }
  console.log(`checkpoint validation passed: ${result.stepCount} steps`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main();
}
