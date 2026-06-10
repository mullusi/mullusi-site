/*
Purpose: provide shared Mullusi homepage DOM, safety, and fallback runtime helpers.
Governance scope: selector access, safe text and URL escaping, external link handling, mobile menu state, reveal activation, and static fallback recovery.
Dependencies: browser DOM APIs, IntersectionObserver, history, and window navigation.
Invariants: untrusted text is escaped, unsafe hrefs collapse to "#", external links are isolated, and fallback promotion is explicit.
*/

(() => {
  const qs = (selector, root = document) => root.querySelector(selector);
  const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

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

  function prepareLinks(root = document) {
    qsa('a[href^="https://"]', root).forEach((link) => {
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener noreferrer");
    });
  }

  function revealRendered(target) {
    prepareLinks(target || document);
    const revealTarget = target?.classList?.contains("reveal") ? target : target?.closest?.(".reveal");
    if (revealTarget) revealTarget.classList.add("in");
  }

  function bindHeader() {
    const header = qs("[data-elevate]");
    if (!header) return;
    const update = () => header.classList.toggle("is-elevated", window.scrollY > 12);
    update();
    window.addEventListener("scroll", update, { passive: true });
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

  function bindSkipLinks() {
    qsa(".skip-link[href^='#']").forEach((link) => {
      link.addEventListener("click", (event) => {
        const href = link.getAttribute("href") || "";
        if (!/^#[A-Za-z][A-Za-z0-9_-]*$/.test(href)) return;

        const target = document.getElementById(href.slice(1));
        if (!target) return;

        event.preventDefault();
        target.scrollIntoView({ behavior: "auto", block: "start" });
        target.focus({ preventScroll: true });
        history.pushState(null, "", href);
      });
    });
  }

  function alignFragmentTarget(options = {}) {
    const hash = window.location.hash || "";
    if (!/^#[A-Za-z][A-Za-z0-9_-]*$/.test(hash)) return false;

    const target = document.getElementById(hash.slice(1));
    if (!target) return false;

    target.scrollIntoView({ behavior: options.behavior || "auto", block: "start" });
    return true;
  }

  function bindInitialFragmentNavigation() {
    if (!window.location.hash) return;

    const align = () => alignFragmentTarget({ behavior: "auto" });
    window.requestAnimationFrame(() => {
      align();
      window.setTimeout(align, 160);
    });
  }

  function bindMenu(context = {}) {
    const toggle = qs("[data-menu-toggle]");
    const menu = qs("[data-mobile-menu]");
    if (!toggle || !menu) return;

    const i18nText = typeof context.i18nText === "function" ? context.i18nText : () => null;
    const setOpen = (open) => {
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute(
        "aria-label",
        open
          ? (i18nText("nav.menuClose") || "Close menu")
          : (i18nText("nav.menuOpen") || "Open menu"),
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

  window.MullusiPageRuntime = Object.freeze({
    bindHeader,
    bindInitialFragmentNavigation,
    bindLinkNavigation,
    bindMenu,
    bindReveal,
    bindSkipLinks,
    captureFallbackContent,
    escapeAttribute,
    escapeHtml,
    prepareLinks,
    promoteNoscriptFallbacks,
    qs,
    qsa,
    restoreFallbackContent,
    alignFragmentTarget,
    revealRendered,
  });
})();
