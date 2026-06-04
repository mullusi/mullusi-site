/*
Purpose: verify the architecture boundary validator blocks structural drift.
Governance scope: homepage lifecycle plan authority, legacy registry absence, manifest registry key authority, and assistant handoff trace.
Dependencies: Node.js standard library and scripts/validate-architecture-boundaries.mjs.
Invariants: tests create isolated fixtures, never mutate repository source files, and assert both pass and fail paths.
*/

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateArchitectureBoundaries } from "./validate-architecture-boundaries.mjs";

function writeFixtureFile(rootPath, relativePath, content) {
  const targetPath = path.join(rootPath, relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, "utf8");
}

function createFixture() {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "mullusi-architecture-boundary-"));
  writeFixtureFile(
    rootPath,
    "index.html",
    [
      '<script defer src="assets/runtime/page-runtime.js?v=2026.05.platform.29"></script>',
      '<script defer src="assets/runtime/preference-runtime.js?v=2026.05.platform.29"></script>',
      '<script defer src="assets/runtime/substrate-runtime.js?v=2026.05.platform.29"></script>',
      '<script defer src="assets/runtime/homepage-lifecycle-plan.js?v=2026.05.platform.29"></script>',
      '<script defer src="assets/runtime/homepage-controller.js?v=2026.05.platform.29"></script>',
      '<script defer src="assets/registry/homepage-registry.js?v=2026.05.platform.29"></script>',
      '<script defer src="assets/render/site-content.js?v=2026.05.platform.29"></script>',
      '<script defer src="assets/render/public-surface-registry.js?v=2026.05.platform.29"></script>',
      '<script defer src="assets/render/product-registry.js?v=2026.05.platform.29"></script>',
      '<script defer src="assets/render/news-activity.js?v=2026.05.platform.29"></script>',
      '<script defer src="assets/runtime/homepage-context.js?v=2026.05.platform.29"></script>',
      '<script defer src="assets/app.js?v=2026.05.platform.29"></script>',
    ].join("\n"),
  );
  writeFixtureFile(
    rootPath,
    ".github/workflows/validate.yml",
    [
      "name: Validate Site",
      "run: node --check scripts/fetch-news.mjs",
      "name: Run unified checkpoint",
      "run: node scripts/validate-checkpoint.mjs",
      "run: node scripts/check-domain-hardening-preflight.mjs --expect-blocked",
      "run: node scripts/check-api-exposure-gate.mjs --expect-blocked",
      "run: node scripts/check-api-production-readiness.mjs --expect-blocked",
      "run: node scripts/check-private-recovery-inventory.mjs --allow-missing",
    ].join("\n"),
  );
  writeFixtureFile(
    rootPath,
    "package.json",
    JSON.stringify({
      name: "mullusi-website",
      private: true,
      scripts: {
        "build:cloudflare": "node scripts/build-cloudflare-pages.mjs",
        checkpoint: "node scripts/validate-checkpoint.mjs",
        "checkpoint:backend": "node scripts/validate-checkpoint.mjs --backend",
        "generate:check": "node scripts/generate-platform.mjs --check",
        "generate:platform": "node scripts/generate-platform.mjs",
        "scaffold:product": "node scripts/scaffold-product.mjs",
        "test:api-exposure": "node scripts/test-check-api-exposure-gate.mjs",
        "test:api-production": "node scripts/test-check-api-production-readiness.mjs",
        "test:architecture": "node scripts/test-validate-architecture-boundaries.mjs",
        "test:checkpoint": "node scripts/test-validate-checkpoint.mjs",
        "test:domain-hardening": "node scripts/test-check-domain-hardening-preflight.mjs",
        "test:ops": "node scripts/test-ops-gates.mjs",
        "test:private-recovery": "node scripts/test-private-recovery-inventory.mjs",
        "test:scaffold-product": "node scripts/test-scaffold-product.mjs",
        validate: "node scripts/validate-checkpoint.mjs",
        "validate:api-exposure": "node scripts/check-api-exposure-gate.mjs",
        "validate:api-production": "node scripts/check-api-production-readiness.mjs",
        "validate:architecture": "node scripts/validate-architecture-boundaries.mjs",
        "validate:domain-hardening": "node scripts/check-domain-hardening-preflight.mjs",
        "validate:manifests": "node scripts/validate-manifests.mjs",
        "validate:ops": "node scripts/check-ops-gates.mjs",
        "validate:private-recovery": "node scripts/check-private-recovery-inventory.mjs --allow-missing",
        "validate:runtime": "node scripts/validate-runtime-witnesses.mjs",
        "validate:site": "node scripts/validate-site.mjs",
      },
    }),
  );
  writeFixtureFile(rootPath, "assets/app.js", "window.MullusiHomepageContext.createHomepageRuntime();\n");
  writeFixtureFile(rootPath, "assets/runtime/page-runtime.js", "window.MullusiPageRuntime = {};\n");
  writeFixtureFile(rootPath, "assets/runtime/preference-runtime.js", "window.MullusiPreferenceRuntime = {};\n");
  writeFixtureFile(rootPath, "assets/runtime/substrate-runtime.js", "window.MullusiSubstrateRuntime = {};\n");
  writeFixtureFile(
    rootPath,
    "assets/runtime/homepage-lifecycle-plan.js",
    [
      "window.MullusiHomepageLifecyclePlan = {",
      "  siteRenderActions: ['renderPlatformLayers'],",
      "  registryRenderActions: ['renderProductRegistryControls', 'renderRepoGrid'],",
      "  registryFallbackSelectors: [],",
      "  siteFailureSelectors: [],",
      "  registryFailureSelectors: [],",
      "  languageChangeActions: []",
      "};",
    ].join("\n"),
  );
  writeFixtureFile(
    rootPath,
    "assets/runtime/homepage-controller.js",
    [
      "function lifecyclePlan() { return window.MullusiHomepageLifecyclePlan; }",
      "function runActionPlan() {}",
      "function renderSiteContent() { return lifecyclePlan().siteRenderActions; }",
      "function renderRegistryContent() { return lifecyclePlan().registryRenderActions; }",
      "function callRequired(context, name) { return context[name](); }",
      "function initContent(context) { callRequired(context, \"renderRegistryLoadError\"); }",
      "window.MullusiHomepageController = { runActionPlan, initContent };",
    ].join("\n"),
  );
  writeFixtureFile(rootPath, "assets/runtime/homepage-context.js", "function renderRegistryLoadError() {}\n");
  writeFixtureFile(
    rootPath,
    "assets/registry/homepage-registry.js",
    "const sources = ['data/generated/homepage-product-registry.json', 'data/manual/public-surfaces.json'];\n",
  );
  writeFixtureFile(rootPath, "assets/render/site-content.js", "window.MullusiSiteContentRenderer = {};\n");
  writeFixtureFile(
    rootPath,
    "assets/render/public-surface-registry.js",
    "function renderRegistryLoadError() { return 'repo-card error-card'; }\n",
  );
  writeFixtureFile(rootPath, "assets/render/product-registry.js", "window.MullusiProductRegistryRenderer = {};\n");
  writeFixtureFile(rootPath, "assets/render/news-activity.js", "window.MullusiNewsActivityRenderer = {};\n");
  writeFixtureFile(rootPath, "assets/pages/route-preferences.js", "window.MullusiRoutePreferences = {};\n");
  writeFixtureFile(rootPath, "assets/pages/mullu.js", "MullusiRoutePreferences.bindThemeToggle();\n");
  writeFixtureFile(rootPath, "assets/pages/playground-simulator.js", "function evaluate() {}\nwindow.MullusiPlaygroundSimulator = {};\n");
  writeFixtureFile(rootPath, "assets/pages/playground.js", "MullusiPlaygroundSimulator.init();\n");
  writeFixtureFile(rootPath, "assets/pages/proof-renderer.js", "const source = '../data/generated/products.json';\nwindow.MullusiProofRenderer = {};\n");
  writeFixtureFile(rootPath, "assets/pages/proof.js", "MullusiRoutePreferences.bindThemeToggle();\nMullusiProofRenderer.init();\n");
  writeFixtureFile(rootPath, "data/generated/products.json", "{}\n");
  writeFixtureFile(
    rootPath,
    "data/generated/homepage-product-registry.json",
    JSON.stringify({
      manifestCandidates: [{ homepageRegistry: false }],
      productRegistry: [{ homepageRegistry: true }],
    }),
  );
  writeFixtureFile(rootPath, "data/manual/public-surfaces.json", "{}\n");
  writeFixtureFile(rootPath, "schemas/product-manifest.schema.json", '{"homepageRegistry":true}\n');
  writeFixtureFile(rootPath, "products/example/product.manifest.json", '{"presentation":{"homepageRegistry":true}}\n');
  writeFixtureFile(
    rootPath,
    "scripts/scaffold-product.mjs",
    [
      "/* Invariants: dry-run by default. */",
      "export function buildScaffoldPlan(input) { return { publicExposure: { allowed: false }, homepageRegistry: input.homepageRegistry === true }; }",
      "export function parseScaffoldArgs() {}",
      "export function writeScaffoldPlan() { throw new Error('target_exists:example'); }",
      "const duplicate = 'runtime_witness_exists:';",
      "const result = { state: \"DryRun\" };",
    ].join("\n"),
  );
  writeFixtureFile(
    rootPath,
    "scripts/test-scaffold-product.mjs",
    [
      "function testCliDryRunDoesNotWrite() {}",
      "function testWriteBlocksExistingTargetBeforePartialWrite() {}",
      "function testWriteBlocksDuplicateRuntimeWitnessBeforePartialWrite() {}",
      "function testInvalidInputsBlock() {}",
    ].join("\n"),
  );
  writeFixtureFile(
    rootPath,
    "ops/solo-developer-assistant-handoff.md",
    [
      "# Handoff",
      "## Source Authority",
      "## Foundation Mode",
      "## Forbidden Assistant Moves",
      "## Required Validation Trace",
      "node scripts/scaffold-product.mjs",
      "node scripts/test-scaffold-product.mjs",
      "node --check assets/runtime/homepage-lifecycle-plan.js",
      "node scripts/validate-architecture-boundaries.mjs",
      "STATUS:",
    ].join("\n"),
  );
  return rootPath;
}

