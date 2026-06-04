/*
Purpose: align initial Mullusi hash routes before deferred homepage modules settle.
Governance scope: public fragment navigation, sticky header offset behavior, and cache-resilient deep-link entry.
Dependencies: browser location, DOMContentLoaded/load events, requestAnimationFrame, and scroll-margin CSS.
Invariants: only valid same-page fragment targets are scrolled, no network access, no content mutation, and retries are bounded.
*/

(() => {
  const maxAttempts = 24;
  const retryDelayMs = 250;
  const initialHash = window.location.hash || "";
  const state = {
    attempts: 0,
    version: "2026.06.fragment.6",
  };
  let activeHash = initialHash;
  let attempts = 0;

  if (window.history && "scrollRestoration" in window.history) {
    window.history.scrollRestoration = "manual";
  }

  window.MullusiFragmentBootstrap = state;

  function queueFrame(callback) {
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(callback);
      return;
    }
    window.setTimeout(callback, 0);
  }

  function alignFragmentTarget() {
    const hash = window.location.hash || activeHash || initialHash;
    if (!/^#[A-Za-z][A-Za-z0-9_-]*$/.test(hash)) return;

    const target = document.getElementById(hash.slice(1));
    if (!target) return;

    target.scrollIntoView({ behavior: "auto", block: "start" });
  }

  function scheduleAlignment() {
    activeHash = window.location.hash || initialHash;
    attempts = 0;
    state.attempts = 0;

    const retry = () => {
      attempts += 1;
      state.attempts = attempts;
      alignFragmentTarget();
      if (attempts < maxAttempts && window.location.hash === activeHash) {
        window.setTimeout(retry, retryDelayMs);
      }
    };

    queueFrame(retry);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleAlignment, { once: true });
  } else {
    scheduleAlignment();
  }

  window.addEventListener("load", scheduleAlignment, { once: true });
  window.addEventListener("pageshow", scheduleAlignment);
  window.addEventListener("hashchange", scheduleAlignment);
})();
