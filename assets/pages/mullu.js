/*
Purpose: control the Mullu route theme toggle.
Governance scope: route-local display preference and accessible toggle state.
Dependencies: theme-bootstrap.js, localStorage, matchMedia, and data-theme-toggle markup.
Invariants: no network access, no product claim mutation, aria-pressed mirrors theme state.
*/

(() => {
      const KEY = "mullusi-theme";
      const root = document.documentElement;
      const toggle = document.querySelector("[data-theme-toggle]");
      const label = toggle && toggle.querySelector("[data-theme-label]");
      const meta = document.querySelector('meta[name="theme-color"]');
      const sync = (theme) => {
        root.dataset.theme = theme;
        if (meta) meta.setAttribute("content", theme === "light" ? "#f7f8fb" : "#050609");
        if (toggle) toggle.setAttribute("aria-pressed", String(theme === "light"));
        if (label) label.textContent = theme === "light" ? "Dark" : "Light";
      };
      sync(root.dataset.theme === "light" ? "light" : "dark");
      if (toggle) {
        toggle.addEventListener("click", () => {
          const next = root.dataset.theme === "light" ? "dark" : "light";
          try { localStorage.setItem(KEY, next); } catch (error) { /* storage unavailable */ }
          sync(next);
        });
      }
      try {
        window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", (event) => {
          let stored = null;
          try { stored = localStorage.getItem(KEY); } catch (error) { /* storage unavailable */ }
          if (!stored) sync(event.matches ? "light" : "dark");
        });
      } catch (error) { /* matchMedia listener unsupported */ }
    })();
