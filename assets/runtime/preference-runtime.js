/*
Purpose: provide Mullusi homepage language, theme, and i18n preference runtime helpers.
Governance scope: persisted preference reads/writes, language DOM binding, theme DOM binding, and i18n registry loading.
Dependencies: assets/runtime/page-runtime.js, browser localStorage, matchMedia, fetch, and DOM APIs.
Invariants: preference values are normalized, storage failures are surfaced, language writes dispatch one governed event, and theme writes dispatch one governed event.
*/

(() => {
  const fallbackLanguageNames = { en: "English", am: "\u12a0\u121b\u122d\u129b" };
  const themeStorageKey = "mullusi-theme";
  const langStorageKey = "mullusi-lang";

  function pageRuntime() {
    if (!window.MullusiPageRuntime) {
      throw new Error("Page runtime module is unavailable.");
    }
    return window.MullusiPageRuntime;
  }

  function resolveContext(contextSource) {
    return typeof contextSource === "function" ? contextSource() : (contextSource || {});
  }

  function contextLang(context) {
    return typeof context.getLang === "function" ? context.getLang() : "en";
  }

  function contextI18n(context) {
    return typeof context.getI18n === "function" ? context.getI18n() : null;
  }

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

  function i18nText(i18n, lang, key) {
    const normalized = normalizeLang(lang);
    const entry = i18n?.strings?.[key];
    if (!entry) return null;
    const value = entry[normalized];
    if (typeof value === "string" && value.length > 0) return value;
    return typeof entry.en === "string" ? entry.en : null;
  }

  function contextText(context, key) {
    return i18nText(contextI18n(context), contextLang(context), key);
  }

  function languageName(i18n, lang) {
    return i18n?.languageNames?.[lang] || fallbackLanguageNames[lang] || lang;
  }

  function localized(record, field, lang) {
    if (
      normalizeLang(lang) === "am" &&
      record &&
      record.am &&
      typeof record.am[field] === "string" &&
      record.am[field].trim().length > 0
    ) {
      return record.am[field];
    }
    return record ? record[field] : "";
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

  function applyTheme(theme, contextSource = {}, persist = true, dispatch = true) {
    const context = resolveContext(contextSource);
    const { qs, qsa } = pageRuntime();
    const normalizedTheme = theme === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = normalizedTheme;
    if (persist) persistTheme(normalizedTheme);

    const themeMeta = qs('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute("content", normalizedTheme === "light" ? "#f7f8fb" : "#050609");

    qsa("[data-theme-toggle]").forEach((toggle) => {
      const nextTheme = normalizedTheme === "light" ? "dark" : "light";
      const ariaKey = nextTheme === "light" ? "theme.toLightAria" : "theme.toDarkAria";
      toggle.setAttribute("aria-label", contextText(context, ariaKey) || `Switch to ${nextTheme} mode`);
      toggle.setAttribute("aria-pressed", String(normalizedTheme === "light"));
    });

    qsa("[data-theme-label]").forEach((label) => {
      label.textContent = normalizedTheme === "light"
        ? (contextText(context, "theme.dark") || "Dark")
        : (contextText(context, "theme.light") || "Light");
    });

    if (dispatch) {
      window.dispatchEvent(new CustomEvent("mullusi-theme-change", { detail: { theme: normalizedTheme } }));
    }
    return normalizedTheme;
  }

  function applyLang(lang, contextSource = {}, persist = true) {
    const context = resolveContext(contextSource);
    const { qsa } = pageRuntime();
    const normalized = normalizeLang(lang);
    if (typeof context.setLang === "function") context.setLang(normalized);
    document.documentElement.lang = normalized;
    document.documentElement.dataset.lang = normalized;
    if (persist) persistLang(normalized);

    qsa("[data-i18n]").forEach((node) => {
      const text = contextText(context, node.dataset.i18n);
      if (text !== null) node.textContent = text;
    });

    qsa("[data-i18n-attr]").forEach((node) => {
      node.dataset.i18nAttr.split(";").forEach((pair) => {
        const [attr, key] = pair.split(":").map((part) => part && part.trim());
        if (!attr || !key) return;
        const text = contextText(context, key);
        if (text !== null) node.setAttribute(attr, text);
      });
    });

    const otherLang = normalized === "am" ? "en" : "am";
    qsa("[data-lang-toggle]").forEach((toggle) => {
      toggle.setAttribute("aria-label", contextText(context, "lang.toggleAria") || "Switch language");
      toggle.setAttribute("aria-pressed", String(normalized === "am"));
      const label = toggle.querySelector("[data-lang-label]");
      if (label) {
        label.textContent = languageName(contextI18n(context), otherLang);
        label.setAttribute("lang", otherLang);
      }
    });

    const activeTheme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    applyTheme(activeTheme, contextSource, false, false);

    window.dispatchEvent(new CustomEvent("mullusi-lang-change", { detail: { lang: normalized } }));
    return normalized;
  }

  function bindLangToggle(contextSource = {}) {
    const { qsa } = pageRuntime();
    qsa("[data-lang-toggle]").forEach((toggle) => {
      toggle.addEventListener("click", () => {
        const context = resolveContext(contextSource);
        applyLang(contextLang(context) === "am" ? "en" : "am", contextSource);
      });
    });
  }

  function bindThemeToggle(contextSource = {}) {
    const { qsa } = pageRuntime();
    applyTheme(preferredTheme(), contextSource, false);

    qsa("[data-theme-toggle]").forEach((toggle) => {
      toggle.addEventListener("click", () => {
        const activeTheme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
        applyTheme(activeTheme === "light" ? "dark" : "light", contextSource);
      });
    });

    try {
      window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", (event) => {
        if (storedTheme()) return;
        applyTheme(event.matches ? "light" : "dark", contextSource, false);
      });
    } catch (error) {
      // Older browsers without MediaQueryList.addEventListener keep the bound theme.
    }
  }

  async function loadI18n(path = "/data/i18n.json") {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error(`i18n load failed: ${response.status}`);
    return response.json();
  }

  window.MullusiPreferenceRuntime = Object.freeze({
    applyLang,
    applyTheme,
    bindLangToggle,
    bindThemeToggle,
    i18nText,
    languageName,
    loadI18n,
    localized,
    normalizeLang,
    preferredLang,
    preferredTheme,
  });
})();
