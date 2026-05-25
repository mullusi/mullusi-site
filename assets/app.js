/*
Purpose: render Mullusi structured public content and operate the symbolic canvas substrate.
Governance scope: deterministic JSON rendering, safe link output, searchable public surface catalog, manifest-owned homepage product registry, and visual substrate runtime.
Dependencies: assets/registry/homepage-registry.js, assets/render/site-content.js, assets/render/public-surface-registry.js, assets/render/product-registry.js, assets/render/news-activity.js, DOM canvas APIs, IntersectionObserver, and browser fetch.
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

const fallbackLanguageNames = { en: "English", am: "አማርኛ" };

const qs = (selector, root = document) => root.querySelector(selector);
const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const themeStorageKey = "mullusi-theme";
const langStorageKey = "mullusi-lang";
const visitStorageKey = "mullusi-visits";

function normalizeLang(value) {
  return value === "am" ? "am" : "en";
}

function storedLang() {
  try {
    return localStorage.getItem(langStorageKey);
  } catch (error) {
    console.warn(error);
    return null;
  }
}

function preferredLang() {
  const stored = storedLang();
  if (stored === "am" || stored === "en") return stored;
  const navLang = (navigator.language || "").toLowerCase();
  return navLang.startsWith("am") ? "am" : "en";
}

function persistLang(lang) {
  try {
    localStorage.setItem(langStorageKey, lang);
  } catch (error) {
    console.warn(error);
  }
}

function i18nText(key) {
  const entry = state.i18n?.strings?.[key];
  if (!entry) return null;
  const value = entry[state.lang];
  if (typeof value === "string" && value.length > 0) return value;
  return typeof entry.en === "string" ? entry.en : null;
}

function languageName(lang) {
  return state.i18n?.languageNames?.[lang] || fallbackLanguageNames[lang] || lang;
}

function localized(record, field) {
  if (
    state.lang === "am" &&
    record &&
    record.am &&
    typeof record.am[field] === "string" &&
    record.am[field].trim().length > 0
  ) {
    return record.am[field];
  }
  return record ? record[field] : "";
}

function applyLang(lang, persist = true) {
  const normalized = normalizeLang(lang);
  state.lang = normalized;
  document.documentElement.lang = normalized;
  document.documentElement.dataset.lang = normalized;
  if (persist) persistLang(normalized);

  qsa("[data-i18n]").forEach((node) => {
    const text = i18nText(node.dataset.i18n);
    if (text !== null) node.textContent = text;
  });

  qsa("[data-i18n-attr]").forEach((node) => {
    node.dataset.i18nAttr.split(";").forEach((pair) => {
      const [attr, key] = pair.split(":").map((part) => part && part.trim());
      if (!attr || !key) return;
      const text = i18nText(key);
      if (text !== null) node.setAttribute(attr, text);
    });
  });

  const otherLang = normalized === "am" ? "en" : "am";
  qsa("[data-lang-toggle]").forEach((toggle) => {
    toggle.setAttribute("aria-label", i18nText("lang.toggleAria") || "Switch language");
    toggle.setAttribute("aria-pressed", String(normalized === "am"));
    const label = toggle.querySelector("[data-lang-label]");
    if (label) {
      label.textContent = languageName(otherLang);
      label.setAttribute("lang", otherLang);
    }
  });

  const activeTheme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
  applyTheme(activeTheme, false);

  window.dispatchEvent(new CustomEvent("mullusi-lang-change", { detail: { lang: normalized } }));
}

function bindLangToggle() {
  qsa("[data-lang-toggle]").forEach((toggle) => {
    toggle.addEventListener("click", () => {
      applyLang(state.lang === "am" ? "en" : "am");
    });
  });
}

async function loadI18n() {
  const response = await fetch("data/i18n.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`i18n load failed: ${response.status}`);
  return response.json();
}

function storedTheme() {
  try {
    return localStorage.getItem(themeStorageKey);
  } catch (error) {
    console.warn(error);
    return null;
  }
}

function preferredTheme() {
  const stored = storedTheme();
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function persistTheme(theme) {
  try {
    localStorage.setItem(themeStorageKey, theme);
  } catch (error) {
    console.warn(error);
  }
}

function applyTheme(theme, persist = true) {
  const normalizedTheme = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = normalizedTheme;
  if (persist) persistTheme(normalizedTheme);

  const themeMeta = qs('meta[name="theme-color"]');
  if (themeMeta) themeMeta.setAttribute("content", normalizedTheme === "light" ? "#f7f8fb" : "#050609");

  qsa("[data-theme-toggle]").forEach((toggle) => {
    const nextTheme = normalizedTheme === "light" ? "dark" : "light";
    const ariaKey = nextTheme === "light" ? "theme.toLightAria" : "theme.toDarkAria";
    toggle.setAttribute("aria-label", i18nText(ariaKey) || `Switch to ${nextTheme} mode`);
    toggle.setAttribute("aria-pressed", String(normalizedTheme === "light"));
  });

  qsa("[data-theme-label]").forEach((label) => {
    label.textContent = normalizedTheme === "light"
      ? (i18nText("theme.dark") || "Dark")
      : (i18nText("theme.light") || "Light");
  });

  window.dispatchEvent(new CustomEvent("mullusi-theme-change", { detail: { theme: normalizedTheme } }));
}

function bindThemeToggle() {
  applyTheme(preferredTheme(), false);

  qsa("[data-theme-toggle]").forEach((toggle) => {
    toggle.addEventListener("click", () => {
      const activeTheme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
      applyTheme(activeTheme === "light" ? "dark" : "light");
    });
  });

  window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", (event) => {
    if (storedTheme()) return;
    applyTheme(event.matches ? "light" : "dark", false);
  });
}

function revealRendered(target) {
  prepareLinks(target || document);
  const revealTarget = target?.classList?.contains("reveal") ? target : target?.closest?.(".reveal");
  if (revealTarget) revealTarget.classList.add("in");
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

function bumpVisits() {
  try {
    const raw = parseInt(localStorage.getItem(visitStorageKey) || "0", 10);
    const next = (Number.isFinite(raw) && raw > 0 ? raw : 0) + 1;
    localStorage.setItem(visitStorageKey, String(next));
    return next;
  } catch (error) {
    console.warn(error);
    return 1;
  }
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

function bindHeader() {
  const header = qs("[data-elevate]");
  if (!header) return;
  const update = () => header.classList.toggle("is-elevated", window.scrollY > 12);
  update();
  window.addEventListener("scroll", update, { passive: true });
}

function prepareLinks(root = document) {
  qsa('a[href^="https://"]', root).forEach((link) => {
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noopener noreferrer");
  });
}

function bindLinkNavigation() {
  prepareLinks();

  document.addEventListener("click", (event) => {
    const link = event.target.closest?.("a[href]");
    if (!link) return;

    const href = link.getAttribute("href") || "";
    if (/^https:\/\//.test(href)) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      const openedWindow = window.open(href, "_blank");
      if (openedWindow) {
        openedWindow.opener = null;
        return;
      }
      window.location.assign(href);
      return;
    }

    if (!href.startsWith("#") || href.length <= 1) return;

    const target = document.getElementById(href.slice(1));
    if (!target) return;

    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    history.pushState(null, "", href);
  });
}

function bindMenu() {
  const toggle = qs("[data-menu-toggle]");
  const menu = qs("[data-mobile-menu]");
  if (!toggle || !menu) return;

  const setOpen = (open) => {
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute(
      "aria-label",
      open
        ? (i18nText("nav.menuClose") || "Close menu")
        : (i18nText("nav.menuOpen") || "Open menu")
    );
    menu.hidden = !open;
    document.documentElement.classList.toggle("menu-open", open);
  };

  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    setOpen(open);
  });

  qsa("a", menu).forEach((link) => {
    link.addEventListener("click", () => setOpen(false));
  });

  document.addEventListener("click", (event) => {
    if (menu.hidden || menu.contains(event.target) || toggle.contains(event.target)) return;
    setOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setOpen(false);
  });
}

function bindReveal() {
  const items = qsa(".reveal");
  if (!items.length) return;

  if (!("IntersectionObserver" in window)) {
    items.forEach((item) => item.classList.add("in"));
    return;
  }

  const isInViewport = (item) => {
    const rect = item.getBoundingClientRect();
    return rect.top < window.innerHeight * 0.92 && rect.bottom > 0;
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in");
        observer.unobserve(entry.target);
      }
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.1 });

  items.forEach((item) => {
    if (isInViewport(item)) {
      item.classList.add("in");
      return;
    }
    observer.observe(item);
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  const text = String(value ?? "");
  if (
    !/^https:\/\//.test(text) &&
    !/^mailto:/.test(text) &&
    !/^\/[A-Za-z0-9/_-]*\/?$/.test(text) &&
    !/^#[A-Za-z][A-Za-z0-9_-]*$/.test(text)
  ) {
    return "#";
  }
  return escapeHtml(text);
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

function renderSiteContent() {
  if (!state.siteContent) return;
  renderPlatformLayers();
  renderRequestFlow();
  renderPlatformBuildSequence();
  renderProductQuestions();
  renderProofLanes();
  renderInterfaceLinks();
  renderServices();
  renderServiceTiers();
  renderApiContracts();
  renderEvaluationExample();
  renderStatusBoard();
  renderUseCases();
  renderMulluActivity();
  renderReleaseStages();
  renderRepositoryHandoff();
  renderFlowDiagram();
  renderBoundaryMap();
  renderReleaseMachine();
  renderMetrics();
}

function renderRegistryContent() {
  if (!state.registry) return;
  renderSnapshot();
  renderFutureDomains();
  renderProductRegistryControls();
  renderProductRegistry();
  renderFilters();
  renderStats();
  renderRepoGrid();
  renderMetrics();
}

function captureFallbackContent(selectors) {
  const fallbacks = new Map();
  selectors.forEach((selector) => {
    const target = qs(selector);
    if (!target) return;
    fallbacks.set(selector, target.innerHTML);
  });
  return fallbacks;
}

function promoteNoscriptFallbacks(selectors) {
  selectors.forEach((selector) => {
    const target = qs(selector);
    const fallback = target?.querySelector("noscript");
    if (!target || !fallback) return;

    const template = document.createElement("template");
    template.innerHTML = fallback.textContent.trim();
    target.replaceChildren(template.content.cloneNode(true));
    revealRendered(target);
  });
}

function restoreFallbackContent(fallbacks, selectors) {
  selectors.forEach((selector) => {
    const target = qs(selector);
    const fallback = fallbacks.get(selector);
    if (!target || !fallback || target.children.length > 0) return;
    target.innerHTML = fallback;
    revealRendered(target);
  });
}

async function initContent() {
  bindHeader();
  bindLinkNavigation();
  bindMenu();
  bindThemeToggle();
  bindReveal();
  bindSearch();
  bindLangToggle();
  state.visits = bumpVisits();

  try {
    state.i18n = await loadI18n();
  } catch (error) {
    console.error(error);
  }
  applyLang(preferredLang(), false);
  const registryFallbacks = captureFallbackContent(["[data-platform-layers]", "[data-request-flow]", "[data-platform-build-sequence]", "[data-product-questions]", "[data-proof-lanes]", "[data-interface-links]", "[data-release-stages]", "[data-future-domains]", "[data-product-registry-controls]", "[data-product-registry]", "[data-mullu-activity]"]);
  renderVisitMeter();

  window.addEventListener("mullusi-lang-change", () => {
    renderSiteContent();
    renderRegistryContent();
    renderNews();
    renderVisitMeter();
  });

  try {
    state.siteContent = await loadSiteContent();
    renderSiteContent();
    renderVisitMeter();
  } catch (error) {
    console.error(error);
    promoteNoscriptFallbacks([
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
    ]);
    restoreFallbackContent(registryFallbacks, ["[data-platform-layers]", "[data-request-flow]", "[data-platform-build-sequence]", "[data-product-questions]", "[data-proof-lanes]", "[data-interface-links]", "[data-mullu-activity]", "[data-release-stages]"]);
  }

  try {
    state.news = await loadNews();
    renderNews();
    renderVisitMeter();
  } catch (error) {
    console.error(error);
    renderNewsLoadError();
  }

  try {
    state.registry = await loadRegistry();
    renderRegistryContent();
  } catch (error) {
    console.error(error);
    const repoGrid = qs("[data-repo-grid]");
    if (repoGrid) {
      repoGrid.innerHTML = `
        <article class="repo-card error-card">
          <div class="repo-card-head"><h3>${escapeHtml(i18nText("repo.errorTitle") || "Product registry unavailable")}</h3></div>
          <p>${escapeHtml(i18nText("repo.errorBody") || "The static product registry did not load. Confirm the registry is deployed beside this page.")}</p>
        </article>
      `;
      revealRendered(repoGrid);
    }
    promoteNoscriptFallbacks([
      "[data-future-domains]",
      "[data-product-registry-controls]",
      "[data-product-registry]",
      "[data-repo-stats]",
      "[data-metrics]",
    ]);
    restoreFallbackContent(registryFallbacks, ["[data-future-domains]", "[data-product-registry-controls]", "[data-product-registry]"]);
  }
}

function initSubstrate() {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const lat = qs("#c-lattice");
  const wav = qs("#c-wave");
  const chn = qs("#c-chain");
  if (!lat || !wav || !chn) return;

  const lx = lat.getContext("2d");
  const wx = wav.getContext("2d");
  const cx = chn.getContext("2d");
  const readout = qs("#resonance-readout");
  if (!lx || !wx || !cx) return;

  let width = 0;
  let height = 0;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cellSize = 68;
  let cols = 0;
  let rows = 0;
  let energy = new Float32Array(0);
  let particles = [];
  let waves = [];
  let randomState = 0x6d756c6c;
  const fidels = ["ሙ", "ሉ", "ሊ", "ሰ", "መ", "ለ", "ኡ", "ኢ", "ኣ", "ፊ", "ደ", "ል"];

  const zones = [
    {
      id: "Σ",
      at: 0,
      rgb: [92, 230, 196],
      node: [60, 68, 92],
      pRate: 1,
      pSpeed: 1,
      pMax: 4,
      waveMax: 3.4,
      waveOn: 1,
      mesh: 0,
      trail: 0,
      decay: 0.965,
      drift: 0,
      latAlpha: 1,
    },
    {
      id: "Λ",
      at: 0.5,
      rgb: [232, 177, 92],
      node: [86, 78, 58],
      pRate: 0.45,
      pSpeed: 0.55,
      pMax: 3,
      waveMax: 2.8,
      waveOn: 0.7,
      mesh: 1,
      trail: 0,
      decay: 0.95,
      drift: 0,
      latAlpha: 1,
    },
    {
      id: "H",
      at: 1,
      rgb: [122, 165, 232],
      node: [52, 60, 90],
      pRate: 0.5,
      pSpeed: 0.4,
      pMax: 4,
      waveMax: 2.4,
      waveOn: 0.15,
      mesh: 0.2,
      trail: 0.9,
      decay: 0.985,
      drift: 1,
      latAlpha: 0.55,
    },
  ];

  const zone = {
    id: "Σ",
    rgb: [92, 230, 196],
    node: [60, 68, 92],
    pRate: 1,
    pSpeed: 1,
    pMax: 4,
    waveMax: 3.4,
    waveOn: 1,
    mesh: 0,
    trail: 0,
    decay: 0.965,
    drift: 0,
    latAlpha: 1,
  };

  const themePalettes = {
    dark: [
      { rgb: [92, 230, 196], node: [60, 68, 92] },
      { rgb: [232, 177, 92], node: [86, 78, 58] },
      { rgb: [122, 165, 232], node: [52, 60, 90] },
    ],
    light: [
      { rgb: [20, 124, 111], node: [128, 139, 152] },
      { rgb: [154, 100, 27], node: [150, 136, 112] },
      { rgb: [76, 100, 150], node: [118, 128, 148] },
    ],
  };

  let activeSubstrateTheme = "";

  function applySubstrateTheme() {
    const theme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    if (theme === activeSubstrateTheme) return;
    activeSubstrateTheme = theme;
    themePalettes[theme].forEach((palette, index) => {
      zones[index].rgb = [...palette.rgb];
      zones[index].node = [...palette.node];
    });
  }

  const ease = (value) => value * value * value * (value * (value * 6 - 15) + 10);
  const accent = (alpha) => `rgba(${zone.rgb[0] | 0},${zone.rgb[1] | 0},${zone.rgb[2] | 0},${alpha})`;
  const nodeColor = (alpha) => `rgba(${zone.node[0] | 0},${zone.node[1] | 0},${zone.node[2] | 0},${alpha})`;

  let scrollFrac = 0;
  let scrollTarget = 0;
  let frame = 0;
  let sigma = 0;
  let perfTier = 0;
  let lastTime = performance.now();
  let slowStreak = 0;
  let fastStreak = 0;
  let throttleSkip = false;
  let staticDrawn = false;
  let motionLastTime = performance.now();

  function readScroll() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    scrollTarget = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
  }

  function frameFactor(timestamp) {
    const elapsed = timestamp - motionLastTime;
    motionLastTime = timestamp;
    if (!Number.isFinite(elapsed) || elapsed <= 0) return 1;
    return Math.min(2.25, Math.max(0.35, elapsed / 16.667));
  }

  function easeFrame(base, factor) {
    return 1 - Math.pow(1 - base, factor);
  }

  function updateZone(deltaFactor) {
    scrollFrac += (scrollTarget - scrollFrac) * easeFrame(0.06, deltaFactor);
    const fraction = scrollFrac;
    let lowerIndex = 0;
    while (lowerIndex < zones.length - 2 && fraction > zones[lowerIndex + 1].at) {
      lowerIndex += 1;
    }
    const lower = zones[lowerIndex];
    const upper = zones[lowerIndex + 1];
    const span = upper.at - lower.at;
    const local = span > 0 ? (fraction - lower.at) / span : 0;
    const k = ease(Math.min(1, Math.max(0, local)));
    const mix = (a, b) => a + (b - a) * k;

    for (let index = 0; index < 3; index += 1) {
      zone.rgb[index] = mix(lower.rgb[index], upper.rgb[index]);
      zone.node[index] = mix(lower.node[index], upper.node[index]);
    }

    zone.pRate = mix(lower.pRate, upper.pRate);
    zone.pSpeed = mix(lower.pSpeed, upper.pSpeed);
    zone.pMax = mix(lower.pMax, upper.pMax);
    zone.waveMax = mix(lower.waveMax, upper.waveMax);
    zone.waveOn = mix(lower.waveOn, upper.waveOn);
    zone.mesh = mix(lower.mesh, upper.mesh);
    zone.trail = mix(lower.trail, upper.trail);
    zone.decay = mix(lower.decay, upper.decay);
    zone.drift = mix(lower.drift, upper.drift);
    zone.latAlpha = mix(lower.latAlpha, upper.latAlpha);
    zone.id = k < 0.5 ? lower.id : upper.id;
  }

  function zoneIntensity(center) {
    const distance = Math.abs(scrollFrac - center);
    return Math.max(0, Math.min(1, 1 - distance / 0.48));
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    [lat, wav, chn].forEach((canvas) => {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
    });
    cols = Math.ceil(width / cellSize) + 1;
    rows = Math.ceil(height / cellSize) + 1;
    energy = new Float32Array(cols * rows);
  }

  function randomUnit() {
    randomState = (randomState * 1664525 + 1013904223) >>> 0;
    return randomState / 4294967296;
  }

  function spawnParticle() {
    const lane = Math.floor(randomUnit() * rows);
    particles.push({
      x: randomUnit() * Math.max(width, 1),
      y: randomUnit() * Math.max(height, 1),
      vx: (randomUnit() - 0.5) * 0.18,
      vy: (randomUnit() - 0.5) * 0.12,
      lane,
      phase: randomUnit() * Math.PI * 2,
      radius: 64 + randomUnit() * 120,
      pulse: randomUnit() * 320,
      pulseEvery: 320 + randomUnit() * 360,
      sides: 4 + Math.floor(randomUnit() * 4),
      spin: (0.002 + randomUnit() * 0.004) * (randomUnit() > 0.5 ? 1 : -1),
    });
  }

  function wrapFieldObject(fieldObject) {
    const pad = fieldObject.radius + 40;
    if (fieldObject.x < -pad) fieldObject.x = width + pad;
    if (fieldObject.x > width + pad) fieldObject.x = -pad;
    if (fieldObject.y < -pad) fieldObject.y = height + pad;
    if (fieldObject.y > height + pad) fieldObject.y = -pad;
  }

  function feedEnergyAt(x, y, amount) {
    const col = Math.floor(x / cellSize);
    const row = Math.floor(y / cellSize);
    if (col < 0 || col >= cols || row < 0 || row >= rows) return;
    const index = row * cols + col;
    energy[index] = Math.min(1, energy[index] + amount);
  }

  function drawSmoke(fieldObject, alphaScale, time) {
    if (alphaScale <= 0.01) return;
    const radius = fieldObject.radius * (0.82 + Math.sin(fieldObject.phase + time * 0.25) * 0.08);
    const x = fieldObject.x + Math.sin(fieldObject.phase * 0.7) * 18;
    const y = fieldObject.y + Math.cos(fieldObject.phase * 0.9) * 14;
    const gradient = cx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, accent((0.038 * alphaScale).toFixed(3)));
    gradient.addColorStop(0.52, accent((0.017 * alphaScale).toFixed(3)));
    gradient.addColorStop(1, accent(0));

    cx.save();
    cx.globalCompositeOperation = "lighter";
    cx.filter = "blur(10px)";
    cx.fillStyle = gradient;
    cx.beginPath();
    cx.ellipse(
      x,
      y,
      radius * 1.45,
      radius * 0.42,
      fieldObject.phase * 0.35,
      0,
      Math.PI * 2,
    );
    cx.fill();
    cx.restore();
  }

  function drawMorph(fieldObject, alphaScale, time) {
    if (alphaScale <= 0.01) return;
    const size = fieldObject.radius * 0.36;
    const sides = fieldObject.sides;
    const basePhase = fieldObject.phase + time * fieldObject.spin * 60;

    cx.save();
    cx.globalCompositeOperation = "lighter";
    cx.lineWidth = 1;
    cx.strokeStyle = accent((0.075 * alphaScale).toFixed(3));
    cx.fillStyle = accent((0.015 * alphaScale).toFixed(3));
    cx.beginPath();
    for (let index = 0; index < sides; index += 1) {
      const angle = basePhase + index * Math.PI * 2 / sides;
      const radius = size * (0.82 + Math.sin(basePhase * 0.9 + index * 1.7) * 0.24);
      const x = fieldObject.x + Math.cos(angle) * radius;
      const y = fieldObject.y + Math.sin(angle) * radius;
      if (index === 0) cx.moveTo(x, y);
      else cx.lineTo(x, y);
    }
    cx.closePath();
    cx.fill();
    cx.stroke();
    cx.restore();
  }

  function drawWaveBands(alphaScale, time) {
    if (alphaScale <= 0.01) return;
    wx.save();
    wx.globalCompositeOperation = "lighter";
    wx.lineWidth = 1;
    for (let band = 0; band < 2; band += 1) {
      const baseY = height * (0.3 + band * 0.24);
      const amplitude = 13 + band * 8;
      wx.strokeStyle = accent((0.026 * alphaScale * (1 - band * 0.12)).toFixed(3));
      wx.beginPath();
      for (let x = -24; x <= width + 24; x += 32) {
        const y = baseY
          + Math.sin(x * 0.008 + time * (0.18 + band * 0.04) + band * 1.7) * amplitude
          + Math.sin(x * 0.017 - time * 0.13) * 5;
        if (x === -24) wx.moveTo(x, y);
        else wx.lineTo(x, y);
      }
      wx.stroke();
    }
    wx.restore();
  }

  function drawStatic() {
    lx.clearRect(0, 0, width, height);
    wx.clearRect(0, 0, width, height);
    cx.clearRect(0, 0, width, height);
    for (let row = 0; row < rows; row += 2) {
      for (let col = 0; col < cols; col += 2) {
        lx.fillStyle = "rgba(60,68,92,.24)";
        lx.fillRect(col * cellSize - 0.5, row * cellSize - 0.5, 1, 1);
      }
    }
    if (readout) readout.textContent = "Σ 0.000";
  }

  function governPerf(now) {
    let delta = now - lastTime;
    lastTime = now;
    if (frame < 30) return;
    if (delta > 80) delta = 80;
    if (delta > 34) {
      slowStreak += 1;
      fastStreak = 0;
      if (perfTier === 0 && slowStreak > 36) {
        perfTier = 1;
        slowStreak = 0;
      } else if (perfTier === 1 && slowStreak > 80) {
        perfTier = 2;
        slowStreak = 0;
      }
      return;
    }

    fastStreak += 1;
    slowStreak = 0;
    if (perfTier === 1 && fastStreak > 260) {
      perfTier = 0;
      fastStreak = 0;
    }
  }

  function governStatic(renderCost) {
    if (renderCost < 22) {
      fastStreak += 1;
      if (fastStreak > 12) {
        perfTier = 1;
        fastStreak = 0;
        slowStreak = 0;
      }
      return;
    }
    fastStreak = 0;
  }

  function drawFrame(timestamp = performance.now()) {
    frame += 1;
    const renderStart = performance.now();
    const deltaFactor = frameFactor(timestamp);
    applySubstrateTheme();
    updateZone(deltaFactor);
    const time = timestamp * 0.001;
    const smokeWeight = zoneIntensity(0);
    const waveWeight = zoneIntensity(0.5);
    const morphWeight = zoneIntensity(1);

    const energyDecay = Math.pow(zone.decay, deltaFactor);
    for (let index = 0; index < energy.length; index += 1) {
      energy[index] *= energyDecay;
    }

    cx.globalCompositeOperation = "destination-out";
    cx.fillStyle = `rgba(0,0,0,${(0.045 + waveWeight * 0.035 + smokeWeight * 0.02).toFixed(3)})`;
    cx.fillRect(0, 0, width, height);
    cx.globalCompositeOperation = "source-over";

    const cap = Math.round(4 + smokeWeight * 2 + waveWeight * 1 + morphWeight * 2);
    while (particles.length < cap) {
      spawnParticle();
    }
    if (particles.length > cap + 4) particles.length = cap + 4;

    cx.lineCap = "round";
    cx.lineJoin = "round";
    for (const particle of particles) {
      particle.phase += (0.006 + morphWeight * 0.004) * deltaFactor;
      particle.x += (particle.vx + Math.sin(particle.phase * 0.37) * 0.035) * deltaFactor * (1 + smokeWeight * 0.7);
      particle.y += (particle.vy + Math.cos(particle.phase * 0.31) * 0.028) * deltaFactor * (1 + morphWeight * 0.55);
      wrapFieldObject(particle);

      particle.pulse += deltaFactor;
      if (particle.pulse >= particle.pulseEvery) {
        particle.pulse = 0;
        if (waves.length > 10) waves.shift();
        waves.push({
          x: particle.x,
          y: particle.y,
          r: 0,
          max: cellSize * zone.waveMax * (0.82 + waveWeight * 0.36),
        });
        feedEnergyAt(particle.x, particle.y, 0.18 + waveWeight * 0.12);
      }

      drawSmoke(particle, smokeWeight * 0.68 + waveWeight * 0.12, time);
      drawMorph(particle, morphWeight * 0.58 + waveWeight * 0.14, time);
    }

    wx.clearRect(0, 0, width, height);
    drawWaveBands(waveWeight * 0.64 + smokeWeight * 0.12, time);
    let totalEnergy = 0;
    let energyCount = 0;

    for (const wave of waves) {
      wave.r += 1.15 * deltaFactor;
      const progress = wave.r / wave.max;
      const alpha = (1 - progress) * 0.3 * zone.waveOn;
      if (alpha <= 0.002) continue;

      wx.strokeStyle = accent(alpha.toFixed(3));
      wx.lineWidth = 1;
      wx.beginPath();
      wx.arc(wave.x, wave.y, wave.r, 0, Math.PI * 2);
      wx.stroke();

      const ringCol = Math.floor(wave.x / cellSize);
      const row = Math.floor(wave.y / cellSize);
      if (row >= 0 && row < rows && ringCol >= 0 && ringCol < cols) {
        const energyIndex = row * cols + ringCol;
        energy[energyIndex] = Math.min(1, energy[energyIndex] + alpha * 0.026);
      }
    }

    waves = waves.filter((wave) => wave.r < wave.max);

    lx.clearRect(0, 0, width, height);
    lx.globalAlpha = zone.latAlpha;

    if (zone.mesh > 0.02) {
      lx.lineWidth = 1;
      for (let row = 0; row < rows; row += 2) {
        for (let col = 0; col < cols; col += 2) {
          const value = energy[row * cols + col];
          if (value < 0.18) continue;
          const x = col * cellSize;
          const y = row * cellSize;
          const rightValue = col + 1 < cols ? energy[row * cols + col + 1] : 0;
          const downValue = row + 1 < rows ? energy[(row + 1) * cols + col] : 0;
          if (rightValue > 0.18) {
            lx.strokeStyle = accent((Math.min(value, rightValue) * 0.22 * zone.mesh).toFixed(3));
            lx.beginPath();
            lx.moveTo(x, y);
            lx.lineTo(x + cellSize, y);
            lx.stroke();
          }
          if (downValue > 0.18) {
            lx.strokeStyle = accent((Math.min(value, downValue) * 0.22 * zone.mesh).toFixed(3));
            lx.beginPath();
            lx.moveTo(x, y);
            lx.lineTo(x, y + cellSize);
            lx.stroke();
          }
        }
      }
    }

    for (let row = 0; row < rows; row += 2) {
      for (let col = 0; col < cols; col += 2) {
        const value = energy[row * cols + col];
        totalEnergy += value;
        energyCount += 1;
        const x = col * cellSize;
        const y = row * cellSize;
        lx.fillStyle = nodeColor((0.12 + value * 0.22).toFixed(3));
        lx.fillRect(x - 0.5, y - 0.5, 1, 1);

        if (value > 0.04) {
          lx.strokeStyle = accent((value * 0.105).toFixed(3));
          lx.lineWidth = 1;
          lx.strokeRect(x + 3, y + 3, cellSize - 6, cellSize - 6);
        }

        if (value > 0.62 && (row * 7 + col) % 5 === 0) {
          lx.fillStyle = accent((value * 0.26).toFixed(3));
          lx.font = '13px "Newsreader", serif';
          lx.fillText(fidels[(row * 3 + col) % fidels.length], x + cellSize / 2 - 6, y + cellSize / 2 + 5);
        }
      }
    }

    lx.globalAlpha = 1;

    const meanEnergy = energyCount ? totalEnergy / energyCount : 0;
    sigma += (meanEnergy - sigma) * easeFrame(0.05, deltaFactor);
    if (readout && frame % 12 === 0) {
      readout.textContent = `${zone.id} ${(sigma * 9).toFixed(3)}`;
    }

    const now = performance.now();
    governPerf(now);
    if (perfTier === 2) {
      if (!staticDrawn) {
        drawStatic();
        staticDrawn = true;
      }
      governStatic(now - renderStart);
      setTimeout(() => requestAnimationFrame(drawFrame), 200);
      return;
    }

    staticDrawn = false;
    if (perfTier === 0) {
      throttleSkip = !throttleSkip;
      if (throttleSkip) {
        setTimeout(() => requestAnimationFrame(drawFrame), 16);
        return;
      }
    }

    if (perfTier === 1) {
      throttleSkip = !throttleSkip;
      if (throttleSkip) {
        setTimeout(() => requestAnimationFrame(drawFrame), 48);
        return;
      }
    }

    requestAnimationFrame(drawFrame);
  }

  resize();
  applySubstrateTheme();
  for (let index = 0; index < 5; index += 1) spawnParticle();
  window.addEventListener("mullusi-theme-change", applySubstrateTheme);
  window.addEventListener("resize", () => {
    resize();
    if (reduce || perfTier === 2) drawStatic();
  });
  window.addEventListener("scroll", readScroll, { passive: true });

  if (reduce) {
    drawStatic();
    return;
  }

  readScroll();
  scrollFrac = scrollTarget;
  requestAnimationFrame(drawFrame);
}

initSubstrate();
initContent();