function withFixture(assertion) {
  const rootPath = createFixture();
  try {
    assertion(rootPath);
  } finally {
    fs.rmSync(rootPath, { force: true, recursive: true });
  }
}

function assertHasFinding(result, expectedPrefix) {
  assert.equal(
    result.failures.some((finding) => finding.startsWith(expectedPrefix)),
    true,
    `expected finding ${expectedPrefix}, got ${result.failures.join(",")}`,
  );
}

function testFixturePasses() {
  withFixture((rootPath) => {
    const result = validateArchitectureBoundaries({ repoRoot: rootPath });
    assert.equal(result.state, "passed");
    assert.deepEqual(result.failures, []);
  });
}

function testLegacyRegistryFileBlocks() {
  withFixture((rootPath) => {
    writeFixtureFile(rootPath, "data/products.json", "{}\n");
    const result = validateArchitectureBoundaries({ repoRoot: rootPath });
    assert.equal(result.state, "blocked");
    assertHasFinding(result, "forbidden_legacy_registry_present:data/products.json");
  });
}

function testControllerPlanOwnershipBlocks() {
  withFixture((rootPath) => {
    fs.appendFileSync(path.join(rootPath, "assets/runtime/homepage-controller.js"), "\nconst drift = \"renderRepoGrid\";\n", "utf8");
    const result = validateArchitectureBoundaries({ repoRoot: rootPath });
    assert.equal(result.state, "blocked");
    assertHasFinding(result, "homepage_controller_forbidden:\"renderRepoGrid\"");
  });
}

