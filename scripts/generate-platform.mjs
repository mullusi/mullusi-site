/*
Purpose: generate Mullusi platform registry artifacts from product manifests.
Governance scope: product manifest authority, generated public registry witnesses, proof index, API registry, status records, sitemap candidates, and drift detection.
Dependencies: Node.js standard library, product manifest directories, local contract/privacy/proof files.
Invariants: generation is deterministic, product IDs/routes/API routes are unique, private-incubation products do not become public sitemap or homepage entries, and generated files are never hand-authored.
Test contract: run node scripts/validate-manifests.mjs and node scripts/generate-platform.mjs --check.
*/

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");

const requiredTopLevelKeys = [
  "schemaVersion",
  "id",
  "name",
  "summary",
  "family",
  "category",
  "status",
  "ownership",
  "surfaces",
  "runtime",
  "api",
  "data",
  "proof",
  "presentation",
  "releaseGate",
  "generation",
];

const allowedStatuses = new Set([
  "private-incubation",
  "internal-alpha",
  "limited-preview",
  "public-beta",
  "production",
  "archived",
]);
const allowedPresentationStatuses = new Set(["awaiting-evidence", "private-incubation", "planned", "restricted"]);
const allowedPresentationClassifications = new Set([
  "public product",
  "public product later",
  "private research product",
  "internal tool",
  "API service",
  "dashboard module",
  "sandbox demo",
  "library/package",
]);
const allowedSystemStatuses = new Set(["active", "public", "live demo", "research", "deployed"]);
const allowedFutureStatuses = new Set(["planned"]);

const publicExposureStatuses = new Set(["public-beta", "production"]);
const productionStatus = "production";
const manualPublicSurfacesPath = "data/manual/public-surfaces.json";
const runtimeWitnessRegistryPath = "ops/runtime-witness/registry.json";
const runtimeWitnessSchemaPath = "schemas/runtime-witness.schema.json";
const requiredRuntimeWitnessEndpoints = ["/health", "/gateway/witness", "/runtime/conformance"];
const allowedProofStates = new Set([
  "SolvedVerified",
  "SolvedUnverified",
  "AwaitingEvidence",
  "SafeHalt",
  "GovernanceBlocked",
  "BudgetExhausted",
  "ImpossibleProved",
  "ModelInvalidated",
]);
const allowedRuntimeWitnessStates = new Set([
  "not-deployed",
  "private-only",
  "public-witness-ready",
  "production-ready",
  "blocked",
]);
const requiredGateItems = new Set([
  "route",
  "docs",
  "privacy",
  "runtime_witness",
  "rollback",
  "support",
  "status",
]);
const apiRequiredGateItems = new Set(["api_contract"]);
const noPublicEndpointGateItems = new Set(["restricted_boundary"]);
const requiredProofWitnesses = new Set(["runtime", "contract", "rollback", "privacy"]);
const expectedPromotionPath = [
  "private-incubation",
  "internal-alpha",
  "limited-preview",
  "public-beta",
  "production",
];

const generatedArtifacts = {
  legacyProducts: "data/products.json",
  products: "data/generated/products.json",
  status: "data/generated/status.json",
  proofIndex: "data/generated/proof-index.json",
  apiRegistry: "data/generated/api-registry.json",
  homepageCards: "data/generated/homepage-cards.json",
  homepageProductRegistry: "data/generated/homepage-product-registry.json",
  docsIndex: "data/generated/docs-index.json",
  releaseChecklists: "data/generated/release-checklists.json",
  migrationCoverage: "data/generated/migration-coverage.json",
  productRegistryParity: "data/generated/product-registry-parity.json",
  publicSurfaceParity: "data/generated/public-surface-parity.json",
  productsCompatibility: "data/generated/products-compat.json",
  runtimeWitnessIndex: "data/generated/runtime-witness-index.json",
  sitemap: "data/generated/sitemap.xml",
};

function assertInsideRepo(relativePath) {
  const targetPath = path.resolve(repoRoot, relativePath);
  const relation = path.relative(repoRoot, targetPath);
  if (relation === "" || relation.startsWith("..") || path.isAbsolute(relation)) {
    throw new Error(`path_boundary_violation:${relativePath}`);
  }
  return targetPath;
}

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function readJson(relativePath) {
  const targetPath = assertInsideRepo(relativePath);
  return JSON.parse(fs.readFileSync(targetPath, "utf8"));
}

function exists(relativePath) {
  return fs.existsSync(assertInsideRepo(relativePath));
}

function listProductManifestPaths() {
  const productsRoot = assertInsideRepo("products");
  if (!fs.existsSync(productsRoot)) return [];
  return fs
    .readdirSync(productsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => toPosix(path.join("products", entry.name, "product.manifest.json")))
    .filter((relativePath) => fs.existsSync(assertInsideRepo(relativePath)))
    .sort((left, right) => left.localeCompare(right));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireString(failures, value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    failures.push(`string_required:${label}`);
    return "";
  }
  return value;
}

function requireBoolean(failures, value, label) {
  if (typeof value !== "boolean") {
    failures.push(`boolean_required:${label}`);
    return false;
  }
  return value;
}

function requireInteger(failures, value, label) {
  if (!Number.isInteger(value)) {
    failures.push(`integer_required:${label}`);
    return 0;
  }
  return value;
}

function requireArray(failures, value, label) {
  if (!Array.isArray(value)) {
    failures.push(`array_required:${label}`);
    return [];
  }
  return value;
}

function uniqueItems(items) {
  return new Set(items).size === items.length;
}

function hasAllItems(items, requiredItems) {
  const observed = new Set(items);
  return [...requiredItems].every((item) => observed.has(item));
}

function validateRoute(value, label, failures) {
  if (!/^\/[a-z0-9/_-]*\/$/.test(value)) {
    failures.push(`route_invalid:${label}:${value}`);
  }
}

function validateDocsRoute(value, label, failures) {
  if (!/^(https:\/\/docs\.mullusi\.com\/[a-z0-9/_-]+|private)$/.test(value)) {
    failures.push(`docs_route_invalid:${label}:${value}`);
  }
}

function validateDashboardRoute(value, label, failures) {
  if (!/^(https:\/\/dashboard\.mullusi\.com\/[a-z0-9/_-]+|\/[a-z0-9/_-]+)$/.test(value)) {
    failures.push(`dashboard_route_invalid:${label}:${value}`);
  }
}

function routeFileExists(route) {
  const cleanRoute = route.replace(/^\/+|\/+$/g, "");
  if (cleanRoute === "") return exists("index.html");
  return exists(`${cleanRoute}/index.html`);
}

function validateJsonObjectFile(relativePath, label, failures) {
  if (!exists(relativePath)) {
    failures.push(`referenced_file_missing:${label}:${relativePath}`);
    return null;
  }
  try {
    const parsed = readJson(relativePath);
    if (!isPlainObject(parsed)) {
      failures.push(`referenced_json_object_required:${label}:${relativePath}`);
      return null;
    }
    return parsed;
  } catch (error) {
    failures.push(`referenced_json_invalid:${label}:${relativePath}:${error.message}`);
    return null;
  }
}

function validatePrivacyBoundary(manifest, failures) {
  const policy = validateJsonObjectFile(manifest.data.privacyBoundary, `${manifest.id}.privacy`, failures);
  if (!policy) return;
  if (policy.productId !== manifest.id) {
    failures.push(`privacy_product_mismatch:${manifest.id}:${policy.productId || ""}`);
  }
  if (policy.retentionPolicy !== manifest.data.retentionPolicy) {
    failures.push(`privacy_retention_mismatch:${manifest.id}:${policy.retentionPolicy || ""}`);
  }
  const policyClasses = requireArray(failures, policy.dataClasses, `${manifest.id}.privacy.dataClasses`);
  if (!sameSet(policyClasses, manifest.data.classes)) {
    failures.push(`privacy_data_classes_mismatch:${manifest.id}`);
  }
  if (manifest.status === "private-incubation" && policy.collectionState !== "not-active") {
    failures.push(`privacy_private_incubation_must_be_not_active:${manifest.id}`);
  }
}

