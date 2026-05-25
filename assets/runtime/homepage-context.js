/*
Purpose: compose Mullusi homepage runtime state, renderer adapters, and registry loaders.
Governance scope: module dependency binding, renderer context construction, manifest registry loading, and homepage controller dependency projection.
Dependencies: page/preference/substrate/controller runtimes, homepage registry loader, site/product/public-surface/news renderers, and browser fetch through registry loader.
Invariants: app boot owns no rendering logic, renderer modules stay dependency-injected, registry paths stay in the registry loader, and runtime state is episode-local to the homepage instance.
*/

(() => {
  function requireModule(name, value) {
    if (!value) {
      throw new Error(`${name} module is unavailable.`);
    }
    return value;
  }

  function createState() {
    return {
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
  }

  function createHomepageRuntime() {
    const state = createState();
    const pageRuntime = requireModule("Page runtime", window.MullusiPageRuntime);
    const preferenceRuntime = requireModule("Preference runtime", window.MullusiPreferenceRuntime);
    const substrateRuntime = requireModule("Substrate runtime", window.MullusiSubstrateRuntime);
    const homepageController = requireModule("Homepage controller", window.MullusiHomepageController);
    const qs = pageRuntime.qs;
    const qsa = pageRuntime.qsa;
    const escapeHtml = pageRuntime.escapeHtml;
    const escapeAttribute = pageRuntime.escapeAttribute;
    const revealRendered = pageRuntime.revealRendered;

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
      return requireModule("Site content renderer", window.MullusiSiteContentRenderer);
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
      return requireModule("News activity renderer", window.MullusiNewsActivityRenderer);
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
      return requireModule("Public surface registry renderer", window.MullusiPublicSurfaceRegistryRenderer);
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
      return requireModule("Product registry renderer", window.MullusiProductRegistryRenderer);
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
      return requireModule("Homepage registry", window.MullusiHomepageRegistry);
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

    function controllerContext() {
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

    return Object.freeze({
      controllerContext,
      homepageController,
      qs,
      state,
      substrateRuntime,
    });
  }

  window.MullusiHomepageContext = Object.freeze({
    createHomepageRuntime,
    createState,
  });
})();
