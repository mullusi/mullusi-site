/*
Purpose: bind shared route-local color theme controls for secondary Mullusi pages.
Governance scope: display preference only; no product claim, registry, runtime, or proof state mutation.
Dependencies: theme-bootstrap.js, browser localStorage, matchMedia, data-theme-toggle markup, and meta theme-color.
Invariants: storage failures are non-blocking, aria-pressed mirrors visible theme state, and dark theme remains the fallback.
*/

(() => {
  const themeStorageKey = "mullusi-theme";

  function syncTheme(theme) {
    const root = document.documentElement;
    const toggle = document.querySelector("[data-theme-toggle]");
    const label = toggle && toggle.querySelector("[data-theme-label]");
    const meta = document.querySelector('meta[name="theme-color"]');
    const boundedTheme = theme === "light" ? "light" : "dark";

    root.dataset.theme = boundedTheme;
    if (meta) meta.setAttribute("content", boundedTheme === "light" ? "#f7f8fb" : "#050609");
    if (toggle) toggle.setAttribute("aria-pressed", String(boundedTheme === "light"));
    if (label) label.textContent = boundedTheme === "light" ? "Dark" : "Light";
  }

  function storedTheme() {
    try {
      return localStorage.getItem(themeStorageKey);
    } catch (error) {
      return null;
    }
  }

  function persistTheme(theme) {
    try {
      localStorage.setItem(themeStorageKey, theme);
    } catch (error) {
      // Display preference storage is optional; visible state remains synchronized.
    }
  }

  function preferredTheme() {
    const stored = storedTheme();
    if (stored === "light" || stored === "dark") return stored;
    return document.documentElement.dataset.theme === "light" ? "light" : "dark";
  }

  function bindThemeToggle() {
    const toggle = document.querySelector("[data-theme-toggle]");
    syncTheme(preferredTheme());

    if (toggle) {
      toggle.addEventListener("click", () => {
        const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
        persistTheme(next);
        syncTheme(next);
      });
    }

    try {
      window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", (event) => {
        if (!storedTheme()) syncTheme(event.matches ? "light" : "dark");
      });
    } catch (error) {
      // Older browsers keep the theme selected during initial bootstrap.
    }
  }

  window.MullusiRoutePreferences = Object.freeze({
    bindThemeToggle,
    preferredTheme,
    syncTheme,
  });
})();