function validateRetentionBoundary(manifest, failures) {
  const retention = validateJsonObjectFile(manifest.data.retentionPolicy, `${manifest.id}.retention`, failures);
  if (!retention) return;
  if (retention.productId !== manifest.id) {
    failures.push(`retention_product_mismatch:${manifest.id}:${retention.productId || ""}`);
  }
  const rows = requireArray(failures, retention.retention, `${manifest.id}.retention.retention`);
  const rowClasses = rows
    .filter((row) => isPlainObject(row))
    .map((row) => row.dataClass)
    .filter((value) => typeof value === "string");
  if (!sameSet(rowClasses, manifest.data.classes)) {
    failures.push(`retention_data_classes_mismatch:${manifest.id}`);
  }
  if (manifest.status === "private-incubation") {
    rows.forEach((row, index) => {
      if (!isPlainObject(row)) {
        failures.push(`retention_row_object_required:${manifest.id}:${index}`);
        return;
      }
      if (row.state !== "not-active" || row.maximumDays !== 0) {
        failures.push(`retention_private_incubation_must_be_zero:${manifest.id}:${row.dataClass || index}`);
      }
    });
  }
}

function validateProofBoundary(manifest, failures) {
  const proof = validateJsonObjectFile(manifest.proof.boundary, `${manifest.id}.proof`, failures);
  if (!proof) return;
  if (proof.productId !== manifest.id) {
    failures.push(`proof_product_mismatch:${manifest.id}:${proof.productId || ""}`);
  }
  if (manifest.status === "private-incubation" && proof.proofState !== "AwaitingEvidence") {
    failures.push(`proof_private_incubation_state_invalid:${manifest.id}:${proof.proofState || ""}`);
  }
  const allowed = requireArray(failures, proof.claimsAllowed, `${manifest.id}.proof.claimsAllowed`);
  const blocked = requireArray(
    failures,
    proof.claimsBlockedUntilVerified,
    `${manifest.id}.proof.claimsBlockedUntilVerified`,
  );
  if (!sameSet(allowed, manifest.proof.claimsAllowed)) {
    failures.push(`proof_allowed_claims_mismatch:${manifest.id}`);
  }
  if (!sameSet(blocked, manifest.proof.claimsBlockedUntilVerified)) {
    failures.push(`proof_blocked_claims_mismatch:${manifest.id}`);
  }
  const witnessNames = requireArray(failures, proof.witnesses, `${manifest.id}.proof.witnesses`)
    .filter((witness) => isPlainObject(witness))
    .map((witness) => witness.name);
  if (!hasAllItems(witnessNames, requiredProofWitnesses)) {
    failures.push(`proof_witness_missing:${manifest.id}`);
  }
}

function validatePresentation(manifest, failures) {
  if (!isPlainObject(manifest.presentation)) {
    failures.push(`manifest_presentation_object_required:${manifest.id}`);
    return;
  }
  const presentation = manifest.presentation;
  requireBoolean(failures, presentation.compatibilityRegistry, `${manifest.id}.presentation.compatibilityRegistry`);
  const displayOrder = requireInteger(failures, presentation.displayOrder, `${manifest.id}.presentation.displayOrder`);
  if (displayOrder < 0) {
    failures.push(`presentation_display_order_invalid:${manifest.id}:${displayOrder}`);
  }
  const classification = requireString(failures, presentation.classification, `${manifest.id}.presentation.classification`);
  if (!allowedPresentationClassifications.has(classification)) {
    failures.push(`presentation_classification_invalid:${manifest.id}:${classification}`);
  }
  const registryStatus = requireString(failures, presentation.registryStatus, `${manifest.id}.presentation.registryStatus`);
  if (!allowedPresentationStatuses.has(registryStatus)) {
    failures.push(`presentation_registry_status_invalid:${manifest.id}:${registryStatus}`);
  }
  requireString(failures, presentation.ownerLabel, `${manifest.id}.presentation.ownerLabel`);
  const sourceBoundary = requireString(failures, presentation.sourceBoundary, `${manifest.id}.presentation.sourceBoundary`);
  if (/github\.com\//i.test(sourceBoundary)) {
    failures.push(`presentation_source_boundary_public_repo_forbidden:${manifest.id}`);
  }
  requireString(failures, presentation.runtimeType, `${manifest.id}.presentation.runtimeType`);
  requireString(failures, presentation.dataType, `${manifest.id}.presentation.dataType`);
  requireString(failures, presentation.releaseGate, `${manifest.id}.presentation.releaseGate`);
  const docsPath = requireString(failures, presentation.docsPath, `${manifest.id}.presentation.docsPath`);
  if (!/^docs\.mullusi\.com(?:\/[a-z0-9-]+)?$/.test(docsPath) && docsPath !== "private docs only") {
    failures.push(`presentation_docs_path_invalid:${manifest.id}:${docsPath}`);
  }
  const apiPath = requireString(failures, presentation.apiPath, `${manifest.id}.presentation.apiPath`);
  if (
    !/^(GET|POST) \/v[0-9]+\/[a-z0-9_{}\/-]+$/.test(apiPath) &&
    apiPath !== "client access to governed API routes" &&
    apiPath !== "no public endpoint"
  ) {
    failures.push(`presentation_api_path_invalid:${manifest.id}:${apiPath}`);
  }
  const evidencePath = requireString(failures, presentation.evidencePath, `${manifest.id}.presentation.evidencePath`);
  if (!/^\/proof\/$/.test(evidencePath) && evidencePath !== "#evidence") {
    failures.push(`presentation_evidence_path_invalid:${manifest.id}:${evidencePath}`);
  }
  requireString(failures, presentation.failureMode, `${manifest.id}.presentation.failureMode`);
}

function validateManualPublicSurfaceRegistry(failures) {
  if (!exists(manualPublicSurfacesPath)) {
    failures.push(`manual_public_surfaces_missing:${manualPublicSurfacesPath}`);
    return;
  }
  const registry = readJson(manualPublicSurfacesPath);
  if (!isPlainObject(registry)) {
    failures.push(`manual_public_surfaces_object_required:${manualPublicSurfacesPath}`);
    return;
  }
  if (Object.prototype.hasOwnProperty.call(registry, "productRegistry")) {
    failures.push("manual_public_surfaces_product_registry_forbidden");
  }
  if (!isPlainObject(registry.meta)) {
    failures.push("manual_public_surfaces_meta_object_required");
  } else {
    requireString(failures, registry.meta.name, "manualPublicSurfaces.meta.name");
    const domain = requireString(failures, registry.meta.domain, "manualPublicSurfaces.meta.domain");
    if (domain !== "mullusi.com") {
      failures.push(`manual_public_surfaces_domain_invalid:${domain}`);
    }
    requireString(failures, registry.meta.version, "manualPublicSurfaces.meta.version");
    requireString(failures, registry.meta.description, "manualPublicSurfaces.meta.description");
    requireString(failures, registry.meta.source_boundary, "manualPublicSurfaces.meta.source_boundary");
    const observedHash = requireString(failures, registry.meta.content_hash, "manualPublicSurfaces.meta.content_hash");
    const expectedHash = sourceContentHash(registry);
    if (observedHash !== expectedHash) {
      failures.push(`manual_public_surfaces_hash_invalid:${observedHash}:${expectedHash}`);
    }
  }

  const principles = requireArray(failures, registry.principles, "manualPublicSurfaces.principles");
  principles.forEach((principle, index) => {
    requireString(failures, principle, `manualPublicSurfaces.principles.${index}`);
  });

  const systems = requireArray(failures, registry.systems, "manualPublicSurfaces.systems");
  const seenSystemHrefs = new Set();
  systems.forEach((system, index) => {
    const label = `manualPublicSurfaces.systems.${index}`;
    if (!isPlainObject(system)) {
      failures.push(`manual_public_surface_system_object_required:${index}`);
      return;
    }
    const name = requireString(failures, system.name, `${label}.name`);
    const href = requireString(failures, system.href, `${label}.href`);
    requireString(failures, system.category, `${label}.category`);
    const status = requireString(failures, system.status, `${label}.status`);
    const sourceState = requireString(failures, system.sourceState, `${label}.sourceState`);
    requireString(failures, system.summary, `${label}.summary`);
    if (!allowedSystemStatuses.has(status)) {
      failures.push(`manual_public_surface_system_status_invalid:${name}:${status}`);
    }
    if (!/^https:\/\/(?:[a-z0-9.-]+\.)?mullusi\.com(?:\/.*)?$/.test(href)) {
      failures.push(`manual_public_surface_system_href_invalid:${name}:${href}`);
    }
    if (!["private-source", "public-release"].includes(sourceState)) {
      failures.push(`manual_public_surface_system_source_state_invalid:${name}:${sourceState}`);
    }
    if (Object.prototype.hasOwnProperty.call(system, "repo")) {
      failures.push(`manual_public_surface_system_repo_forbidden:${name}`);
    }
    if (!Array.isArray(system.tags) || system.tags.length === 0) {
      failures.push(`manual_public_surface_system_tags_missing:${name}`);
    }
    if (seenSystemHrefs.has(href)) {
      failures.push(`manual_public_surface_system_href_duplicate:${href}`);
    }
    seenSystemHrefs.add(href);
  });

  const futureDomains = requireArray(failures, registry.futureDomains, "manualPublicSurfaces.futureDomains");
  const seenSlugs = new Set();
  futureDomains.forEach((domain, index) => {
    const label = `manualPublicSurfaces.futureDomains.${index}`;
    if (!isPlainObject(domain)) {
      failures.push(`manual_public_surface_future_domain_object_required:${index}`);
      return;
    }
    const name = requireString(failures, domain.name, `${label}.name`);
    const slug = requireString(failures, domain.slug, `${label}.slug`);
    const status = requireString(failures, domain.status, `${label}.status`);
    requireString(failures, domain.releaseBoundary, `${label}.releaseBoundary`);
    requireString(failures, domain.summary, `${label}.summary`);
    if (!allowedFutureStatuses.has(status)) {
      failures.push(`manual_public_surface_future_domain_status_invalid:${name}:${status}`);
    }
    if (Object.prototype.hasOwnProperty.call(domain, "plannedRepo")) {
      failures.push(`manual_public_surface_future_domain_repo_forbidden:${name}`);
    }
    if (seenSlugs.has(slug)) {
      failures.push(`manual_public_surface_future_domain_slug_duplicate:${slug}`);
    }
    seenSlugs.add(slug);
  });

  const privateIncubation = requireArray(
    failures,
    registry.privateIncubation,
    "manualPublicSurfaces.privateIncubation",
  );
  privateIncubation.forEach((item, index) => {
    const label = `manualPublicSurfaces.privateIncubation.${index}`;
    if (!isPlainObject(item)) {
      failures.push(`manual_public_surface_private_incubation_object_required:${index}`);
      return;
    }
    const name = requireString(failures, item.name, `${label}.name`);
    requireString(failures, item.summary, `${label}.summary`);
    requireString(failures, item.publishGate, `${label}.publishGate`);
    if (item.visibility !== "private") {
      failures.push(`manual_public_surface_private_incubation_visibility_invalid:${name}:${item.visibility}`);
    }
  });
}

