/*
Purpose: validate Mullusi website architecture boundaries that future coding assistants are most likely to drift.
Governance scope: homepage boot/lifecycle separation, route boot separation, manifest-owned product registry, generated artifact boundary, and source-disclosure prevention.
Dependencies: Node.js standard library, homepage runtime modules, route modules, product manifests, generated registries, and index.html.
Invariants: boot files stay thin, lifecycle order stays declarative, renderers own markup, generated registries are manifest-owned, and legacy registry files remain absent.
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const defaultRepoRoot = path.resolve(path.dirname(scriptPath), "..");
let repoRoot = defaultRepoRoot;
let failures = [];

function fail(message) {
  failures.push(message);
}

function repoPath(relativePath) {
  const absolutePath = path.resolve(repoRoot, relativePath);
  const relation = path.relative(repoRoot, absolutePath);
  if (relation === "" || relation.startsWith("..") || path.isAbsolute(relation)) {
    throw new Error(`path_boundary_violation:${relativePath}`);
  }
  return absolutePath;
}

function exists(relativePath) {
  return fs.existsSync(repoPath(relativePath));
}

function readUtf8(relativePath) {
  return fs.readFileSync(repoPath(relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readUtf8(relativePath));
}

function assertIncludes(content, term, label) {
  if (!content.includes(term)) {
    fail(`${label}_missing:${term}`);
  }
}

function assertExcludes(content, term, label) {
  if (content.includes(term)) {
    fail(`${label}_forbidden:${term}`);
  }
}

function assertOrder(content, left, right, label) {
  const leftIndex = content.indexOf(left);
  const rightIndex = content.indexOf(right);
  if (leftIndex === -1 || rightIndex === -1 || leftIndex > rightIndex) {
    fail(`${label}:${left}:${right}`);
  }
}

function textFilesUnder(relativeRoot) {
  const rootPath = repoPath(relativeRoot);
  if (!fs.existsSync(rootPath)) return [];
  const output = [];
  const walk = (directoryPath) => {
    for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
      const entryPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
      } else if (/\.(?:html|js|json|md|mjs|yml|yaml)$/i.test(entry.name)) {
        output.push(path.relative(repoRoot, entryPath).split(path.sep).join("/"));
      }
    }
  };
  walk(rootPath);
  return output.sort();
}

function validateRequiredAndForbiddenFiles() {
  for (const requiredFile of [
    "index.html",
    ".github/workflows/validate.yml",
    "package.json",
    "assets/app.js",
    "assets/runtime/homepage-lifecycle-plan.js",
    "assets/runtime/homepage-controller.js",
    "assets/runtime/homepage-context.js",
    "assets/registry/homepage-registry.js",
    "assets/render/public-surface-registry.js",
    "assets/render/product-registry.js",
    "assets/render/news-activity.js",
    "assets/pages/route-preferences.js",
    "assets/pages/mullu.js",
    "assets/pages/playground-simulator.js",
    "assets/pages/playground.js",
    "assets/pages/proof-renderer.js",
    "assets/pages/proof.js",
    "data/generated/homepage-product-registry.json",
    "data/generated/products.json",
    "data/manual/public-surfaces.json",
    "schemas/product-manifest.schema.json",
    "scripts/scaffold-product.mjs",
    "scripts/test-scaffold-product.mjs",
  ]) {
    if (!exists(requiredFile)) fail(`required_file_missing:${requiredFile}`);
  }
  for (const forbiddenFile of [
    "data/products.json",
    "data/generated/products-compat.json",
  ]) {
    if (exists(forbiddenFile)) fail(`forbidden_legacy_registry_present:${forbiddenFile}`);
  }
}

function validatePackageScripts() {
  const packageJson = readJson("package.json");
  if (packageJson.private !== true) {
    fail("package_private_flag_missing");
  }
  const scripts = packageJson.scripts || {};
  const requiredScripts = {
    "build:cloudflare": "node scripts/build-cloudflare-pages.mjs",
    checkpoint: "node scripts/validate-checkpoint.mjs",
    "checkpoint:backend": "node scripts/validate-checkpoint.mjs --backend",
    "generate:check": "node scripts/generate-platform.mjs --check",
    "generate:platform": "node scripts/generate-platform.mjs",
    "scaffold:product": "node scripts/scaffold-product.mjs",
    "test:api-exposure": "node scripts/test-check-api-exposure-gate.mjs",
    "test:architecture": "node scripts/test-validate-architecture-boundaries.mjs",
    "test:checkpoint": "node scripts/test-validate-checkpoint.mjs",
    "test:domain-hardening": "node scripts/test-check-domain-hardening-preflight.mjs",
    "test:ops": "node scripts/test-ops-gates.mjs",
    "test:private-recovery": "node scripts/test-private-recovery-inventory.mjs",
    "test:scaffold-product": "node scripts/test-scaffold-product.mjs",
    validate: "node scripts/validate-checkpoint.mjs",
    "validate:api-exposure": "node scripts/check-api-exposure-gate.mjs",
    "validate:architecture": "node scripts/validate-architecture-boundaries.mjs",
    "validate:domain-hardening": "node scripts/check-domain-hardening-preflight.mjs",
    "validate:manifests": "node scripts/validate-manifests.mjs",
    "validate:ops": "node scripts/check-ops-gates.mjs",
    "validate:private-recovery": "node scripts/check-private-recovery-inventory.mjs --allow-missing",
    "validate:runtime": "node scripts/validate-runtime-witnesses.mjs",
    "validate:site": "node scripts/validate-site.mjs",
  };
  for (const [name, command] of Object.entries(requiredScripts)) {
    if (scripts[name] !== command) {
      fail(`package_script_invalid:${name}`);
    }
  }
}

function validateWorkflowBoundary() {
  const workflow = readUtf8(".github/workflows/validate.yml");
  for (const requiredWorkflowTerm of [
    "Run unified checkpoint",
    "node scripts/validate-checkpoint.mjs",
    "node --check scripts/fetch-news.mjs",
    "node scripts/check-domain-hardening-preflight.mjs --expect-blocked",
    "node scripts/check-api-exposure-gate.mjs --expect-blocked",
    "node scripts/check-private-recovery-inventory.mjs --allow-missing",
  ]) {
    assertIncludes(workflow, requiredWorkflowTerm, "validate_workflow");
  }
  for (const oldDuplicatedStep of [
    "Check website JavaScript syntax",
    "Test Doctrine wording gate",
    "Test live deployment integrity gate",
    "Validate static website",
    "Validate product manifests",
  ]) {
    assertExcludes(workflow, oldDuplicatedStep, "validate_workflow");
  }
}

function validateHomepageScriptGraph() {
  const html = readUtf8("index.html");
  const assetVersion = "2026.05.platform.29";
  for (const scriptPathTerm of [
    "assets/runtime/page-runtime.js",
    "assets/runtime/preference-runtime.js",
    "assets/runtime/substrate-runtime.js",
    "assets/runtime/homepage-lifecycle-plan.js",
    "assets/runtime/homepage-controller.js",
    "assets/registry/homepage-registry.js",
    "assets/render/site-content.js",
    "assets/render/public-surface-registry.js",
    "assets/render/product-registry.js",
    "assets/render/news-activity.js",
    "assets/runtime/homepage-context.js",
    "assets/app.js",
  ]) {
    assertIncludes(html, `${scriptPathTerm}?v=${assetVersion}`, "homepage_script_version");
  }
  assertOrder(html, "assets/runtime/homepage-lifecycle-plan.js", "assets/runtime/homepage-controller.js", "homepage_script_order");
  assertOrder(html, "assets/runtime/homepage-controller.js", "assets/runtime/homepage-context.js", "homepage_script_order");
  assertOrder(html, "assets/runtime/homepage-context.js", "assets/app.js", "homepage_script_order");
}

function validateHomepageRuntimeBoundaries() {
  const app = readUtf8("assets/app.js");
  const plan = readUtf8("assets/runtime/homepage-lifecycle-plan.js");
  const controller = readUtf8("assets/runtime/homepage-controller.js");
  const context = readUtf8("assets/runtime/homepage-context.js");
  const publicRenderer = readUtf8("assets/render/public-surface-registry.js");
  const registryLoader = readUtf8("assets/registry/homepage-registry.js");

  for (const forbiddenBootTerm of ["fetch(", "innerHTML", "renderProductRegistry", "renderRepoGrid"]) {
    assertExcludes(app, forbiddenBootTerm, "homepage_boot");
  }
  for (const requiredPlanTerm of [
    "MullusiHomepageLifecyclePlan",
    "siteRenderActions",
    "registryRenderActions",
    "registryFallbackSelectors",
    "siteFailureSelectors",
    "registryFailureSelectors",
    "languageChangeActions",
    "renderPlatformLayers",
    "renderProductRegistryControls",
    "renderRepoGrid",
  ]) {
    assertIncludes(plan, requiredPlanTerm, "homepage_lifecycle_plan");
  }
  for (const forbiddenPlanTerm of ["fetch(", "innerHTML", "addEventListener(", "localStorage"]) {
    assertExcludes(plan, forbiddenPlanTerm, "homepage_lifecycle_plan");
  }
  for (const requiredControllerTerm of [
    "MullusiHomepageLifecyclePlan",
    "function runActionPlan",
    "lifecyclePlan().siteRenderActions",
    "lifecyclePlan().registryRenderActions",
    "callRequired(context, \"renderRegistryLoadError\")",
  ]) {
    assertIncludes(controller, requiredControllerTerm, "homepage_controller");
  }
  for (const forbiddenControllerTerm of [
    "\"renderPlatformLayers\"",
    "\"renderRequestFlow\"",
    "\"renderProductRegistryControls\"",
    "\"renderRepoGrid\"",
    "\"[data-platform-layers]\"",
    "\"[data-product-registry]\"",
    "repo-card error-card",
    "innerHTML",
    "fetch(",
  ]) {
    assertExcludes(controller, forbiddenControllerTerm, "homepage_controller");
  }
  assertIncludes(context, "function renderRegistryLoadError", "homepage_context");
  assertIncludes(publicRenderer, "function renderRegistryLoadError", "public_surface_renderer");
  assertIncludes(publicRenderer, "repo-card error-card", "public_surface_renderer");
  assertIncludes(registryLoader, "data/generated/homepage-product-registry.json", "homepage_registry_loader");
  assertIncludes(registryLoader, "data/manual/public-surfaces.json", "homepage_registry_loader");
  assertExcludes(registryLoader, "products-compat", "homepage_registry_loader");
}

function validateRouteBoundaries() {
  const routePreferences = readUtf8("assets/pages/route-preferences.js");
  const mulluBoot = readUtf8("assets/pages/mullu.js");
  const playgroundSimulator = readUtf8("assets/pages/playground-simulator.js");
  const playgroundBoot = readUtf8("assets/pages/playground.js");
  const proofRenderer = readUtf8("assets/pages/proof-renderer.js");
  const proofBoot = readUtf8("assets/pages/proof.js");

  assertIncludes(routePreferences, "MullusiRoutePreferences", "route_preferences");
  for (const forbiddenPreferenceTerm of ["fetch(", "innerHTML"]) {
    assertExcludes(routePreferences, forbiddenPreferenceTerm, "route_preferences");
  }
  assertIncludes(mulluBoot, "MullusiRoutePreferences.bindThemeToggle()", "mullu_boot");
  for (const forbiddenMulluTerm of ["localStorage", "matchMedia", "innerHTML", "fetch("]) {
    assertExcludes(mulluBoot, forbiddenMulluTerm, "mullu_boot");
  }
  assertIncludes(playgroundSimulator, "MullusiPlaygroundSimulator", "playground_simulator");
  assertIncludes(playgroundSimulator, "function evaluate", "playground_simulator");
  assertIncludes(playgroundBoot, "MullusiPlaygroundSimulator.init()", "playground_boot");
  for (const forbiddenPlaygroundBootTerm of ["addEventListener", "JSON.stringify", "innerHTML"]) {
    assertExcludes(playgroundBoot, forbiddenPlaygroundBootTerm, "playground_boot");
  }
  assertIncludes(proofRenderer, "MullusiProofRenderer", "proof_renderer");
  assertIncludes(proofRenderer, "../data/generated/products.json", "proof_renderer");
  assertIncludes(proofBoot, "MullusiProofRenderer.init()", "proof_boot");
  assertIncludes(proofBoot, "MullusiRoutePreferences.bindThemeToggle()", "proof_boot");
  for (const forbiddenProofBootTerm of ["fetch(", "innerHTML"]) {
    assertExcludes(proofBoot, forbiddenProofBootTerm, "proof_boot");
  }
}

function validateManifestRegistryBoundary() {
  const schema = readUtf8("schemas/product-manifest.schema.json");
  assertIncludes(schema, "homepageRegistry", "product_manifest_schema");
  assertExcludes(schema, "\"compatibilityRegistry\"", "product_manifest_schema");

  for (const productManifestPath of textFilesUnder("products").filter((fileName) => fileName.endsWith("product.manifest.json"))) {
    const manifest = readUtf8(productManifestPath);
    assertIncludes(manifest, "\"homepageRegistry\"", `product_manifest:${productManifestPath}`);
    assertExcludes(manifest, "\"compatibilityRegistry\"", `product_manifest:${productManifestPath}`);
  }

  const homepageRegistry = readJson("data/generated/homepage-product-registry.json");
  const homepageRegistryText = JSON.stringify(homepageRegistry);
  if (!Array.isArray(homepageRegistry.productRegistry)) {
    fail("homepage_product_registry_not_array");
  }
  if (!Array.isArray(homepageRegistry.manifestCandidates)) {
    fail("homepage_manifest_candidates_not_array");
  }
  if (!homepageRegistryText.includes("homepageRegistry")) {
    fail("homepage_registry_projection_key_missing");
  }
  if (homepageRegistryText.includes("compatibilityRegistry")) {
    fail("homepage_registry_legacy_projection_key_present");
  }
}

function validateAssistantHandoffBoundary() {
  const handoff = readUtf8("ops/solo-developer-assistant-handoff.md");
  for (const requiredTerm of [
    "Source Authority",
    "Forbidden Assistant Moves",
    "Required Validation Trace",
    "node scripts/scaffold-product.mjs",
    "node scripts/test-scaffold-product.mjs",
    "node --check assets/runtime/homepage-lifecycle-plan.js",
    "node scripts/validate-architecture-boundaries.mjs",
    "STATUS:",
  ]) {
    assertIncludes(handoff, requiredTerm, "assistant_handoff");
  }
}

function validateProductScaffoldBoundary() {
  const scaffold = readUtf8("scripts/scaffold-product.mjs");
  const scaffoldTest = readUtf8("scripts/test-scaffold-product.mjs");
  for (const requiredTerm of [
    "dry-run by default",
    "export function buildScaffoldPlan",
    "export function parseScaffoldArgs",
    "export function writeScaffoldPlan",
    "target_exists:",
    "runtime_witness_exists:",
    "homepageRegistry: input.homepageRegistry === true",
    "publicExposure",
    "allowed: false",
    "state: \"DryRun\"",
  ]) {
    assertIncludes(scaffold, requiredTerm, "product_scaffold");
  }
  for (const requiredTestTerm of [
    "testCliDryRunDoesNotWrite",
    "testWriteBlocksExistingTargetBeforePartialWrite",
    "testWriteBlocksDuplicateRuntimeWitnessBeforePartialWrite",
    "testInvalidInputsBlock",
  ]) {
    assertIncludes(scaffoldTest, requiredTestTerm, "product_scaffold_test");
  }
}

export function validateArchitectureBoundaries(options = {}) {
  repoRoot = path.resolve(options.repoRoot ?? defaultRepoRoot);
  failures = [];

  validateRequiredAndForbiddenFiles();
  validatePackageScripts();
  validateWorkflowBoundary();
  validateHomepageScriptGraph();
  validateHomepageRuntimeBoundaries();
  validateRouteBoundaries();
  validateManifestRegistryBoundary();
  validateAssistantHandoffBoundary();
  validateProductScaffoldBoundary();

  return {
    failures: [...failures],
    repoRoot,
    state: failures.length > 0 ? "blocked" : "passed",
  };
}

function run() {
  const result = validateArchitectureBoundaries();
  if (result.failures.length > 0) {
    console.error(result.failures.join("\n"));
    process.exit(1);
  }
  console.log("architecture boundary validation passed");
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  run();
}
