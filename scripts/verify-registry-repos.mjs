/*
Purpose: verify Mullusi public registry source-boundary rules.
Governance scope: manual public surfaces, manifest-generated homepage products, private-source state, future-domain boundaries, and repo disclosure prevention.
Dependencies: Node.js standard library only.
Invariants: public registry records must not expose private repository slugs or GitHub source links.
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const manualPublicSurfacesPath = path.join(repoRoot, "data", "manual", "public-surfaces.json");
const homepageProductRegistryPath = path.join(repoRoot, "data", "generated", "homepage-product-registry.json");
const failures = [];

function recordFailure(message) {
  failures.push(message);
}

export function publicRegistryHrefLabel(value) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol === "https:" && /^(?:[a-z0-9.-]+\.)?mullusi\.com$/i.test(parsed.hostname)) {
      return parsed.toString();
    }
  } catch {
    // Fall through to the redacted label.
  }
  return value ? "redacted_url" : "missing";
}

export function publicRegistryScalarLabel(value) {
  if (typeof value !== "string" || value.length === 0) return "missing";
  return /^[A-Za-z0-9_.:-]{1,80}$/.test(value) ? value : "redacted_value";
}

export function publicReadErrorCode(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof SyntaxError) {
    return "json_invalid";
  }
  if (/ENOENT|EACCES|EPERM|file|directory|open/i.test(message)) {
    return "file_unavailable";
  }
  if (/[A-Z]:\\|private|secret/i.test(message)) {
    return "read_unavailable";
  }
  if (/json|parse|syntax/i.test(message)) {
    return "json_invalid";
  }
  return "read_unavailable";
}

export function publicRegistryBoundaryError(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/^[a-z0-9_.]+_(?:read_failed|not_array):[a-z_]+$/i.test(message) || /^[a-z0-9_.]+_not_array$/i.test(message)) {
    return message;
  }
  return "registry_boundary_unavailable";
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${label}_read_failed:${publicReadErrorCode(error)}`);
  }
}

function requireArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label}_not_array`);
  }
  return value;
}

function hasRepositorySlug(value) {
  if (typeof value !== "string") return false;
  return /github\.com\/|[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/.test(value);
}

function verifySystems(systems) {
  const seenHrefs = new Set();
  for (const [index, system] of systems.entries()) {
    const label = `systems.${index}`;
    if (Object.prototype.hasOwnProperty.call(system, "repo")) {
      recordFailure(`${label}.repo_forbidden`);
    }
    if (typeof system.href !== "string" || !/^https:\/\/(?:[a-z0-9.-]+\.)?mullusi\.com(?:\/.*)?$/.test(system.href)) {
      recordFailure(`${label}.href_invalid:${publicRegistryHrefLabel(system.href)}`);
    }
    if (system.sourceState !== "private-source" && system.sourceState !== "public-release") {
      recordFailure(`${label}.source_state_invalid:${publicRegistryScalarLabel(system.sourceState)}`);
    }
    if (seenHrefs.has(system.href)) {
      recordFailure(`${label}.href_duplicate:${publicRegistryHrefLabel(system.href)}`);
    }
    seenHrefs.add(system.href);
  }
}

function verifyProductRegistry(products) {
  const seenNames = new Set();
  for (const [index, product] of products.entries()) {
    const label = `productRegistry.${index}`;
    if (Object.prototype.hasOwnProperty.call(product, "repo") || Object.prototype.hasOwnProperty.call(product, "plannedRepo")) {
      recordFailure(`${label}.repo_forbidden`);
    }
    if (typeof product.sourceBoundary !== "string" || product.sourceBoundary.trim().length === 0) {
      recordFailure(`${label}.source_boundary_missing`);
    }
    if (/github\.com\//i.test(product.sourceBoundary || "")) {
      recordFailure(`${label}.source_boundary_public_repo_forbidden`);
    }
    if (seenNames.has(product.name)) {
      recordFailure(`${label}.name_duplicate`);
    }
    seenNames.add(product.name);
  }
}

function verifyManifestCandidates(candidates) {
  const seenIds = new Set();
  for (const [index, candidate] of candidates.entries()) {
    const label = `manifestCandidates.${index}`;
    if (Object.prototype.hasOwnProperty.call(candidate, "repo") || Object.prototype.hasOwnProperty.call(candidate, "plannedRepo")) {
      recordFailure(`${label}.repo_forbidden`);
    }
    if (hasRepositorySlug([candidate.id, candidate.name, candidate.summary].join(" "))) {
      recordFailure(`${label}.repo_reference_forbidden`);
    }
    if (typeof candidate.publicExposureAllowed !== "boolean") {
      recordFailure(`${label}.public_exposure_allowed_not_boolean`);
    }
    if (seenIds.has(candidate.id)) {
      recordFailure(`${label}.id_duplicate`);
    }
    seenIds.add(candidate.id);
  }
}

function verifyFutureDomains(futureDomains) {
  const seenSlugs = new Set();
  for (const [index, domain] of futureDomains.entries()) {
    const label = `futureDomains.${index}`;
    if (Object.prototype.hasOwnProperty.call(domain, "plannedRepo")) {
      recordFailure(`${label}.planned_repo_forbidden`);
    }
    if (typeof domain.releaseBoundary !== "string" || domain.releaseBoundary.trim().length === 0) {
      recordFailure(`${label}.release_boundary_missing`);
    }
    if (seenSlugs.has(domain.slug)) {
      recordFailure(`${label}.slug_duplicate`);
    }
    seenSlugs.add(domain.slug);
  }
}

function verifyPrivateIncubation(privateIncubation) {
  for (const [index, item] of privateIncubation.entries()) {
    const label = `privateIncubation.${index}`;
    const publicText = [item.name, item.summary, item.publishGate].join(" ");
    if (hasRepositorySlug(publicText)) {
      recordFailure(`${label}.repo_reference_forbidden`);
    }
    if (item.visibility !== "private") {
      recordFailure(`${label}.visibility_invalid:${publicRegistryScalarLabel(item.visibility)}`);
    }
  }
}

function verifyRegistryBoundary() {
  const publicSurfaces = readJson(manualPublicSurfacesPath, "manual_public_surfaces");
  const homepageProducts = readJson(homepageProductRegistryPath, "homepage_product_registry");
  const systems = requireArray(publicSurfaces.systems, "manual_systems");
  const productRegistry = requireArray(homepageProducts.productRegistry, "homepage_product_registry");
  const futureDomains = requireArray(publicSurfaces.futureDomains, "manual_future_domains");
  const privateIncubation = Array.isArray(publicSurfaces.privateIncubation) ? publicSurfaces.privateIncubation : [];
  const manifestCandidates = Array.isArray(homepageProducts.manifestCandidates) ? homepageProducts.manifestCandidates : [];

  verifySystems(systems);
  verifyProductRegistry(productRegistry);
  verifyManifestCandidates(manifestCandidates);
  verifyFutureDomains(futureDomains);
  verifyPrivateIncubation(privateIncubation);

  if (failures.length > 0) {
    console.error(failures.join("\n"));
    process.exit(1);
  }

  console.log(`registry boundary verification passed: ${systems.length} public surfaces, ${productRegistry.length} homepage product records, ${manifestCandidates.length} manifest candidates, ${futureDomains.length} staged domains`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    verifyRegistryBoundary();
  } catch (error) {
    console.error(`registry_boundary_verification_failed:${publicRegistryBoundaryError(error)}`);
    process.exit(1);
  }
}