function sameSet(left, right) {
  return (
    Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((item) => right.includes(item))
  );
}

function readRuntimeWitnessRegistry() {
  return readJson(runtimeWitnessRegistryPath);
}

function buildRuntimeWitnessMap(registry) {
  const rows = Array.isArray(registry?.witnesses) ? registry.witnesses : [];
  return new Map(rows.filter((row) => isPlainObject(row)).map((row) => [row.productId, row]));
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

function runtimeWitnessProofState(manifest, witnessMap = new Map()) {
  const witness = witnessMap.get(manifest.id);
  return isPlainObject(witness) ? witness.proofState : runtimeState(manifest);
}

function runtimeWitnessDecision(manifest, witnessMap = new Map()) {
  const witness = witnessMap.get(manifest.id);
  if (!isPlainObject(witness)) {
    return {
      proofState: runtimeState(manifest),
      runtimeState: "blocked",
      preflightDecision: "block",
      publicExposureAllowed: false,
      healthEvidenceState: "not-collected",
      runtimeWitnessClosed: false,
    };
  }
  return {
    proofState: witness.proofState,
    runtimeState: witness.runtimeState,
    preflightDecision: witness.preflight.decision,
    publicExposureAllowed: witness.publicExposure.allowed,
    healthEvidenceState: witness.health.evidenceState,
    runtimeWitnessClosed: runtimeWitnessClosed(witness),
  };
}

function validateRuntimeWitnessRegistry(manifests, failures) {
  validateJsonObjectFile(runtimeWitnessSchemaPath, "runtimeWitness.schema", failures);

  let registry;
  try {
    registry = readRuntimeWitnessRegistry();
  } catch (error) {
    failures.push(`runtime_witness_registry_read_failed:${runtimeWitnessRegistryPath}:${error.message}`);
    return new Map();
  }

  if (!isPlainObject(registry)) {
    failures.push("runtime_witness_registry_object_required");
    return new Map();
  }
  if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(requireString(failures, registry.schemaVersion, "runtimeWitness.schemaVersion"))) {
    failures.push("runtime_witness_schema_version_invalid");
  }
  if (registry.authority !== "mullusi-runtime-witness-authority") {
    failures.push(`runtime_witness_authority_invalid:${registry.authority || ""}`);
  }

  const witnessRows = requireArray(failures, registry.witnesses, "runtimeWitness.witnesses");
  const witnessMap = new Map();
  const manifestById = new Map(manifests.map(({ manifest, relativePath }) => [manifest.id, { manifest, relativePath }]));

  witnessRows.forEach((witness, index) => {
    const label = `runtimeWitness.witnesses.${index}`;
    if (!isPlainObject(witness)) {
      failures.push(`runtime_witness_object_required:${index}`);
      return;
    }
    const productId = requireString(failures, witness.productId, `${label}.productId`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(productId)) {
      failures.push(`runtime_witness_product_id_invalid:${productId}`);
    }
    if (witnessMap.has(productId)) {
      failures.push(`runtime_witness_duplicate:${productId}`);
    } else {
      witnessMap.set(productId, witness);
    }

    const manifestEntry = manifestById.get(productId);
    if (!manifestEntry) {
      failures.push(`runtime_witness_unknown_product:${productId}`);
      return;
    }
    const { manifest, relativePath } = manifestEntry;
    if (witness.productManifest !== relativePath) {
      failures.push(`runtime_witness_manifest_mismatch:${productId}:${witness.productManifest || ""}:${relativePath}`);
    }
    if (witness.service !== manifest.runtime.service) {
      failures.push(`runtime_witness_service_mismatch:${productId}:${witness.service || ""}:${manifest.runtime.service}`);
    }
    if (!allowedProofStates.has(requireString(failures, witness.proofState, `${label}.proofState`))) {
      failures.push(`runtime_witness_proof_state_invalid:${productId}:${witness.proofState || ""}`);
    }
    if (!allowedRuntimeWitnessStates.has(requireString(failures, witness.runtimeState, `${label}.runtimeState`))) {
      failures.push(`runtime_witness_state_invalid:${productId}:${witness.runtimeState || ""}`);
    }

    if (!isPlainObject(witness.controlPlane)) {
      failures.push(`runtime_witness_control_plane_object_required:${productId}`);
    } else {
      if (witness.controlPlane.required !== true) {
        failures.push(`runtime_witness_control_plane_required:${productId}`);
      }
      if (witness.controlPlane.bypassAllowed !== false) {
        failures.push(`runtime_witness_bypass_forbidden:${productId}`);
      }
    }

    if (!isPlainObject(witness.health)) {
      failures.push(`runtime_witness_health_object_required:${productId}`);
    } else {
      if (!["not-collected", "pass", "fail"].includes(requireString(failures, witness.health.evidenceState, `${label}.health.evidenceState`))) {
        failures.push(`runtime_witness_health_state_invalid:${productId}:${witness.health.evidenceState || ""}`);
      }
      const endpoints = requireArray(failures, witness.health.requiredEndpoints, `${label}.health.requiredEndpoints`);
      if (!sameSet(endpoints, requiredRuntimeWitnessEndpoints)) {
        failures.push(`runtime_witness_required_endpoints_invalid:${productId}`);
      }
      const observations = requireArray(failures, witness.health.observations, `${label}.health.observations`);
      observations.forEach((observation, observationIndex) => {
        const observationLabel = `${label}.health.observations.${observationIndex}`;
        if (!isPlainObject(observation)) {
          failures.push(`runtime_witness_observation_object_required:${productId}:${observationIndex}`);
          return;
        }
        if (!requiredRuntimeWitnessEndpoints.includes(requireString(failures, observation.endpoint, `${observationLabel}.endpoint`))) {
          failures.push(`runtime_witness_observation_endpoint_invalid:${productId}:${observation.endpoint || ""}`);
        }
        if (!["Pass", "Fail", "AwaitingEvidence"].includes(requireString(failures, observation.state, `${observationLabel}.state`))) {
          failures.push(`runtime_witness_observation_state_invalid:${productId}:${observation.state || ""}`);
        }
        if (!("observedAt" in observation)) {
          failures.push(`runtime_witness_observation_observed_at_required:${productId}:${observationIndex}`);
        }
        requireString(failures, observation.evidence, `${observationLabel}.evidence`);
      });
      if (witness.health.evidenceState === "pass" && !runtimeWitnessClosed({ ...witness, publicExposure: { allowed: true, state: "allowed" }, preflight: { mode: "fail-closed", decision: "allow" }, rollback: { state: "Ready" } })) {
        failures.push(`runtime_witness_health_pass_missing_observations:${productId}`);
      }
    }

    if (!isPlainObject(witness.preflight)) {
      failures.push(`runtime_witness_preflight_object_required:${productId}`);
    } else {
      if (witness.preflight.mode !== "fail-closed") {
        failures.push(`runtime_witness_preflight_must_fail_closed:${productId}`);
      }
      if (!["block", "allow"].includes(witness.preflight.decision)) {
        failures.push(`runtime_witness_preflight_decision_invalid:${productId}:${witness.preflight.decision || ""}`);
      }
      requireString(failures, witness.preflight.reason, `${label}.preflight.reason`);
    }

    if (!isPlainObject(witness.publicExposure)) {
      failures.push(`runtime_witness_public_exposure_object_required:${productId}`);
    } else {
      if (!["blocked", "allowed"].includes(witness.publicExposure.state)) {
        failures.push(`runtime_witness_public_exposure_state_invalid:${productId}:${witness.publicExposure.state || ""}`);
      }
      if (witness.publicExposure.allowed !== (witness.publicExposure.state === "allowed")) {
        failures.push(`runtime_witness_public_exposure_boolean_mismatch:${productId}`);
      }
      requireString(failures, witness.publicExposure.reason, `${label}.publicExposure.reason`);
    }

    if (!isPlainObject(witness.rollback)) {
      failures.push(`runtime_witness_rollback_object_required:${productId}`);
    } else {
      if (!["AwaitingEvidence", "Ready"].includes(witness.rollback.state)) {
        failures.push(`runtime_witness_rollback_state_invalid:${productId}:${witness.rollback.state || ""}`);
      }
      const rollbackPath = requireString(failures, witness.rollback.path, `${label}.rollback.path`);
      if (!/^ops\/[a-z0-9/_-]+\.md$/.test(rollbackPath) || !exists(rollbackPath)) {
        failures.push(`runtime_witness_rollback_path_invalid:${productId}:${rollbackPath}`);
      }
    }

    if (!isPlainObject(witness.lineage)) {
      failures.push(`runtime_witness_lineage_object_required:${productId}`);
    } else {
      if (witness.lineage.source !== runtimeWitnessRegistryPath) {
        failures.push(`runtime_witness_lineage_source_invalid:${productId}:${witness.lineage.source || ""}`);
      }
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(requireString(failures, witness.lineage.updatedAt, `${label}.lineage.updatedAt`))) {
        failures.push(`runtime_witness_lineage_updated_at_invalid:${productId}`);
      }
    }

    if (publicExposureAllowed(manifest) && !runtimeWitnessClosed(witness)) {
      failures.push(`runtime_witness_public_exposure_not_closed:${productId}`);
    }
    if (!publicExposureAllowed(manifest) && (witness.preflight?.decision !== "block" || witness.publicExposure?.allowed !== false)) {
      failures.push(`runtime_witness_non_public_must_block:${productId}`);
    }
  });

  for (const { manifest } of manifests) {
    if (manifest.runtime.runtimeWitnessRequired === true && !witnessMap.has(manifest.id)) {
      failures.push(`runtime_witness_missing:${manifest.id}`);
    }
  }

  return witnessMap;
}

