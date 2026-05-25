/*
Purpose: coordinate Mullusi structured public content and homepage runtime modules.
Governance scope: deterministic JSON rendering, safe link output, searchable public surface catalog, manifest-owned homepage product registry, and explicit runtime orchestration.
Dependencies: assets/runtime/page-runtime.js, assets/runtime/preference-runtime.js, assets/runtime/substrate-runtime.js, assets/runtime/homepage-controller.js, assets/registry/homepage-registry.js, assets/render/site-content.js, assets/render/public-surface-registry.js, assets/render/product-registry.js, assets/render/news-activity.js, and browser fetch.
Invariants: untrusted JSON text is escaped, non-public links are blocked, registry failures surface visibly, and reduced motion is respected.
*/

document.documentElement.classList.add("js-enabled");

const state = {
  registry: null,
  siteContent: null,
  news: null,
  i18n: null,
  lang: "en",
  activeCategory: "All",
  activeProductStatus: "All",
  productRegistryExpanded: false,
  query: "",
  visits: 0,
};

const pageRuntime = pageRuntimeModule();
const preferenceRuntime = preferenceRuntimeModule();
const substrateRuntime = substrateRuntimeModule();
const homepageController = homepageControllerModule();
const qs = pageRuntime.qs;
const qsa = pageRuntime.qsa;
const escapeHtml = pageRuntime.escapeHtml;
const escapeAttribute = pageRuntime.escapeAttribute;
const revealRendered = pageRuntime.revealRendered;

function pageRuntimeModule() {
  if (!window.MullusiPageRuntime) {
    throw new Error("Page runtime module is unavailable.");
  }
  return window.MullusiPageRuntime;
}

function preferenceRuntimeModule() {
  if (!window.MullusiPreferenceRuntime) {
    throw new Error("Preference runtime module is unavailable.");
  }
  return window.MullusiPreferenceRuntime;
}

function substrateRuntimeModule() {
  if (!window.MullusiSubstrateRuntime) {
    throw new Error("Substrate runtime module is unavailable.");
  }
  return window.MullusiSubstrateRuntime;
}

function homepageControllerModule() {
  if (!window.MullusiHomepageController) {
    throw new Error("Homepage controller module is unavailable.");
  }
  return window.MullusiHomepageController;
}

function i18nText(key) {
  return preferenceRuntime.i18nText(state.i18n, state.lang, key);
}

function localized(record, field) {
  return preferenceRuntime.localized(record, field, state.lang);
}

function preferenceContext() {
  return {
    getI18n: () => state.i18n,
    getLang: () => state.lang,
    setLang: (lang) => {
      state.lang = lang;
    },
  };
}

function siteContentRendererModule() {
  if (!window.MullusiSiteContentRenderer) {
    throw new Error("Site content renderer module is unavailable.");
  }
  return window.MullusiSiteContentRenderer;
}

function siteContentRenderContext() {
  return {
    activityHref,
    escapeAttribute,
    escapeHtml,
    i18nText,
    localized,
    qs,
    revealRendered,
    state,
  };
}

function renderProofLanes() {
  siteContentRendererModule().renderProofLanes(siteContentRenderContext());
}

function renderInterfaceLinks() {
  siteContentRendererModule().renderInterfaceLinks(siteContentRenderContext());
}

function renderServices() {
  siteContentRendererModule().renderServices(siteContentRenderContext());
}

function renderServiceTiers() {
  siteContentRendererModule().renderServiceTiers(siteContentRenderContext());
}

function renderApiContracts() {
  siteContentRendererModule().renderApiContracts(siteContentRenderContext());
}

function renderPlatformLayers() {
  siteContentRendererModule().renderPlatformLayers(siteContentRenderContext());
}

function renderRequestFlow() {
  siteContentRendererModule().renderRequestFlow(siteContentRenderContext());
}

function renderPlatformBuildSequence() {
  siteContentRendererModule().renderPlatformBuildSequence(siteContentRenderContext());
}

function renderProductQuestions() {
  siteContentRendererModule().renderProductQuestions(siteContentRenderContext());
}

function renderReleaseStages() {
  siteContentRendererModule().renderReleaseStages(siteContentRenderContext());
}

function renderRepositoryHandoff() {
  siteContentRendererModule().renderRepositoryHandoff(siteContentRenderContext());
}

function renderFlowDiagram() {
  siteContentRendererModule().renderFlowDiagram(siteContentRenderContext());
}

function renderBoundaryMap() {
  siteContentRendererModule().renderBoundaryMap(siteContentRenderContext());
}

function renderReleaseMachine() {
  siteContentRendererModule().renderReleaseMachine(siteContentRenderContext());
}

function renderEvaluationExample() {
  siteContentRendererModule().renderEvaluationExample(siteContentRenderContext());
}

