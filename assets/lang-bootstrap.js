/*
Purpose: set the initial Mullusi language surface before first paint.
Governance scope: public language state and browser preference routing.
Dependencies: browser localStorage, navigator.language, and documentElement APIs.
Invariants: no network access, language is bounded to en or am, English fallback on inaccessible storage.
*/

(() => {
  try {
    const storedLanguage = localStorage.getItem("mullusi-lang");
    const navLanguage = (navigator.language || "").toLowerCase();
    const language = storedLanguage || (navLanguage.indexOf("am") === 0 ? "am" : "en");
    const boundedLanguage = language === "am" ? "am" : "en";
    document.documentElement.lang = boundedLanguage;
    document.documentElement.dataset.lang = boundedLanguage;
  } catch (error) {
    document.documentElement.lang = "en";
    document.documentElement.dataset.lang = "en";
  }
})();