function validateManifestShape(relativePath, manifest, failures) {
  if (!isPlainObject(manifest)) {
    failures.push(`manifest_object_required:${relativePath}`);
    return null;
  }

  const topLevelKeys = Object.keys(manifest).sort();
  const expectedKeys = [...requiredTopLevelKeys].sort();
  if (topLevelKeys.join(",") !== expectedKeys.join(",")) {
    failures.push(`manifest_keys_invalid:${relativePath}:${topLevelKeys.join(",")}`);
  }

  const id = requireString(failures, manifest.id, `${relativePath}.id`);
  const expectedDirectory = path.basename(path.dirname(relativePath));
  if (id && id !== expectedDirectory) {
    failures.push(`manifest_directory_id_mismatch:${relativePath}:${id}:${expectedDirectory}`);
  }

  if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(requireString(failures, manifest.schemaVersion, `${id}.schemaVersion`))) {
    failures.push(`manifest_schema_version_invalid:${id}`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    failures.push(`manifest_id_invalid:${relativePath}:${id}`);
  }
  requireString(failures, manifest.name, `${id}.name`);
  requireString(failures, manifest.summary, `${id}.summary`);
  requireString(failures, manifest.family, `${id}.family`);
  requireString(failures, manifest.category, `${id}.category`);
  if (!allowedStatuses.has(requireString(failures, manifest.status, `${id}.status`))) {
    failures.push(`manifest_status_invalid:${id}:${manifest.status || ""}`);
  }

  if (!isPlainObject(manifest.ownership)) {
    failures.push(`manifest_ownership_object_required:${id}`);
  } else {
    requireString(failures, manifest.ownership.owner, `${id}.ownership.owner`);
    const supportEmail = requireString(failures, manifest.ownership.supportEmail, `${id}.ownership.supportEmail`);
    if (!/^[^@\s]+@mullusi\.com$/.test(supportEmail)) {
      failures.push(`manifest_support_email_invalid:${id}:${supportEmail}`);
    }
  }

  if (!isPlainObject(manifest.surfaces)) {
    failures.push(`manifest_surfaces_object_required:${id}`);
  } else {
    const publicRoute = requireString(failures, manifest.surfaces.publicRoute, `${id}.surfaces.publicRoute`);
    const proofRoute = requireString(failures, manifest.surfaces.proofRoute, `${id}.surfaces.proofRoute`);
    const statusRoute = requireString(failures, manifest.surfaces.statusRoute, `${id}.surfaces.statusRoute`);
    validateRoute(publicRoute, `${id}.publicRoute`, failures);
    validateRoute(proofRoute, `${id}.proofRoute`, failures);
    validateRoute(statusRoute, `${id}.statusRoute`, failures);
    validateDocsRoute(requireString(failures, manifest.surfaces.docsRoute, `${id}.surfaces.docsRoute`), `${id}.docsRoute`, failures);
    validateDashboardRoute(
      requireString(failures, manifest.surfaces.dashboardRoute, `${id}.surfaces.dashboardRoute`),
      `${id}.dashboardRoute`,
      failures,
    );
    if (publicExposureStatuses.has(manifest.status) && !routeFileExists(publicRoute)) {
      failures.push(`public_route_file_missing:${id}:${publicRoute}`);
    }
  }

  if (!isPlainObject(manifest.runtime)) {
    failures.push(`manifest_runtime_object_required:${id}`);
  } else {
    const service = requireString(failures, manifest.runtime.service, `${id}.runtime.service`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(service)) {
      failures.push(`manifest_runtime_service_invalid:${id}:${service}`);
    }
    if (requireBoolean(failures, manifest.runtime.controlPlaneRequired, `${id}.runtime.controlPlaneRequired`) !== true) {
      failures.push(`control_plane_required:${id}`);
    }
    if (requireBoolean(failures, manifest.runtime.runtimeWitnessRequired, `${id}.runtime.runtimeWitnessRequired`) !== true) {
      failures.push(`runtime_witness_required:${id}`);
    }
    if (manifest.runtime.productionPreflight !== "fail-closed") {
      failures.push(`production_preflight_must_fail_closed:${id}`);
    }
  }

  const routes = isPlainObject(manifest.api)
    ? requireArray(failures, manifest.api.routes, `${id}.api.routes`)
    : [];
  const apiExposure = isPlainObject(manifest.api)
    ? requireString(failures, manifest.api.exposure, `${id}.api.exposure`)
    : "";
  if (!["none", "planned", "public"].includes(apiExposure)) {
    failures.push(`api_exposure_invalid:${id}:${apiExposure}`);
  }
  if (apiExposure !== "none" && routes.length === 0) {
    failures.push(`api_route_required:${id}`);
  }
  if (apiExposure === "none" && routes.length > 0) {
    failures.push(`api_routes_forbidden_without_exposure:${id}`);
  }
  routes.forEach((route, index) => {
    const routeLabel = `${id}.api.routes.${index}`;
    if (!isPlainObject(route)) {
      failures.push(`api_route_object_required:${routeLabel}`);
      return;
    }
    if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(requireString(failures, route.method, `${routeLabel}.method`))) {
      failures.push(`api_route_method_invalid:${routeLabel}:${route.method || ""}`);
    }
    const routePath = requireString(failures, route.path, `${routeLabel}.path`);
    if (!/^\/v[0-9]+\/[a-z0-9/_{}-]+$/.test(routePath)) {
      failures.push(`api_route_path_invalid:${routeLabel}:${routePath}`);
    }
    const contract = requireString(failures, route.contract, `${routeLabel}.contract`);
    if (!/^contracts\/[a-z0-9/_-]+\.schema\.json$/.test(contract)) {
      failures.push(`api_route_contract_path_invalid:${routeLabel}:${contract}`);
    }
    validateJsonObjectFile(contract, `${routeLabel}.contract`, failures);
  });

  if (!isPlainObject(manifest.data)) {
    failures.push(`manifest_data_object_required:${id}`);
  } else {
    const classes = requireArray(failures, manifest.data.classes, `${id}.data.classes`);
    if (classes.length === 0 || !uniqueItems(classes)) {
      failures.push(`data_classes_invalid:${id}`);
    }
    classes.forEach((item) => {
      if (typeof item !== "string" || !/^[a-z0-9_]+$/.test(item)) {
        failures.push(`data_class_invalid:${id}:${String(item)}`);
      }
    });
    if (!/^privacy\/[a-z0-9-]+\.policy\.json$/.test(requireString(failures, manifest.data.privacyBoundary, `${id}.data.privacyBoundary`))) {
      failures.push(`privacy_boundary_path_invalid:${id}`);
    }
    if (!/^privacy\/[a-z0-9-]+\.retention\.json$/.test(requireString(failures, manifest.data.retentionPolicy, `${id}.data.retentionPolicy`))) {
      failures.push(`retention_policy_path_invalid:${id}`);
    }
    validatePrivacyBoundary(manifest, failures);
    validateRetentionBoundary(manifest, failures);
  }

  if (!isPlainObject(manifest.proof)) {
    failures.push(`manifest_proof_object_required:${id}`);
  } else {
    if (!/^proof\/[a-z0-9-]+\.proof\.json$/.test(requireString(failures, manifest.proof.boundary, `${id}.proof.boundary`))) {
      failures.push(`proof_boundary_path_invalid:${id}`);
    }
    const claimsAllowed = requireArray(failures, manifest.proof.claimsAllowed, `${id}.proof.claimsAllowed`);
    if (manifest.status === "private-incubation" && claimsAllowed.length > 0) {
      failures.push(`private_incubation_claims_must_be_empty:${id}`);
    }
    const blockedClaims = requireArray(
      failures,
      manifest.proof.claimsBlockedUntilVerified,
      `${id}.proof.claimsBlockedUntilVerified`,
    );
    if (blockedClaims.length === 0) {
      failures.push(`blocked_claim_required:${id}`);
    }
    const witnesses = requireArray(failures, manifest.proof.witnesses, `${id}.proof.witnesses`);
    if (!uniqueItems(witnesses) || !hasAllItems(witnesses, requiredProofWitnesses)) {
      failures.push(`manifest_proof_witnesses_invalid:${id}`);
    }
    validateProofBoundary(manifest, failures);
  }

  validatePresentation(manifest, failures);

  if (!isPlainObject(manifest.releaseGate)) {
    failures.push(`manifest_release_gate_object_required:${id}`);
  } else {
    const gateItems = requireArray(failures, manifest.releaseGate.required, `${id}.releaseGate.required`);
    const exposureRequiredItems = apiExposure === "none" ? noPublicEndpointGateItems : apiRequiredGateItems;
    if (
      !uniqueItems(gateItems) ||
      !hasAllItems(gateItems, requiredGateItems) ||
      !hasAllItems(gateItems, exposureRequiredItems)
    ) {
      failures.push(`release_gate_items_invalid:${id}`);
    }
    const promotionPath = requireArray(failures, manifest.releaseGate.promotionPath, `${id}.releaseGate.promotionPath`);
    if (promotionPath.join(">") !== expectedPromotionPath.join(">")) {
      failures.push(`promotion_path_invalid:${id}:${promotionPath.join(">")}`);
    }
  }

  if (!isPlainObject(manifest.generation)) {
    failures.push(`manifest_generation_object_required:${id}`);
  } else {
    for (const key of [
      "emitProductsJson",
      "emitStatusJson",
      "emitSitemap",
      "emitHomepageCard",
      "emitDocsIndex",
      "emitProofIndex",
    ]) {
      requireBoolean(failures, manifest.generation[key], `${id}.generation.${key}`);
    }
  }

  return manifest;
}

