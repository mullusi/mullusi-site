/*
Purpose: scaffold a private-incubation Mullusi product authority bundle.
Governance scope: product manifest, API contract, privacy boundary, retention boundary, proof boundary, and runtime witness row.
Dependencies: Node.js standard library and the runtime witness registry.
Invariants: dry-run by default, no public exposure by default, writes are fail-closed when any target already exists, and runtime witness state starts blocked.
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const defaultRepoRoot = path.resolve(path.dirname(scriptPath), "..");
const runtimeWitnessRegistryPath = "ops/runtime-witness/registry.json";
const requiredRuntimeWitnessEndpoints = ["/health", "/gateway/witness", "/runtime/conformance"];
const requiredProofWitnesses = ["runtime", "contract", "rollback", "privacy"];
const releaseGateItems = ["route", "docs", "api_contract", "privacy", "runtime_witness", "rollback", "support", "status"];
const promotionPath = ["private-incubation", "internal-alpha", "limited-preview", "public-beta", "production"];

function stableStringify(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function classPrefixForId(productId) {
  return productId.replace(/-/g, "_");
}

function requirePattern(value, pattern, label) {
  if (!pattern.test(value)) {
    throw new Error(`${label}_invalid:${value}`);
  }
  return value;
}

function requiredString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label}_required`);
  }
  return value.trim();
}

function normalizeRoute(value, productId) {
  const route = value ? requiredString(value, "route") : `/${productId.replace(/^mullu-/, "")}/`;
  const normalized = route.startsWith("/") ? route : `/${route}`;
  const finalRoute = normalized.endsWith("/") ? normalized : `${normalized}/`;
  return requirePattern(finalRoute, /^\/[a-z0-9/_-]+\/$/, "route");
}

function routeSlug(publicRoute) {
  return publicRoute.split("/").filter(Boolean).join("-");
}

function parseInteger(value, label, defaultValue) {
  if (value === undefined) return defaultValue;
  if (!/^\d+$/.test(String(value))) throw new Error(`${label}_invalid:${value}`);
  return Number.parseInt(value, 10);
}

function parseDataClasses(value, productId) {
  if (value) {
    const classes = value.split(",").map((item) => item.trim()).filter(Boolean);
    if (classes.length === 0) throw new Error("data_classes_required");
    for (const dataClass of classes) {
      requirePattern(dataClass, /^[a-z0-9_]+$/, "data_class");
    }
    return [...new Set(classes)];
  }
  const prefix = classPrefixForId(productId);
  return [`${prefix}_requests`, `${prefix}_traces`, `${prefix}_witnesses`];
}

function proofClaimId(productId, claimText) {
  return `${productId}.blocked.${slugify(claimText)}`;
}

function repoPath(repoRoot, relativePath) {
  const absolutePath = path.resolve(repoRoot, relativePath);
  const relation = path.relative(repoRoot, absolutePath);
  if (relation === "" || relation.startsWith("..") || path.isAbsolute(relation)) {
    throw new Error(`path_boundary_violation:${relativePath}`);
  }
  return absolutePath;
}

function writeJsonFile(repoRoot, relativePath, value) {
  const targetPath = repoPath(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, stableStringify(value), "utf8");
}

function readJsonFile(repoRoot, relativePath) {
  return JSON.parse(fs.readFileSync(repoPath(repoRoot, relativePath), "utf8"));
}

function buildManifest(options) {
  return {
    schemaVersion: "1.0.0",
    id: options.id,
    name: options.name,
    summary: options.summary,
    family: options.family,
    category: options.category,
    status: "private-incubation",
    ownership: {
      owner: options.owner,
      supportEmail: options.supportEmail,
    },
    surfaces: {
      publicRoute: options.publicRoute,
      docsRoute: "private",
      dashboardRoute: `https://dashboard.mullusi.com/${options.routeSlug}`,
      proofRoute: `/proof/${options.routeSlug}/`,
      statusRoute: `/status/${options.routeSlug}/`,
    },
    runtime: {
      service: options.service,
      controlPlaneRequired: true,
      runtimeWitnessRequired: true,
      productionPreflight: "fail-closed",
    },
    api: {
      exposure: "planned",
      routes: [
        {
          method: options.apiMethod,
          path: options.apiPath,
          contract: options.contractPath,
        },
      ],
    },
    data: {
      classes: options.dataClasses,
      privacyBoundary: options.privacyPolicyPath,
      retentionPolicy: options.retentionPolicyPath,
    },
    proof: {
      boundary: options.proofPath,
      claimsAllowed: [],
      claimsBlockedUntilVerified: options.claimsBlocked,
      witnesses: requiredProofWitnesses,
    },
    presentation: {
      homepageRegistry: options.homepageRegistry,
      displayOrder: options.displayOrder,
      classification: "public product later",
      registryStatus: "private-incubation",
      ownerLabel: "Product Services",
      sourceBoundary: "product manifest authority",
      runtimeType: `${options.service} private-incubation runtime`,
      dataType: `${options.dataClasses.join(", ")} in not-active collection state`,
      releaseGate: "manifest, privacy, proof, runtime witness, rollback, support, and status gates",
      docsPath: "private docs only",
      apiPath: `${options.apiMethod} ${options.apiPath}`,
      evidencePath: "/proof/",
      failureMode: "return AwaitingEvidence, preserve trace, and block public claim rendering",
    },
    releaseGate: {
      required: releaseGateItems,
      promotionPath,
    },
    generation: {
      emitProductsJson: true,
      emitStatusJson: true,
      emitSitemap: true,
      emitHomepageCard: true,
      emitDocsIndex: true,
      emitProofIndex: true,
    },
  };
}

function buildContract(options) {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `https://mullusi.com/${options.contractPath}`,
    title: `${options.name} Request Contract`,
    description: `Purpose: request contract for ${options.name} private-incubation actions. Governance scope: request input, constraints, and trace requirement. Invariants: execution must enter through the control plane and return traceable result state.`,
    type: "object",
    additionalProperties: false,
    required: ["input", "constraints", "trace_required"],
    properties: {
      input: {
        type: "string",
        minLength: 1,
        maxLength: 1000,
      },
      constraints: {
        type: "array",
        items: {
          type: "string",
          minLength: 1,
        },
      },
      trace_required: {
        const: true,
      },
    },
  };
}

function buildPrivacyPolicy(options) {
  return {
    schemaVersion: "1.0.0",
    productId: options.id,
    purpose: `Declare the initial privacy boundary for ${options.name}.`,
    dataClasses: options.dataClasses,
    userBoundary: `No production user data may be collected for ${options.name} until privacy, support, and runtime witness gates close.`,
    retentionPolicy: options.retentionPolicyPath,
    collectionState: "not-active",
  };
}

function buildRetentionPolicy(options) {
  return {
    schemaVersion: "1.0.0",
    productId: options.id,
    purpose: `Declare retention state for ${options.name} before public exposure.`,
    retention: options.dataClasses.map((dataClass) => ({
      dataClass,
      state: "not-active",
      maximumDays: 0,
    })),
  };
}

function buildProofBoundary(options) {
  return {
    schemaVersion: "1.0.0",
    productId: options.id,
    proofState: "AwaitingEvidence",
    claimsAllowed: [],
    claimsBlockedUntilVerified: options.claimsBlocked,
    witnesses: [
      {
        name: "runtime",
        state: "AwaitingEvidence",
        evidence: `${options.service} runtime witness is not published.`,
      },
      {
        name: "contract",
        state: "AwaitingEvidence",
        evidence: `${options.apiMethod} ${options.apiPath} is declared but not deployed.`,
      },
      {
        name: "rollback",
        state: "AwaitingEvidence",
        evidence: `${options.name} rollback path is not yet witnessed.`,
      },
      {
        name: "privacy",
        state: "AwaitingEvidence",
        evidence: `${options.name} privacy and retention policies are declared in not-active state.`,
      },
    ],
    claimBindings: options.claimsBlocked.map((claimText) => ({
      claimId: proofClaimId(options.id, claimText),
      claimText,
      state: "blocked",
      requiredWitnesses: requiredProofWitnesses,
      renderDecision: "block",
      proofState: "AwaitingEvidence",
    })),
  };
}

function buildRuntimeWitness(options) {
  return {
    productId: options.id,
    productManifest: options.manifestPath,
    service: options.service,
    proofState: "AwaitingEvidence",
    runtimeState: "not-deployed",
    controlPlane: {
      required: true,
      bypassAllowed: false,
    },
    health: {
      evidenceState: "not-collected",
      requiredEndpoints: requiredRuntimeWitnessEndpoints,
      observations: [],
    },
    preflight: {
      mode: "fail-closed",
      decision: "block",
      reason: "Runtime witness endpoints are not published.",
    },
    publicExposure: {
      allowed: false,
      state: "blocked",
      reason: `${options.name} remains blocked until runtime, contract, privacy, and rollback witnesses close.`,
    },
    rollback: {
      state: "AwaitingEvidence",
      path: "ops/api-production-readiness-gate.md",
    },
    lineage: {
      source: runtimeWitnessRegistryPath,
      updatedAt: options.updatedAt,
    },
  };
}

export function buildScaffoldPlan(input = {}) {
  const id = requirePattern(requiredString(input.id, "id"), /^[a-z0-9]+(?:-[a-z0-9]+)*$/, "id");
  const name = requiredString(input.name, "name");
  const category = requirePattern(requiredString(input.category, "category"), /^[a-z0-9]+(?:-[a-z0-9]+)*$/, "category");
  const publicRoute = normalizeRoute(input.route, id);
  const routeName = routeSlug(publicRoute);
  const service = requirePattern(input.service ? requiredString(input.service, "service") : `${routeName}-service`, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, "service");
  const apiMethod = input.apiMethod ? requiredString(input.apiMethod, "api_method").toUpperCase() : "POST";
  if (!["GET", "POST"].includes(apiMethod)) {
    throw new Error(`api_method_invalid:${apiMethod}`);
  }
  const apiPath = requirePattern(input.apiPath ? requiredString(input.apiPath, "api_path") : `/v1/${routeName}/request`, /^\/v[0-9]+\/[a-z0-9/_{}-]+$/, "api_path");
  const contractPath = requirePattern(input.contractPath ? requiredString(input.contractPath, "contract") : `contracts/${routeName}/request.schema.json`, /^contracts\/[a-z0-9/_-]+\.schema\.json$/, "contract");
  const dataClasses = parseDataClasses(input.dataClasses, id);
  const updatedAt = input.updatedAt ?? "2026-05-24T00:00:00Z";
  requirePattern(updatedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, "updated_at");

  const options = {
    id,
    name,
    summary: input.summary?.trim() || `Private-incubation product scaffold for ${name}.`,
    family: input.family?.trim() || "mullu",
    category,
    owner: input.owner?.trim() || "mullusi",
    supportEmail: requirePattern(input.supportEmail?.trim() || "support@mullusi.com", /^[^@\s]+@mullusi\.com$/, "support_email"),
    publicRoute,
    routeSlug: routeName,
    service,
    apiMethod,
    apiPath,
    contractPath,
    dataClasses,
    homepageRegistry: input.homepageRegistry === true,
    displayOrder: parseInteger(input.displayOrder, "display_order", 1000),
    updatedAt,
    manifestPath: `products/${id}/product.manifest.json`,
    privacyPolicyPath: `privacy/${id}.policy.json`,
    retentionPolicyPath: `privacy/${id}.retention.json`,
    proofPath: `proof/${id}.proof.json`,
    claimsBlocked: input.claimsBlocked ?? [
      `${name} production readiness`,
      `${name} runtime quality`,
      `${name} public exposure`,
    ],
  };

  const files = [
    [options.manifestPath, buildManifest(options)],
    [options.contractPath, buildContract(options)],
    [options.privacyPolicyPath, buildPrivacyPolicy(options)],
    [options.retentionPolicyPath, buildRetentionPolicy(options)],
    [options.proofPath, buildProofBoundary(options)],
  ].map(([relativePath, content]) => ({ relativePath, content }));

  return {
    files,
    options,
    runtimeWitness: buildRuntimeWitness(options),
  };
}

export function writeScaffoldPlan(repoRoot, plan) {
  const root = path.resolve(repoRoot);
  const targetPaths = plan.files.map((file) => file.relativePath);
  for (const relativePath of targetPaths) {
    if (fs.existsSync(repoPath(root, relativePath))) {
      throw new Error(`target_exists:${relativePath}`);
    }
  }

  const registry = readJsonFile(root, runtimeWitnessRegistryPath);
  if (!registry || typeof registry !== "object" || !Array.isArray(registry.witnesses)) {
    throw new Error("runtime_witness_registry_invalid");
  }
  if (registry.witnesses.some((witness) => witness?.productId === plan.options.id)) {
    throw new Error(`runtime_witness_exists:${plan.options.id}`);
  }

  for (const file of plan.files) {
    writeJsonFile(root, file.relativePath, file.content);
  }
  registry.witnesses = [...registry.witnesses, plan.runtimeWitness]
    .sort((left, right) => String(left.productId).localeCompare(String(right.productId)));
  writeJsonFile(root, runtimeWitnessRegistryPath, registry);

  return {
    fileCount: plan.files.length,
    files: targetPaths,
    productId: plan.options.id,
    runtimeWitness: runtimeWitnessRegistryPath,
    state: "Written",
  };
}

export function parseScaffoldArgs(args) {
  const options = {};
  const allowedFlags = new Set(["--write", "--homepage", "--help", "-h"]);
  const valueOptions = new Map([
    ["--root", "root"],
    ["--id", "id"],
    ["--name", "name"],
    ["--summary", "summary"],
    ["--family", "family"],
    ["--category", "category"],
    ["--route", "route"],
    ["--service", "service"],
    ["--owner", "owner"],
    ["--support", "supportEmail"],
    ["--display-order", "displayOrder"],
    ["--api-method", "apiMethod"],
    ["--api-path", "apiPath"],
    ["--contract", "contractPath"],
    ["--data-classes", "dataClasses"],
    ["--updated-at", "updatedAt"],
  ]);

  for (const arg of args) {
    if (allowedFlags.has(arg)) {
      if (arg === "--write") options.write = true;
      if (arg === "--homepage") options.homepageRegistry = true;
      if (arg === "--help" || arg === "-h") options.help = true;
      continue;
    }
    const separatorIndex = arg.indexOf("=");
    if (separatorIndex === -1) {
      throw new Error(`unsupported_arg:${arg}`);
    }
    const key = arg.slice(0, separatorIndex);
    const value = arg.slice(separatorIndex + 1);
    const optionName = valueOptions.get(key);
    if (!optionName) {
      throw new Error(`unsupported_arg:${arg}`);
    }
    options[optionName] = value;
  }
  return options;
}

function usage() {
  return [
    "Usage:",
    "  node scripts/scaffold-product.mjs --id=PRODUCT-ID --name=\"Product Name\" --category=CATEGORY [--summary=TEXT] [--write]",
    "",
    "Default behavior is dry-run. Add --write only when the scaffold should create files.",
    "The scaffold starts private-incubation, homepageRegistry=false, runtime blocked, and collectionState=not-active.",
  ].join("\n");
}

function formatResult(result) {
  return [
    `scaffold_state=${result.state}`,
    `product_id=${result.productId}`,
    `write=${result.state === "Written" ? "true" : "false"}`,
    ...result.files.map((file) => `file=${file}`),
    `runtime_witness=${result.runtimeWitness}`,
    "public_exposure=blocked",
    "homepage_registry=false_unless_explicit",
    "raw_secret_values=not_requested",
    `next_action=${result.state === "Written" ? "node scripts/generate-platform.mjs && node scripts/validate-checkpoint.mjs" : "rerun with --write after reviewing planned files"}`,
  ].join("\n");
}

export function publicCliErrorCode(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/^unsupported_arg:/.test(message)) return "unsupported_arg";
  if (/^target_exists:/.test(message)) return "target_exists";
  if (/^runtime_witness_exists:/.test(message)) return "runtime_witness_exists";
  if (/^path_boundary_violation:/.test(message)) return "path_boundary_violation";
  if (/^api_method_invalid:/.test(message)) return "api_method_invalid";
  if (/^[a-z_]+_(?:invalid|required)$/.test(message)) return message;
  return "scaffold_product_unavailable";
}

function runCli() {
  try {
    const cliOptions = parseScaffoldArgs(process.argv.slice(2));
    if (cliOptions.help) {
      console.log(usage());
      return;
    }
    const repoRoot = path.resolve(cliOptions.root ?? defaultRepoRoot);
    const plan = buildScaffoldPlan(cliOptions);
    if (cliOptions.write) {
      console.log(formatResult(writeScaffoldPlan(repoRoot, plan)));
      return;
    }
    console.log(formatResult({
      fileCount: plan.files.length,
      files: plan.files.map((file) => file.relativePath),
      productId: plan.options.id,
      runtimeWitness: runtimeWitnessRegistryPath,
      state: "DryRun",
    }));
  } catch (error) {
    console.error(publicCliErrorCode(error));
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
