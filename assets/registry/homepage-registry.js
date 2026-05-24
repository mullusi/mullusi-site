/*
Purpose: load and compose Mullusi homepage registry records from governed public JSON.
Governance scope: public-surface registry loading, product manifest projection loading, and deterministic homepage registry composition.
Dependencies: data/manual/public-surfaces.json, data/generated/homepage-product-registry.json, data/site.json, data/news.json, and browser fetch.
Invariants: fetch failures are explicit, product truth remains manifest-generated, non-product surfaces remain manual public-safe records, and no fallback silently rewrites registry state.
*/

(() => {
  const registryPaths = Object.freeze({
    manualPublicSurfaces: "data/manual/public-surfaces.json",
    homepageProductRegistry: "data/generated/homepage-product-registry.json",
    siteContent: "data/site.json",
    news: "data/news.json",
  });

  async function loadJsonResource(resourcePath, label) {
    const response = await fetch(resourcePath, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`${label} load failed: ${response.status}`);
    }
    return response.json();
  }

  function arrayOrEmpty(value) {
    return Array.isArray(value) ? value : [];
  }

  function composeHomepageRegistry(publicSurfaces, productRegistry) {
    return {
      principles: arrayOrEmpty(publicSurfaces?.principles),
      systems: arrayOrEmpty(publicSurfaces?.systems),
      futureDomains: arrayOrEmpty(publicSurfaces?.futureDomains),
      privateIncubation: arrayOrEmpty(publicSurfaces?.privateIncubation),
      productRegistry: arrayOrEmpty(productRegistry?.productRegistry),
      manifestCandidates: arrayOrEmpty(productRegistry?.manifestCandidates),
    };
  }

  async function loadRegistry() {
    const [publicSurfaces, productRegistry] = await Promise.all([
      loadJsonResource(registryPaths.manualPublicSurfaces, "Public surface registry"),
      loadJsonResource(registryPaths.homepageProductRegistry, "Homepage product registry"),
    ]);
    return composeHomepageRegistry(publicSurfaces, productRegistry);
  }

  function loadSiteContent() {
    return loadJsonResource(registryPaths.siteContent, "Site content");
  }

  function loadNews() {
    return loadJsonResource(registryPaths.news, "News");
  }

  window.MullusiHomepageRegistry = Object.freeze({
    composeHomepageRegistry,
    loadJsonResource,
    loadNews,
    loadRegistry,
    loadSiteContent,
    registryPaths,
  });
})();
