/*
Purpose: set the initial Mullusi color theme before first paint.
Governance scope: public theme state, no-js boundary, and local display preference only.
Dependencies: browser localStorage, matchMedia, and documentElement APIs.
Invariants: no network access, no content mutation beyond html theme/no-js state, dark fallback on inaccessible storage.
*/

(() => {
  const root = document.documentElement;
  root.classList.remove("no-js");

  try {
    const storedTheme = localStorage.getItem("mullusi-theme");
    const systemLight = window.matchMedia("(prefers-color-scheme: light)").matches;
    root.dataset.theme = storedTheme || (systemLight ? "light" : "dark");
  } catch (error) {
    root.dataset.theme = "dark";
  }
})();