function testLegacyManifestKeyBlocks() {
  withFixture((rootPath) => {
    writeFixtureFile(rootPath, "products/example/product.manifest.json", '{"presentation":{"compatibilityRegistry":true}}\n');
    const result = validateArchitectureBoundaries({ repoRoot: rootPath });
    assert.equal(result.state, "blocked");
    assertHasFinding(result, "product_manifest:products/example/product.manifest.json_missing:\"homepageRegistry\"");
    assertHasFinding(result, "product_manifest:products/example/product.manifest.json_forbidden:\"compatibilityRegistry\"");
  });
}

function testPackageCheckpointAliasBlocksWhenMissing() {
  withFixture((rootPath) => {
    writeFixtureFile(
      rootPath,
      "package.json",
      JSON.stringify({
        name: "mullusi-website",
        private: true,
        scripts: {
          validate: "node scripts/validate-site.mjs",
        },
      }),
    );
    const result = validateArchitectureBoundaries({ repoRoot: rootPath });
    assert.equal(result.state, "blocked");
    assertHasFinding(result, "package_script_invalid:checkpoint");
    assertHasFinding(result, "package_script_invalid:validate");
  });
}

function testWorkflowMustUseUnifiedCheckpoint() {
  withFixture((rootPath) => {
    writeFixtureFile(
      rootPath,
      ".github/workflows/validate.yml",
      [
        "name: Validate Site",
        "run: node scripts/validate-site.mjs",
        "name: Check website JavaScript syntax",
      ].join("\n"),
    );
    const result = validateArchitectureBoundaries({ repoRoot: rootPath });
    assert.equal(result.state, "blocked");
    assertHasFinding(result, "validate_workflow_missing:Run unified checkpoint");
    assertHasFinding(result, "validate_workflow_forbidden:Check website JavaScript syntax");
  });
}

testFixturePasses();
testLegacyRegistryFileBlocks();
testControllerPlanOwnershipBlocks();
testLegacyManifestKeyBlocks();
testPackageCheckpointAliasBlocksWhenMissing();
testWorkflowMustUseUnifiedCheckpoint();
console.log("architecture boundary validation tests passed");