export function readProductManifests() {
  const failures = [];
  const manifests = listProductManifestPaths().map((relativePath) => {
    try {
      const manifest = readJson(relativePath);
      validateManifestShape(relativePath, manifest, failures);
      return { relativePath, manifest };
    } catch (error) {
      failures.push(`manifest_read_failed:${relativePath}:${error.message}`);
      return { relativePath, manifest: null };
    }
  });
  if (manifests.length === 0) {
    failures.push("manifest_required:products/*/product.manifest.json");
  }
  return {
    manifests: manifests.filter((entry) => entry.manifest),
    failures,
  };
}

export function validateManifestAuthority() {
  const { manifests, failures } = readProductManifests();
  const seenIds = new Map();
  const seenPublicRoutes = new Map();
  const seenProofRoutes = new Map();
  const seenStatusRoutes = new Map();
  const seenApiRoutes = new Map();
  const seenCompatibilityDisplayOrders = new Map();

  for (const { relativePath, manifest } of manifests) {
    for (const [label, map, value] of [
      ["manifest_id_duplicate", seenIds, manifest.id],
      ["public_route_duplicate", seenPublicRoutes, manifest.surfaces.publicRoute],
      ["proof_route_duplicate", seenProofRoutes, manifest.surfaces.proofRoute],
      ["status_route_duplicate", seenStatusRoutes, manifest.surfaces.statusRoute],
    ]) {
      const previous = map.get(value);
      if (previous) {
        failures.push(`${label}:${value}:${previous}:${relativePath}`);
      } else {
        map.set(value, relativePath);
      }
    }

    for (const route of manifest.api.routes) {
      const routeKey = `${route.method} ${route.path}`;
      const previous = seenApiRoutes.get(routeKey);
      if (previous) {
        failures.push(`api_route_duplicate:${routeKey}:${previous}:${relativePath}`);
      } else {
        seenApiRoutes.set(routeKey, relativePath);
      }
    }

    if (isPlainObject(manifest.presentation) && manifest.presentation.compatibilityRegistry === true) {
      const displayOrder = manifest.presentation.displayOrder;
      const previous = seenCompatibilityDisplayOrders.get(displayOrder);
      if (previous) {
        failures.push(`presentation_display_order_duplicate:${displayOrder}:${previous}:${relativePath}`);
      } else {
        seenCompatibilityDisplayOrders.set(displayOrder, relativePath);
      }
    }
  }

  validateManualPublicSurfaceRegistry(failures);
  validateRuntimeWitnessRegistry(manifests, failures);

  if (failures.length === 0) {
    for (const mismatch of buildProductRegistryParityReport(manifests).mismatches) {
      failures.push(`registry_manifest_presentation_mismatch:${mismatch.id}:${mismatch.field}`);
    }
    for (const mismatch of buildPublicSurfaceParityReport(manifests).mismatches) {
      failures.push(`legacy_manual_public_surface_mismatch:${mismatch.section}`);
    }
  }

  return { manifests, failures };
}

