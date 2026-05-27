/*
Purpose: coordinate Mullusi homepage lifecycle loading from the declared lifecycle plan.
Governance scope: runtime binding order, visit counter update, i18n application, site/news/registry loading, renderer-owned error handoff, and fallback recovery.
Dependencies: assets/runtime/homepage-lifecycle-plan.js, page/preference runtimes, homepage registry loaders, renderer adapter callbacks, browser localStorage, and DOM APIs.
Invariants: load failures are visible, fallback promotion is explicit, public records render only after their source state exists, and sequencing data lives in the lifecycle plan.
*/

(() => {
  function lifecyclePlan() {
    if (!window.MullusiHomepageLifecyclePlan) {
      throw new Error("Homepage lifecycle plan module is unavailable.");
    }
    return window.MullusiHomepageLifecyclePlan;
  }

  function callRequired(context, name, ...args) {
    const action = context[name];
    if (typeof action !== "function") {
      throw new Error(`Homepage controller dependency missing: ${name}`);
    }
    return action(...args);
  }

  function runActionPlan(context, actionNames) {
    for (const actionName of actionNames) {
      callRequired(context, actionName);
    }
  }

  function bumpVisits(storageKey = lifecyclePlan().visitStorageKey) {
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
    runActionPlan(context, lifecyclePlan().siteRenderActions);
  }

  function renderRegistryContent(context) {
    if (!context.state.registry) return;
    runActionPlan(context, lifecyclePlan().registryRenderActions);
  }

  async function initContent(context) {
    const {
      pageRuntime,
      preferenceContext,
      preferenceRuntime,
      state,
    } = context;
    const plan = lifecyclePlan();

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
    const registryFallbacks = pageRuntime.captureFallbackContent(plan.registryFallbackSelectors);
    callRequired(context, "renderVisitMeter");

    window.addEventListener("mullusi-lang-change", () => {
      renderSiteContent(context);
      renderRegistryContent(context);
      runActionPlan(context, plan.languageChangeActions);
    });

    try {
      state.siteContent = await callRequired(context, "loadSiteContent");
      renderSiteContent(context);
      callRequired(context, "renderVisitMeter");
    } catch (error) {
      console.error(error);
      pageRuntime.promoteNoscriptFallbacks(plan.siteFailureSelectors);
      pageRuntime.restoreFallbackContent(registryFallbacks, plan.siteRestoreSelectors);
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
      callRequired(context, "renderRegistryLoadError");
      pageRuntime.promoteNoscriptFallbacks(plan.registryFailureSelectors);
      pageRuntime.restoreFallbackContent(registryFallbacks, plan.registryRestoreSelectors);
    }
  }

  window.MullusiHomepageController = Object.freeze({
    bumpVisits,
    initContent,
    renderRegistryContent,
    renderSiteContent,
    runActionPlan,
  });
})();
