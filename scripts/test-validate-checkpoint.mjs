/*
Purpose: verify the Mullusi checkpoint runner keeps the required gate order and optional backend behavior.
Governance scope: solo-developer handoff validation, command ordering, ops/API exposure/domain hardening/private recovery/public-boundary gate coverage, and backend opt-in boundary.
Dependencies: Node.js standard library and scripts/validate-checkpoint.mjs.
Invariants: tests inspect command plans without executing external validation commands.
*/

import assert from "node:assert/strict";
import { checkpointSteps } from "./validate-checkpoint.mjs";

function labels(options) {
  return checkpointSteps(options).map((step) => step.label);
}

function testDefaultCheckpointSteps() {
  const observed = labels();
  assert.deepEqual(observed, [
    "homepage boot syntax",
    "page runtime syntax",
    "preference runtime syntax",
    "substrate runtime syntax",
    "homepage lifecycle plan syntax",
    "homepage controller syntax",
    "homepage context syntax",
    "homepage registry loader syntax",
    "site content renderer syntax",
    "public surface renderer syntax",
    "product registry renderer syntax",
    "news activity renderer syntax",
    "route preferences syntax",
    "mullu route boot syntax",
    "playground simulator syntax",
    "playground route boot syntax",
    "proof renderer syntax",
    "proof route boot syntax",
    "product scaffold syntax",
    "product scaffold test syntax",
    "architecture boundary syntax",
    "architecture boundary test syntax",
    "checkpoint runner syntax",
    "checkpoint runner test syntax",
    "ops gate syntax",
    "ops gate test syntax",
    "API exposure gate syntax",
    "API exposure gate test syntax",
    "domain hardening preflight syntax",
    "domain hardening preflight test syntax",
    "private recovery inventory syntax",
    "private recovery inventory test syntax",
    "doctrine wording test syntax",
    "search indexing surface syntax",
    "search indexing surface test syntax",
    "website origin checker syntax",
    "website origin checker test syntax",
    "public visibility checker syntax",
    "public visibility checker test syntax",
    "live safety witness capture syntax",
    "live safety witness capture test syntax",
    "live safety witness checker syntax",
    "live safety witness checker test syntax",
    "security txt checker syntax",
    "security txt test syntax",
    "live security header checker syntax",
    "live security header test syntax",
    "live deployment integrity checker syntax",
    "live deployment integrity test syntax",
    "domain security checker syntax",
    "domain security test syntax",
    "www canonical redirect gate syntax",
    "www canonical redirect gate test syntax",
    "domain hardening promotion test syntax",
    "recovery witness promotion test syntax",
    "architecture boundaries",
    "product scaffold tests",
    "architecture boundary tests",
    "checkpoint runner tests",
    "ops gate",
    "ops gate tests",
    "API exposure gate",
    "API exposure gate tests",
    "domain hardening preflight",
    "domain hardening preflight tests",
    "private recovery inventory boundary",
    "private recovery inventory tests",
    "doctrine wording tests",
    "search indexing surface tests",
    "website origin classification tests",
    "public visibility gate tests",
    "live safety witness capture tests",
    "live safety witness artifact tests",
    "security txt metadata",
    "security txt tests",
    "live security header tests",
    "live deployment integrity tests",
    "domain security tests",
    "www canonical redirect gate",
    "www canonical redirect gate tests",
    "domain hardening promotion tests",
    "recovery witness promotion tests",
    "static site validation",
    "product manifests",
    "runtime witnesses",
    "generated platform drift",
    "Cloudflare artifact boundary",
    "registry source boundary",
  ]);
}

function testBackendStepIsOptIn() {
  assert.equal(labels().includes("backend tests"), false);
  assert.equal(labels({ includeBackend: true }).includes("backend tests"), true);
}

function testCommandsDoNotUseShellWrappers() {
  for (const step of checkpointSteps({ includeBackend: true })) {
    assert.equal(Array.isArray(step.args), true);
    assert.equal(step.args.length > 0, true);
    assert.equal(typeof step.cwd, "string");
    assert.equal(typeof step.label, "string");
    assert.equal(step.args.some((arg) => /[;&|]/.test(arg)), false);
    assert.equal(Number.isInteger(step.timeoutMs), true);
    assert.equal(step.timeoutMs > 0, true);
  }
}

function testCloudflareArtifactBoundaryHasLongBudget() {
  const step = checkpointSteps().find((candidate) => candidate.label === "Cloudflare artifact boundary");

  assert.equal(step?.timeoutMs, 180_000);
  assert.equal(step?.args.includes("scripts/test-build-cloudflare-pages.mjs"), true);
  assert.equal(typeof step?.cwd, "string");
}

testDefaultCheckpointSteps();
testBackendStepIsOptIn();
testCommandsDoNotUseShellWrappers();
testCloudflareArtifactBoundaryHasLongBudget();
console.log("checkpoint validation tests passed");