export function validateRuntimeWitnessAuthority() {
  const { manifests, failures } = readProductManifests();
  validateRuntimeWitnessRegistry(manifests, failures);
  return { manifests, failures };
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function stableStringify(value) {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

function contentHash(value) {
  const withoutHash = JSON.parse(JSON.stringify(value));
  if (isPlainObject(withoutHash.meta)) {
    delete withoutHash.meta.content_hash;
  }
  return `sha256:${crypto.createHash("sha256").update(stableStringify(withoutHash)).digest("hex")}`;
}

function sourceContentHash(value) {
  const withoutHash = JSON.parse(JSON.stringify(value));
  if (isPlainObject(withoutHash.meta)) {
    delete withoutHash.meta.content_hash;
  }
  return `sha256:${crypto.createHash("sha256").update(JSON.stringify(canonicalize(withoutHash))).digest("hex")}`;
}

function withGeneratedMeta(
  name,
  artifact,
  body,
  source = "products/*/product.manifest.json",
  purpose = "Generated from product manifests. Do not edit by hand.",
) {
  const value = {
    meta: {
      name,
      purpose,
      generator: "scripts/generate-platform.mjs",
      artifact,
      source,
      content_hash: "pending",
    },
    ...body,
  };
  value.meta.content_hash = contentHash(value);
  return value;
}

function releaseGateState(manifest) {
  return manifest.status === productionStatus ? "ready" : "blocked";
}

function runtimeState(manifest) {
  return manifest.status === productionStatus ? "SolvedVerified" : "AwaitingEvidence";
}

function publicExposureAllowed(manifest) {
  return publicExposureStatuses.has(manifest.status);
}

function readManualPublicSurfaceRegistry() {
  return readJson(manualPublicSurfacesPath);
}

function productRecord(manifest, witnessMap = new Map()) {
  const apiRoutes = manifest.api.routes.map((route) => `${route.method} ${route.path}`);
  const runtimeWitness = runtimeWitnessDecision(manifest, witnessMap);
  return {
    id: manifest.id,
    name: manifest.name,
    family: manifest.family,
    category: manifest.category,
    status: manifest.status,
    publicExposureAllowed: publicExposureAllowed(manifest),
    owner: manifest.ownership.owner,
    supportEmail: manifest.ownership.supportEmail,
    summary: manifest.summary,
    sourceBoundary: "product-manifest-authority",
    runtimeService: manifest.runtime.service,
    controlPlaneRequired: manifest.runtime.controlPlaneRequired,
    apiExposure: manifest.api.exposure,
    dataClasses: manifest.data.classes,
    docsRoute: manifest.surfaces.docsRoute,
    publicRoute: manifest.surfaces.publicRoute,
    dashboardRoute: manifest.surfaces.dashboardRoute,
    proofRoute: manifest.surfaces.proofRoute,
    statusRoute: manifest.surfaces.statusRoute,
    apiRoutes,
    privacyBoundary: manifest.data.privacyBoundary,
    proofBoundary: manifest.proof.boundary,
    releaseGate: manifest.releaseGate.required,
    releaseGateState: releaseGateState(manifest),
    runtimeState: runtimeWitness.proofState,
    runtimeWitness,
  };
}

function legacyProductRegistryProjection(manifest) {
  const presentation = manifest.presentation;
  return {
    id: manifest.id,
    name: manifest.name,
    classification: presentation.classification,
    status: presentation.registryStatus,
    owner: presentation.ownerLabel,
    sourceBoundary: presentation.sourceBoundary,
    runtimeType: presentation.runtimeType,
    dataType: presentation.dataType,
    releaseGate: presentation.releaseGate,
    docsPath: presentation.docsPath,
    apiPath: presentation.apiPath,
    evidencePath: presentation.evidencePath,
    failureMode: presentation.failureMode,
    summary: manifest.summary,
  };
}

function productRegistryProjection(manifest, relativePath, witnessMap = new Map()) {
  const runtimeWitness = runtimeWitnessDecision(manifest, witnessMap);
  return {
    ...legacyProductRegistryProjection(manifest),
    manifestPath: relativePath,
    manifestStatus: manifest.status,
    manifestRuntimeService: manifest.runtime.service,
    manifestControlPlaneRequired: manifest.runtime.controlPlaneRequired,
    manifestRuntimeWitnessRequired: manifest.runtime.runtimeWitnessRequired,
    manifestApiExposure: manifest.api.exposure,
    manifestPrivacyBoundary: manifest.data.privacyBoundary,
    manifestProofBoundary: manifest.proof.boundary,
    publicExposureAllowed: publicExposureAllowed(manifest),
    releaseGateState: releaseGateState(manifest),
    runtimeState: runtimeWitness.proofState,
    runtimeWitness,
  };
}

function compatibilityManifestEntries(manifests) {
  return manifests
    .filter(({ manifest }) => manifest.presentation.compatibilityRegistry === true)
    .sort(
      (left, right) =>
        left.manifest.presentation.displayOrder - right.manifest.presentation.displayOrder ||
        left.manifest.id.localeCompare(right.manifest.id),
    );
}

const productRegistryParityFields = [
  "id",
  "name",
  "classification",
  "status",
  "owner",
  "sourceBoundary",
  "runtimeType",
  "dataType",
  "releaseGate",
  "docsPath",
  "apiPath",
  "evidencePath",
  "failureMode",
  "summary",
];

function buildProductRegistryParityReport(manifests) {
  const compatibilityEntries = compatibilityManifestEntries(manifests);
  const mismatches = [];
  const matchedProducts = [];

  for (const { manifest, relativePath } of compatibilityEntries) {
    const legacyProduct = legacyProductRegistryProjection(manifest);
    const projected = productRegistryProjection(manifest, relativePath);
    for (const field of productRegistryParityFields) {
      if (legacyProduct[field] !== projected[field]) {
        mismatches.push({
          id: manifest.id,
          field,
          legacy: String(legacyProduct[field] ?? ""),
          manifest: String(projected[field] ?? ""),
        });
      }
    }
    if (!mismatches.some((mismatch) => mismatch.id === manifest.id)) {
      matchedProducts.push({
        id: manifest.id,
        name: projected.name,
        displayOrder: manifest.presentation.displayOrder,
        manifestPath: relativePath,
      });
    }
  }

  return {
    generatedLegacyRegistryCount: compatibilityEntries.length,
    manifestPresentationCount: compatibilityEntries.length,
    comparedFields: productRegistryParityFields,
    matchedProducts: matchedProducts.sort((left, right) => left.displayOrder - right.displayOrder || left.id.localeCompare(right.id)),
    nonRegistryManifests: manifests
      .filter(({ manifest }) => manifest.presentation.compatibilityRegistry !== true)
      .map(({ manifest, relativePath }) => ({
        id: manifest.id,
        name: manifest.name,
        manifestPath: relativePath,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    mismatches,
    parityState: mismatches.length === 0 ? "matched" : "blocked",
  };
}

const publicSurfaceParitySections = ["principles", "systems", "futureDomains", "privateIncubation"];

function canonicalEquivalent(left, right) {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

function buildPublicSurfaceParityReport(manifests) {
  const generatedLegacy = buildLegacyProductsBody(manifests);
  const manual = readManualPublicSurfaceRegistry();
  const matchedSections = [];
  const mismatches = [];

  for (const section of publicSurfaceParitySections) {
    const legacyValue = generatedLegacy[section] ?? [];
    const manualValue = manual[section] ?? [];
    if (canonicalEquivalent(legacyValue, manualValue)) {
      matchedSections.push({
        section,
        count: Array.isArray(manualValue) ? manualValue.length : 0,
      });
    } else {
      mismatches.push({
        section,
        legacyCount: Array.isArray(legacyValue) ? legacyValue.length : 0,
        manualCount: Array.isArray(manualValue) ? manualValue.length : 0,
      });
    }
  }

  return {
    manualSource: manualPublicSurfacesPath,
    legacySource: "data/products.json (generated)",
    sections: publicSurfaceParitySections,
    matchedSections,
    mismatches,
    parityState: mismatches.length === 0 ? "matched" : "blocked",
  };
}

function buildLegacyProductsBody(manifests) {
  const publicSurfaces = readManualPublicSurfaceRegistry();
  return {
    meta: {
      name: "Mullusi",
      domain: "mullusi.com",
      version: publicSurfaces.meta.version,
      description: "Generated public deployment and roadmap registry for Mullusi.",
      source_boundary: "generated-compatibility-projection",
      generated_from: ["products/*/product.manifest.json", manualPublicSurfacesPath],
      content_hash: "pending",
    },
    principles: publicSurfaces.principles || [],
    productRegistry: compatibilityManifestEntries(manifests).map(({ manifest }) =>
      legacyProductRegistryProjection(manifest),
    ),
    systems: publicSurfaces.systems || [],
    futureDomains: publicSurfaces.futureDomains || [],
    privateIncubation: publicSurfaces.privateIncubation || [],
  };
}

function buildLegacyProductsArtifact(manifests) {
  const legacyProducts = buildLegacyProductsBody(manifests);
  legacyProducts.meta.content_hash = sourceContentHash(legacyProducts);
  return legacyProducts;
}

function buildProductsArtifact(manifests, witnessMap = new Map()) {
  const products = manifests
    .map(({ manifest }) => productRecord(manifest, witnessMap))
    .sort((left, right) => left.id.localeCompare(right.id));
  return withGeneratedMeta("Mullusi Generated Product Registry", generatedArtifacts.products, {
    products,
    publicProducts: products.filter((product) => product.publicExposureAllowed),
    blockedProducts: products.filter((product) => !product.publicExposureAllowed),
  });
}

function buildStatusArtifact(manifests, witnessMap = new Map()) {
  const products = manifests
    .map(({ manifest }) => {
      const runtimeWitness = runtimeWitnessDecision(manifest, witnessMap);
      return {
        id: manifest.id,
        name: manifest.name,
        status: manifest.status,
        runtimeState: runtimeWitness.proofState,
        runtimeWitnessState: runtimeWitness.runtimeState,
        runtimeWitnessClosed: runtimeWitness.runtimeWitnessClosed,
        healthEvidenceState: runtimeWitness.healthEvidenceState,
        preflightDecision: runtimeWitness.preflightDecision,
        releaseGate: releaseGateState(manifest),
        publicExposureAllowed: publicExposureAllowed(manifest),
        runtimeService: manifest.runtime.service,
        publicRoute: manifest.surfaces.publicRoute,
        proofRoute: manifest.surfaces.proofRoute,
        statusRoute: manifest.surfaces.statusRoute,
        blockingReason:
          runtimeWitness.runtimeWitnessClosed && publicExposureAllowed(manifest)
            ? "none"
            : "Public exposure blocked until release gate, service health evidence, rollback, and runtime witness close.",
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
  return withGeneratedMeta("Mullusi Generated Product Status", generatedArtifacts.status, {
    products,
  });
}

function buildProofIndexArtifact(manifests, witnessMap = new Map()) {
  const products = manifests
    .map(({ manifest }) => ({
      id: manifest.id,
      name: manifest.name,
      proofState: runtimeWitnessProofState(manifest, witnessMap),
      proofRoute: manifest.surfaces.proofRoute,
      proofBoundary: manifest.proof.boundary,
      claimsAllowed: manifest.proof.claimsAllowed,
      claimsBlockedUntilVerified: manifest.proof.claimsBlockedUntilVerified,
      witnesses: manifest.proof.witnesses,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return withGeneratedMeta("Mullusi Generated Proof Index", generatedArtifacts.proofIndex, {
    products,
  });
}

function buildApiRegistryArtifact(manifests, witnessMap = new Map()) {
  const routes = manifests.flatMap(({ manifest }) =>
    manifest.api.routes.map((route) => {
      const runtimeWitness = runtimeWitnessDecision(manifest, witnessMap);
      return {
        productId: manifest.id,
        productName: manifest.name,
        service: manifest.runtime.service,
        method: route.method,
        path: route.path,
        contract: route.contract,
        controlPlaneRequired: manifest.runtime.controlPlaneRequired,
        runtimeWitnessRequired: manifest.runtime.runtimeWitnessRequired,
        runtimeWitnessState: runtimeWitness.proofState,
        preflightDecision: runtimeWitness.preflightDecision,
        releaseGateState: releaseGateState(manifest),
      };
    }),
  );
  routes.sort((left, right) => `${left.method} ${left.path}`.localeCompare(`${right.method} ${right.path}`));
  return withGeneratedMeta("Mullusi Generated API Registry", generatedArtifacts.apiRegistry, {
    noPublicEndpointProducts: manifests
      .filter(({ manifest }) => manifest.api.exposure === "none")
      .map(({ manifest }) => ({
        productId: manifest.id,
        productName: manifest.name,
        service: manifest.runtime.service,
        releaseGateState: releaseGateState(manifest),
      }))
      .sort((left, right) => left.productId.localeCompare(right.productId)),
    routes,
  });
}

function buildHomepageCardsArtifact(manifests) {
  const allCards = manifests
    .filter(({ manifest }) => manifest.generation.emitHomepageCard)
    .map(({ manifest }) => ({
      id: manifest.id,
      title: manifest.name,
      summary: manifest.summary,
      href: manifest.surfaces.publicRoute,
      status: manifest.status,
      publicExposureAllowed: publicExposureAllowed(manifest),
      proofRoute: manifest.surfaces.proofRoute,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return withGeneratedMeta("Mullusi Generated Homepage Cards", generatedArtifacts.homepageCards, {
    cards: allCards.filter((card) => card.publicExposureAllowed),
    blockedCandidates: allCards.filter((card) => !card.publicExposureAllowed),
  });
}

function buildHomepageProductRegistryBody(manifests, witnessMap = new Map()) {
  const productRegistry = compatibilityManifestEntries(manifests).map(({ manifest, relativePath }) =>
    productRegistryProjection(manifest, relativePath, witnessMap),
  );
  const manifestCandidates = manifests
    .filter(({ manifest }) => manifest.presentation.compatibilityRegistry !== true)
    .map(({ manifest, relativePath }) => ({
      id: manifest.id,
      name: manifest.name,
      summary: manifest.summary,
      status: manifest.status,
      compatibilityRegistry: manifest.presentation.compatibilityRegistry,
      manifestPath: relativePath,
      publicExposureAllowed: publicExposureAllowed(manifest),
      releaseGateState: releaseGateState(manifest),
      runtimeState: runtimeWitnessProofState(manifest, witnessMap),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return {
    productRegistry,
    manifestCandidates,
  };
}

function buildHomepageProductRegistryArtifact(manifests, witnessMap = new Map()) {
  return withGeneratedMeta(
    "Mullusi Generated Homepage Product Registry",
    generatedArtifacts.homepageProductRegistry,
    buildHomepageProductRegistryBody(manifests, witnessMap),
    "products/*/product.manifest.json",
    "Generated homepage product registry from product manifests. Do not edit by hand.",
  );
}

function buildDocsIndexArtifact(manifests) {
  const entries = manifests
    .filter(({ manifest }) => manifest.generation.emitDocsIndex)
    .map(({ manifest }) => ({
      id: manifest.id,
      name: manifest.name,
      docsRoute: manifest.surfaces.docsRoute,
      apiRoutes: manifest.api.routes.map((route) => `${route.method} ${route.path}`),
      status: manifest.status,
      releaseGateState: releaseGateState(manifest),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return withGeneratedMeta("Mullusi Generated Docs Index", generatedArtifacts.docsIndex, {
    entries,
  });
}

function buildReleaseChecklistsArtifact(manifests, witnessMap = new Map()) {
  const checklists = manifests
    .map(({ manifest }) => {
      const runtimeWitness = runtimeWitnessDecision(manifest, witnessMap);
      return {
        id: manifest.id,
        name: manifest.name,
        status: manifest.status,
        releaseGateState: releaseGateState(manifest),
        required: manifest.releaseGate.required.map((item) => ({
          item,
          state:
            item === "runtime_witness" && runtimeWitness.runtimeWitnessClosed
              ? "pass"
              : manifest.status === productionStatus
                ? "pass"
                : "pending",
        })),
        promotionPath: manifest.releaseGate.promotionPath,
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
  return withGeneratedMeta("Mullusi Generated Release Checklists", generatedArtifacts.releaseChecklists, {
    checklists,
  });
}

function buildMigrationCoverageArtifact(manifests) {
  const compatibilityEntries = compatibilityManifestEntries(manifests);
  const coveredProducts = compatibilityEntries.map(({ manifest, relativePath }) => ({
    id: manifest.id,
    name: manifest.name,
    registryStatus: manifest.presentation.registryStatus,
    manifestPath: relativePath,
  }));
  const extraManifests = manifests
    .filter(({ manifest }) => manifest.presentation.compatibilityRegistry !== true)
    .map(({ manifest }) => ({
      id: manifest.id,
      name: manifest.name,
      status: manifest.status,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return withGeneratedMeta("Mullusi Generated Registry Migration Coverage", generatedArtifacts.migrationCoverage, {
    registryProductCount: compatibilityEntries.length,
    manifestCount: manifests.length,
    coveredProducts,
    extraManifests,
    missingProducts: [],
    migrationState: "generated",
  });
}

function buildProductRegistryParityArtifact(manifests) {
  return withGeneratedMeta("Mullusi Generated Product Registry Parity Witness", generatedArtifacts.productRegistryParity, {
    ...buildProductRegistryParityReport(manifests),
  }, "products/*/product.manifest.json + data/products.json (generated)");
}

function buildPublicSurfaceParityArtifact(manifests) {
  return withGeneratedMeta("Mullusi Generated Public Surface Parity Witness", generatedArtifacts.publicSurfaceParity, {
    ...buildPublicSurfaceParityReport(manifests),
  }, `${manualPublicSurfacesPath} + data/products.json (generated)`, "Generated from manual public-surface registry and generated compatibility projection. Do not edit by hand.");
}

function buildProductsCompatibilityArtifact(manifests, witnessMap = new Map()) {
  const publicSurfaces = readManualPublicSurfaceRegistry();
  const homepageProducts = buildHomepageProductRegistryBody(manifests, witnessMap);
  return withGeneratedMeta("Mullusi Generated Products Compatibility Registry", generatedArtifacts.productsCompatibility, {
    compatibility: {
      target: "assets/app.js current product registry renderer",
      sourceBoundary: "manifest presentation projection plus manual public-surface registry",
      cutoverState: "active",
    },
    principles: publicSurfaces.principles || [],
    productRegistry: homepageProducts.productRegistry,
    systems: publicSurfaces.systems || [],
    futureDomains: publicSurfaces.futureDomains || [],
    privateIncubation: publicSurfaces.privateIncubation || [],
    manifestCandidates: homepageProducts.manifestCandidates,
  }, `products/*/product.manifest.json + ${manualPublicSurfacesPath}`, "Generated from product manifests and manual public-surface registry. Do not edit by hand.");
}

function buildRuntimeWitnessIndexArtifact(manifests, witnessMap = new Map()) {
  const witnesses = manifests
    .map(({ manifest, relativePath }) => {
      const witness = witnessMap.get(manifest.id);
      const runtimeWitness = runtimeWitnessDecision(manifest, witnessMap);
      return {
        productId: manifest.id,
        productName: manifest.name,
        productManifest: relativePath,
        service: manifest.runtime.service,
        status: manifest.status,
        proofState: runtimeWitness.proofState,
        runtimeState: runtimeWitness.runtimeState,
        healthEvidenceState: runtimeWitness.healthEvidenceState,
        requiredEndpoints: isPlainObject(witness) ? witness.health.requiredEndpoints : requiredRuntimeWitnessEndpoints,
        observationCount: Array.isArray(witness?.health?.observations) ? witness.health.observations.length : 0,
        preflightMode: isPlainObject(witness) ? witness.preflight.mode : "fail-closed",
        preflightDecision: runtimeWitness.preflightDecision,
        publicExposureAllowed: runtimeWitness.publicExposureAllowed,
        runtimeWitnessClosed: runtimeWitness.runtimeWitnessClosed,
        rollbackState: isPlainObject(witness) ? witness.rollback.state : "AwaitingEvidence",
        blockingReason: runtimeWitness.runtimeWitnessClosed
          ? "none"
          : "Missing passing service health, gateway witness, runtime conformance, rollback, or public exposure decision.",
      };
    })
    .sort((left, right) => left.productId.localeCompare(right.productId));
  return withGeneratedMeta(
    "Mullusi Generated Runtime Witness Index",
    generatedArtifacts.runtimeWitnessIndex,
    {
      sourceRegistry: runtimeWitnessRegistryPath,
      schema: runtimeWitnessSchemaPath,
      requiredEndpoints: requiredRuntimeWitnessEndpoints,
      productionPreflight: {
        mode: "fail-closed",
        rule: "No production or public exposure unless runtimeWitnessClosed is true.",
      },
      witnesses,
      blockedProducts: witnesses.filter((witness) => !witness.runtimeWitnessClosed),
      closedProducts: witnesses.filter((witness) => witness.runtimeWitnessClosed),
    },
    `${runtimeWitnessRegistryPath} + products/*/product.manifest.json`,
    "Generated public-safe runtime witness index. Do not edit by hand.",
  );
}

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function buildSitemapArtifact(manifests) {
  const routes = manifests
    .filter(({ manifest }) => manifest.generation.emitSitemap && publicExposureAllowed(manifest))
    .map(({ manifest }) => manifest.surfaces.publicRoute)
    .sort((left, right) => left.localeCompare(right));
  const urlRows = routes
    .map((route) => `  <url>\n    <loc>${xmlEscape(`https://mullusi.com${route}`)}</loc>\n  </url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!-- Purpose: generated product sitemap candidates from product manifests. Governance scope: public exposure only; private-incubation products are intentionally omitted. Invariants: do not edit by hand. -->\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlRows}${urlRows ? "\n" : ""}</urlset>\n`;
}

export function buildGeneratedArtifacts(manifests) {
  const runtimeWitnessMap = buildRuntimeWitnessMap(readRuntimeWitnessRegistry());
  return new Map([
    [generatedArtifacts.legacyProducts, stableStringify(buildLegacyProductsArtifact(manifests))],
    [generatedArtifacts.products, stableStringify(buildProductsArtifact(manifests, runtimeWitnessMap))],
    [generatedArtifacts.status, stableStringify(buildStatusArtifact(manifests, runtimeWitnessMap))],
    [generatedArtifacts.proofIndex, stableStringify(buildProofIndexArtifact(manifests, runtimeWitnessMap))],
    [generatedArtifacts.apiRegistry, stableStringify(buildApiRegistryArtifact(manifests, runtimeWitnessMap))],
    [generatedArtifacts.homepageCards, stableStringify(buildHomepageCardsArtifact(manifests))],
    [generatedArtifacts.homepageProductRegistry, stableStringify(buildHomepageProductRegistryArtifact(manifests, runtimeWitnessMap))],
    [generatedArtifacts.docsIndex, stableStringify(buildDocsIndexArtifact(manifests))],
    [generatedArtifacts.releaseChecklists, stableStringify(buildReleaseChecklistsArtifact(manifests, runtimeWitnessMap))],
    [generatedArtifacts.migrationCoverage, stableStringify(buildMigrationCoverageArtifact(manifests))],
    [generatedArtifacts.productRegistryParity, stableStringify(buildProductRegistryParityArtifact(manifests))],
    [generatedArtifacts.publicSurfaceParity, stableStringify(buildPublicSurfaceParityArtifact(manifests))],
    [generatedArtifacts.productsCompatibility, stableStringify(buildProductsCompatibilityArtifact(manifests, runtimeWitnessMap))],
    [generatedArtifacts.runtimeWitnessIndex, stableStringify(buildRuntimeWitnessIndexArtifact(manifests, runtimeWitnessMap))],
    [generatedArtifacts.sitemap, buildSitemapArtifact(manifests)],
  ]);
}

export function writeGeneratedArtifacts(artifacts, options = {}) {
  const failures = [];
  const checkOnly = options.checkOnly === true;
  for (const [relativePath, expectedContent] of artifacts.entries()) {
    const targetPath = assertInsideRepo(relativePath);
    const currentContent = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, "utf8") : null;
    if (checkOnly) {
      if (currentContent !== expectedContent) {
        failures.push(`generated_artifact_drift:${relativePath}`);
      }
      continue;
    }
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, expectedContent, "utf8");
  }
  return failures;
}

export function generatePlatform(options = {}) {
  const { manifests, failures } = validateManifestAuthority();
  if (failures.length > 0) {
    return { state: "blocked", failures, artifacts: new Map() };
  }
  const artifacts = buildGeneratedArtifacts(manifests);
  const driftFailures = writeGeneratedArtifacts(artifacts, { checkOnly: options.checkOnly === true });
  return {
    state: driftFailures.length > 0 ? "blocked" : "generated",
    failures: driftFailures,
    artifacts,
  };
}

function main() {
  const checkOnly = process.argv.includes("--check");
  const result = generatePlatform({ checkOnly });
  if (result.failures.length > 0) {
    console.error(result.failures.join("\n"));
    process.exitCode = 1;
    return;
  }
  const action = checkOnly ? "platform generation drift check passed" : "platform generation completed";
  console.log(`${action}: ${result.artifacts.size} artifacts`);
}

if (path.resolve(process.argv[1] || "") === scriptPath) {
  main();
}
