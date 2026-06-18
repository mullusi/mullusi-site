/*
Purpose: verify the product scaffold creates governed private-incubation bundles without public exposure.
Governance scope: dry-run default, write boundary, duplicate prevention, runtime witness creation, and schema-compatible defaults.
Dependencies: Node.js standard library and scripts/scaffold-product.mjs.
Invariants: tests use isolated temporary roots, never mutate repository source files, and assert fail-closed behavior before writes.
*/

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildScaffoldPlan, parseScaffoldArgs, publicCliErrorCode, writeScaffoldPlan } from "./scaffold-product.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const scaffoldScriptPath = path.join(repoRoot, "scripts", "scaffold-product.mjs");
const runtimeWitnessRegistryPath = "ops/runtime-witness/registry.json";

function writeJson(rootPath, relativePath, value) {
  const targetPath = path.join(rootPath, relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJson(rootPath, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(rootPath, relativePath), "utf8"));
}

function createFixtureRoot(registry = {}) {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "mullusi-product-scaffold-"));
  writeJson(rootPath, runtimeWitnessRegistryPath, {
    schemaVersion: "1.0.0",
    authority: "mullusi-runtime-witness-authority",
    witnesses: [],
    ...registry,
  });
  return rootPath;
}

function withFixture(assertion, registry) {
  const rootPath = createFixtureRoot(registry);
  try {
    assertion(rootPath);
  } finally {
    fs.rmSync(rootPath, { force: true, recursive: true });
  }
}

function defaultPlan(overrides = {}) {
  return buildScaffoldPlan({
    id: "mullu-world-modeling",
    name: "Mullu World Modeling",
    category: "world-modeling",
    ...overrides,
  });
}

function assertThrowsMessage(action, expectedMessage) {
  assert.throws(action, (error) => {
    assert.equal(error instanceof Error, true);
    assert.equal(error.message, expectedMessage);
    return true;
  });
}

function testBuildPlanDefaults() {
  const plan = defaultPlan();
  assert.equal(plan.options.publicRoute, "/world-modeling/");
  assert.equal(plan.options.service, "world-modeling-service");
  assert.equal(plan.options.apiPath, "/v1/world-modeling/request");
  assert.equal(plan.options.homepageRegistry, false);
  assert.equal(plan.runtimeWitness.publicExposure.allowed, false);
  assert.deepEqual(plan.files.map((file) => file.relativePath), [
    "products/mullu-world-modeling/product.manifest.json",
    "contracts/world-modeling/request.schema.json",
    "privacy/mullu-world-modeling.policy.json",
    "privacy/mullu-world-modeling.retention.json",
    "proof/mullu-world-modeling.proof.json",
  ]);
}

function testParseScaffoldArgs() {
  const options = parseScaffoldArgs([
    "--write",
    "--homepage",
    "--id=mullu-physics",
    "--name=Mullu Physics",
    "--category=physics",
    "--route=physics",
    "--api-method=get",
  ]);
  assert.equal(options.write, true);
  assert.equal(options.homepageRegistry, true);
  assert.equal(options.id, "mullu-physics");
  assert.equal(options.apiMethod, "get");
  assertThrowsMessage(() => parseScaffoldArgs(["--unknown=value"]), "unsupported_arg:--unknown=value");
}

function testWriteCreatesFilesAndRuntimeWitness() {
  withFixture((rootPath) => {
    const result = writeScaffoldPlan(rootPath, defaultPlan());
    const registry = readJson(rootPath, runtimeWitnessRegistryPath);
    const manifest = readJson(rootPath, "products/mullu-world-modeling/product.manifest.json");
    assert.equal(result.state, "Written");
    assert.equal(result.fileCount, 5);
    assert.equal(registry.witnesses.length, 1);
    assert.equal(registry.witnesses[0].productId, "mullu-world-modeling");
    assert.equal(manifest.status, "private-incubation");
    assert.equal(manifest.presentation.homepageRegistry, false);
  });
}

function testWriteBlocksExistingTargetBeforePartialWrite() {
  withFixture((rootPath) => {
    writeJson(rootPath, "products/mullu-world-modeling/product.manifest.json", {});
    assertThrowsMessage(() => writeScaffoldPlan(rootPath, defaultPlan()), "target_exists:products/mullu-world-modeling/product.manifest.json");
    assert.equal(fs.existsSync(path.join(rootPath, "contracts/world-modeling/request.schema.json")), false);
    assert.equal(readJson(rootPath, runtimeWitnessRegistryPath).witnesses.length, 0);
  });
}

