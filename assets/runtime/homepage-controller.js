/*
Purpose: coordinate Mullusi homepage lifecycle loading and render sequencing.
Governance scope: runtime binding order, visit counter update, i18n application, site/news/registry loading, visible error rendering, and fallback recovery.
Dependencies: assets/runtime/page-runtime.js, assets/runtime/preference-runtime.js, homepage registry loaders, renderer adapter callbacks, browser localStorage, and DOM APIs.
Invariants: load failures are visible, fallback promotion is explicit, public records render only after their source state exists, and language changes rerender all localized dynamic surfaces.
*/

(() => {
  const visitStorageKey = "mullusi-visits";
  const registryFallbackSelectors = [
    "[data-platform-layers]",
    "[data-request-flow]",
    "[data-platform-build-sequence]",
    "[data-product-questions]",
    "[data-proof-lanes]",
    "[data-interface-links]",
    "[data-release-stages]",
    "[data-future-domains]",
    "[data-product-registry-controls]",
    "[data-product-registry]",
    "[data-mullu-activity]",
  ];

  const siteFailureSelectors = [
    "[data-proof-lanes]",
    "[data-interface-links]",
    "[data-platform-layers]",
    "[data-request-flow]",
    "[data-platform-build-sequence]",
    "[data-product-questions]",
    "[data-service-grid]",
    "[data-service-tiers]",
    "[data-api-contracts]",
    "[data-flow-diagram]",
    "[data-evaluation-example]",
    "[data-system-status]",
    "[data-use-cases]",
    "[data-mullu-activity]",
    "[data-release-stages]",
    "[data-repository-handoff]",
    "[data-boundary-map]",
    "[data-release-machine]",
    "[data-metrics]",
  ];

  const siteRestoreSelectors = [
    "[data-platform-layers]",
    "[data-request-flow]",
    "[data-platform-build-sequence]",
    "[data-product-questions]",
    "[data-proof-lanes]",
    "[data-interface-links]",
    "[data-mullu-activity]",
    "[data-release-stages]",
  ];

  const registryFailureSelectors = [
    "[data-future-domains]",
    "[data-product-registry-controls]",
    "[data-product-registry]",
    "[data-repo-stats]",
    "[data-metrics]",
  ];

  const registryRestoreSelectors = [
    "[data-future-domains]",
    "[data-product-registry-controls]",
    "[data-product-registry]",
  ];

  function callRequired(context, name, ...args) {
    const action = context[name];
    if (typeof action !== "function") {
      throw new Error(`Homepage controller dependency missing: ${name}`);
    }
    return action(...args);
  }

  function bumpVisits(storageKey = visitStorageKey) {
    try {
      const raw = parseInt(localStorage.getItem(storageKey) || "0", 10);
      const next = (Number.isFinite(raw) && raw > 0 ? raw : 0) + 1;
      localStorage.setItem(storageKey, String(next));
      return next;
    } catch (error) {
      console.warn(error);
      return 1;
    }
  }

  function renderSiteContent(context) {
    if (!context.state.siteContent) return;
    callRequired(context, "renderPlatformLayers");
    callRequired(context, "renderRequestFlow");
    callRequired(context, "renderPlatformBuildSequence");
    callRequired(context, "renderProductQuestions");
    callRequired(context, "renderProofLanes");
    callRequired(context, "renderInterfaceLinks");
    callRequired(context, "renderServices");
    callRequired(context, "renderServiceTiers");
    callRequired(context, "renderApiContracts");
    callRequired(context, "renderEvaluationExample");
    callRequired(context, "renderStatusBoard");
    callRequired(context, "renderUseCases");
    callRequired(context, "renderMulluActivity");
    callRequired(context, "renderReleaseStages");
    callRequired(context, "renderRepositoryHandoff");
    callRequired(context, "renderFlowDiagram");
    callRequired(context, "renderBoundaryMap");
    callRequired(context, "renderReleaseMachine");
    callRequired(context, "renderMetrics");
  }

  function renderRegistryContent(context) {
    if (!context.state.registry) return;
    callRequired(context, "renderSnapshot");
    callRequired(context, "renderFutureDomains");
    callRequired(context, "renderProductRegistryControls");
    callRequired(context, "renderProductRegistry");
    callRequired(context, "renderFilters");
    callRequired(context, "renderStats");
    callRequired(context, "renderRepoGrid");
    callRequired(context, "renderMetrics");
  }

  function renderRegistryLoadError(context) {
    const repoGrid = context.qs("[data-repo-grid]");
    if (!repoGrid) return;
    repoGrid.innerHTML = `
      <article class="repo-card error-card">
        <div class="repo-card-head"><h3>${context.escapeHtml(context.i18nText("repo.errorTitle") || "Product registry unavailable")}</h3></div>
        <p>${context.escapeHtml(context.i18nText("repo.errorBody") || "The static product registry did not load. Confirm the registry is deployed beside this page.")}</p>
      </article>
    `;
    context.revealRendered(repoGrid);
  }

  async function initContent(context) {
    const {
      pageRuntime,
      preferenceContext,
      preferenceRuntime,
      state,
    } = context;

    pageRuntime.bindHeader();
    pageRuntime.bindLinkNavigation();
    pageRuntime.bindMenu({ i18nText: context.i18nText });
    preferenceRuntime.bindThemeToggle(preferenceContext);
    pageRuntime.bindReveal();
    callRequired(context, "bindSearch");
    preferenceRuntime.bindLangToggle(preferenceContext);
    state.visits = bumpVisits();

    try {
      state.i18n = await preferenceRuntime.loadI18n();
    } catch (error) {
      console.error(error);
    }
    preferenceRuntime.applyLang(preferenceRuntime.preferredLang(), preferenceContext, false);
    const registryFallbacks = pageRuntime.captureFallbackContent(registryFallbackSelectors);
    callRequired(context, "renderVisitMeter");

    window.addEventListener("mullusi-lang-change", () => {
      renderSiteContent(context);
      renderRegistryContent(context);
      callRequired(context, "renderNews");
      callRequired(context, "renderVisitMeter");
    });

    try {
      state.siteContent = await callRequired(context, "loadSiteContent");
      renderSiteContent(context);
      callRequired(context, "renderVisitMeter");
    } catch (error) {
      console.error(error);
      pageRuntime.promoteNoscriptFallbacks(siteFailureSelectors);
      pageRuntime.restoreFallbackContent(registryFallbacks, siteRestoreSelectors);
    }

    try {
      state.news = await callRequired(context, "loadNews");
      callRequired(context, "renderNews");
      callRequired(context, "renderVisitMeter");
    } catch (error) {
      console.error(error);
      callRequired(context, "renderNewsLoadError");
    }

    try {
      state.registry = await callRequired(context, "loadRegistry");
      renderRegistryContent(context);
    } catch (error) {
      console.error(error);
      renderRegistryLoadError(context);
      pageRuntime.promoteNoscriptFallbacks(registryFailureSelectors);
      pageRuntime.restoreFallbackContent(registryFallbacks, registryRestoreSelectors);
    }
  }

  window.MullusiHomepageController = Object.freeze({
    bumpVisits,
    initContent,
    renderRegistryContent,
    renderSiteContent,
  });
})();
