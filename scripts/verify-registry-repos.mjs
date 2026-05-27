/*
Purpose: verify Mullusi public registry source-boundary rules.
Governance scope: manual public surfaces, manifest-generated homepage products, private-source state, future-domain boundaries, and repo disclosure prevention.
Dependencies: Node.js standard library only.
Invariants: public registry records must not expose private repository slugs or GitHub source links.
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const manualPublicSurfacesPath = path.join(repoRoot, "data", "manual", "public-surfaces.json");
const homepageProductRegistryPath = path.join(repoRoot, "data", "generated", "homepage-product-registry.json");
const failures = [];

function recordFailure(message) {
  failures.push(message);
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${label}_read_failed:${error.message}`);
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
      recordFailure(`${label}.href_invalid:${system.href}`);
    }
    if (system.sourceState !== "private-source" && system.sourceState !== "public-release") {
      recordFailure(`${label}.source_state_invalid:${system.sourceState}`);
    }
    if (seenHrefs.has(system.href)) {
      recordFailure(`${label}.href_duplicate:${system.href}`);
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
      recordFailure(`${label}.source_boundary_public_repo_forbidden:${product.name}`);
    }
    if (seenNames.has(product.name)) {
      recordFailure(`${label}.name_duplicate:${product.name}`);
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
      recordFailure(`${label}.repo_reference_forbidden:${candidate.id || index}`);
    }
    if (typeof candidate.publicExposureAllowed !== "boolean") {
      recordFailure(`${label}.public_exposure_allowed_not_boolean`);
    }
    if (seenIds.has(candidate.id)) {
      recordFailure(`${label}.id_duplicate:${candidate.id}`);
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
      recordFailure(`${label}.slug_duplicate:${domain.slug}`);
    }
    seenSlugs.add(domain.slug);
  }
}

function verifyPrivateIncubation(privateIncubation) {
  for (const [index, item] of privateIncubation.entries()) {
    const label = `privateIncubation.${index}`;
    const publicText = [item.name, item.summary, item.publishGate].join(" ");
    if (hasRepositorySlug(publicText)) {
      recordFailure(`${label}.repo_reference_forbidden:${item.name}`);
    }
    if (item.visibility !== "private") {
      recordFailure(`${label}.visibility_invalid:${item.visibility}`);
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

try {
  verifyRegistryBoundary();
} catch (error) {
  console.error(`registry_boundary_verification_failed:${error.message}`);
  process.exit(1);
}