function testWriteBlocksDuplicateRuntimeWitnessBeforePartialWrite() {
  withFixture((rootPath) => {
    assertThrowsMessage(() => writeScaffoldPlan(rootPath, defaultPlan()), "runtime_witness_exists:mullu-world-modeling");
    assert.equal(fs.existsSync(path.join(rootPath, "products/mullu-world-modeling/product.manifest.json")), false);
    assert.equal(readJson(rootPath, runtimeWitnessRegistryPath).witnesses.length, 1);
  }, {
    witnesses: [{ productId: "mullu-world-modeling" }],
  });
}

function testCliDryRunDoesNotWrite() {
  withFixture((rootPath) => {
    const result = spawnSync(process.execPath, [
      scaffoldScriptPath,
      `--root=${rootPath}`,
      "--id=mullu-physics",
      "--name=Mullu Physics",
      "--category=physics",
    ], {
      cwd: repoRoot,
      encoding: "utf8",
      shell: false,
    });
    assert.equal(result.status, 0);
    assert.equal(result.stdout.includes("scaffold_state=DryRun"), true);
    assert.equal(result.stdout.includes("next_action=rerun with --write after reviewing planned files"), true);
    assert.equal(fs.existsSync(path.join(rootPath, "products/mullu-physics/product.manifest.json")), false);
    assert.equal(readJson(rootPath, runtimeWitnessRegistryPath).witnesses.length, 0);
  });
}

function testCliRedactsUnsupportedArgument() {
  const result = spawnSync(process.execPath, [
    scaffoldScriptPath,
    "--unknown=value",
  ], {
    cwd: repoRoot,
    encoding: "utf8",
    shell: false,
  });

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /unsupported_arg/);
  assert.doesNotMatch(result.stderr, /--unknown=value/);
}

function testCliRedactsExistingTargetAndRuntimeWitness() {
  withFixture((targetRoot) => {
    writeJson(targetRoot, "products/mullu-world-modeling/product.manifest.json", {});
    const targetResult = spawnSync(process.execPath, [
      scaffoldScriptPath,
      `--root=${targetRoot}`,
      "--id=mullu-world-modeling",
      "--name=Mullu World Modeling",
      "--category=world-modeling",
      "--write",
    ], {
      cwd: repoRoot,
      encoding: "utf8",
      shell: false,
    });

    assert.equal(targetResult.status, 1);
    assert.equal(targetResult.stdout, "");
    assert.match(targetResult.stderr, /target_exists/);
    assert.doesNotMatch(targetResult.stderr, /product\.manifest\.json/);
  });

  withFixture((witnessRoot) => {
    const witnessResult = spawnSync(process.execPath, [
      scaffoldScriptPath,
      `--root=${witnessRoot}`,
      "--id=mullu-world-modeling",
      "--name=Mullu World Modeling",
      "--category=world-modeling",
      "--write",
    ], {
      cwd: repoRoot,
      encoding: "utf8",
      shell: false,
    });

    assert.equal(witnessResult.status, 1);
    assert.equal(witnessResult.stdout, "");
    assert.match(witnessResult.stderr, /runtime_witness_exists/);
    assert.doesNotMatch(witnessResult.stderr, /mullu-world-modeling/);
  }, {
    witnesses: [{ productId: "mullu-world-modeling" }],
  });
}

function testPublicCliErrorCodeRedactsRawValues() {
  const unsupported = publicCliErrorCode(new Error("unsupported_arg:--private=value"));
  const target = publicCliErrorCode(new Error("target_exists:products/private/product.manifest.json"));
  const witness = publicCliErrorCode(new Error("runtime_witness_exists:mullu-private"));
  const fallback = publicCliErrorCode(new Error("unexpected private path C:\\secret\\manifest.json"));
  const joined = [unsupported, target, witness, fallback].join("\n");

  assert.equal(unsupported, "unsupported_arg");
  assert.equal(target, "target_exists");
  assert.equal(witness, "runtime_witness_exists");
  assert.equal(fallback, "scaffold_product_unavailable");
  assert.doesNotMatch(joined, /private|secret|manifest|mullu-private|C:\\/);
}

function testInvalidInputsBlock() {
  assertThrowsMessage(() => defaultPlan({ id: "Mullu Physics" }), "id_invalid:Mullu Physics");
  assertThrowsMessage(() => defaultPlan({ apiMethod: "PATCH" }), "api_method_invalid:PATCH");
  assertThrowsMessage(() => defaultPlan({ dataClasses: "valid_class,InvalidClass" }), "data_class_invalid:InvalidClass");
}

testBuildPlanDefaults();
testParseScaffoldArgs();
testWriteCreatesFilesAndRuntimeWitness();
testWriteBlocksExistingTargetBeforePartialWrite();
testWriteBlocksDuplicateRuntimeWitnessBeforePartialWrite();
testCliDryRunDoesNotWrite();
testCliRedactsUnsupportedArgument();
testCliRedactsExistingTargetAndRuntimeWitness();
testPublicCliErrorCodeRedactsRawValues();
testInvalidInputsBlock();
console.log("product scaffold tests passed");