function renderStatusBoard() {
  siteContentRendererModule().renderStatusBoard(siteContentRenderContext());
}

function renderUseCases() {
  siteContentRendererModule().renderUseCases(siteContentRenderContext());
}

function newsActivityRendererModule() {
  if (!window.MullusiNewsActivityRenderer) {
    throw new Error("News activity renderer module is unavailable.");
  }
  return window.MullusiNewsActivityRenderer;
}

function newsActivityRenderContext() {
  return {
    escapeAttribute,
    escapeHtml,
    i18nText,
    localized,
    qs,
    revealRendered,
    state,
  };
}

function renderVisitMeter() {
  newsActivityRendererModule().renderVisitMeter(newsActivityRenderContext());
}

function renderNews() {
  newsActivityRendererModule().renderNews(newsActivityRenderContext());
}

function renderMulluActivity() {
  newsActivityRendererModule().renderMulluActivity(newsActivityRenderContext());
}

function renderNewsLoadError() {
  newsActivityRendererModule().renderNewsLoadError(newsActivityRenderContext());
}

function publicSurfaceRegistryRendererModule() {
  if (!window.MullusiPublicSurfaceRegistryRenderer) {
    throw new Error("Public surface registry renderer module is unavailable.");
  }
  return window.MullusiPublicSurfaceRegistryRenderer;
}

function publicSurfaceRegistryRenderContext() {
  return {
    escapeAttribute,
    escapeHtml,
    i18nText,
    localized,
    qsa,
    qs,
    revealRendered,
    state,
  };
}

function renderSnapshot() {
  publicSurfaceRegistryRendererModule().renderSnapshot(publicSurfaceRegistryRenderContext());
}

function renderFutureDomains() {
  publicSurfaceRegistryRendererModule().renderFutureDomains(publicSurfaceRegistryRenderContext());
}

function renderFilters() {
  publicSurfaceRegistryRendererModule().renderFilters(publicSurfaceRegistryRenderContext());
}

function renderStats() {
  publicSurfaceRegistryRendererModule().renderStats(publicSurfaceRegistryRenderContext());
}

function renderRepoGrid() {
  publicSurfaceRegistryRendererModule().renderRepoGrid(publicSurfaceRegistryRenderContext());
}

function renderMetrics() {
  publicSurfaceRegistryRendererModule().renderMetrics(publicSurfaceRegistryRenderContext());
}

function bindSearch() {
  publicSurfaceRegistryRendererModule().bindSearch(publicSurfaceRegistryRenderContext());
}

function productRegistryRendererModule() {
  if (!window.MullusiProductRegistryRenderer) {
    throw new Error("Product registry renderer module is unavailable.");
  }
  return window.MullusiProductRegistryRenderer;
}

function productRegistryRenderContext() {
  return {
    escapeAttribute,
    escapeHtml,
    i18nText,
    qsa,
    qs,
    revealRendered,
    state,
  };
}

function renderProductRegistry() {
  productRegistryRendererModule().renderProductRegistry(productRegistryRenderContext());
}

function renderProductRegistryControls() {
  productRegistryRendererModule().renderProductRegistryControls(productRegistryRenderContext());
}

function activityHref(value) {
  return newsActivityRendererModule().activityHref(value);
}

function homepageRegistryModule() {
  if (!window.MullusiHomepageRegistry) {
    throw new Error("Homepage registry module is unavailable.");
  }
  return window.MullusiHomepageRegistry;
}

async function loadRegistry() {
  return homepageRegistryModule().loadRegistry();
}

async function loadSiteContent() {
  return homepageRegistryModule().loadSiteContent();
}

async function loadNews() {
  return homepageRegistryModule().loadNews();
}

function homepageControllerContext() {
  return {
    bindSearch,
    escapeHtml,
    i18nText,
    loadNews,
    loadRegistry,
    loadSiteContent,
    pageRuntime,
    preferenceContext,
    preferenceRuntime,
    qs,
    renderApiContracts,
    renderBoundaryMap,
    renderEvaluationExample,
    renderFilters,
    renderFlowDiagram,
    renderFutureDomains,
    renderInterfaceLinks,
    renderMetrics,
    renderMulluActivity,
    renderNews,
    renderNewsLoadError,
    renderPlatformBuildSequence,
    renderPlatformLayers,
    renderProductQuestions,
    renderProductRegistry,
    renderProductRegistryControls,
    renderProofLanes,
    renderReleaseMachine,
    renderReleaseStages,
    renderRepoGrid,
    renderRepositoryHandoff,
    renderRequestFlow,
    renderServices,
    renderServiceTiers,
    renderSnapshot,
    renderStats,
    renderStatusBoard,
    renderUseCases,
    renderVisitMeter,
    revealRendered,
    state,
  };
}

substrateRuntime.initSubstrate({ qs });
homepageController.initContent(homepageControllerContext());
