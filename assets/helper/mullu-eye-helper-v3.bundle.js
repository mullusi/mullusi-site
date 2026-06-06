/*
Purpose: provide the Mullu Eye Helper click-activated cursor, DOM inspector, and governed action selector.
Governance scope: visible DOM inspection, user-confirmed action execution, risky action confirmation, and password-value exclusion.
Dependencies: browser DOM APIs, optional same-origin helper inspection endpoint.
Invariants: no password values are read, forms are not submitted silently, risky actions require confirmation, and all actions originate from user gestures.
Test contract: run node --check assets/helper/mullu-eye-helper-v3.bundle.js and verify install on index.html.
*/

(function registerMulluEyeHelper(global) {
  "use strict";

  const RISKY_WORDS = [
    "delete",
    "remove",
    "reset",
    "submit",
    "send",
    "pay",
    "buy",
    "checkout",
    "logout",
    "disconnect",
    "revoke",
    "cancel",
    "publish",
  ];

  const DEFAULT_OPTIONS = {
    activeByDefault: false,
    endpoint: "",
    eyeCursorOptions: {
      size: 0.86,
      smooth: 0.22,
      hideNativeCursor: true,
      restoreNativeOnText: true,
      enabledOnCoarsePointer: false,
    },
  };

  const HELPER_ROOT_ATTRIBUTE = "data-mullu-eye-helper-root";
  const INSTALL_STATE_KEY = "__mulluEyeHelperV3";

  function mergeOptions(options) {
    const supplied = options && typeof options === "object" ? options : {};
    return {
      ...DEFAULT_OPTIONS,
      ...supplied,
      eyeCursorOptions: {
        ...DEFAULT_OPTIONS.eyeCursorOptions,
        ...(supplied.eyeCursorOptions || {}),
      },
    };
  }

  function clampText(value, maxLength) {
    const normalized = String(value || "").replace(/\s+/g, " ").trim();
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
  }

  function isHelperNode(node) {
    return Boolean(node?.closest?.(`[${HELPER_ROOT_ATTRIBUTE}]`));
  }

  function isVisibleElement(element) {
    if (!(element instanceof Element)) return false;
    const rect = element.getBoundingClientRect();
    const style = global.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }

  function safeTextFromElement(element, maxLength) {
    if (!(element instanceof Element)) return "";
    if (element.matches("input[type='password'], input[type='hidden']")) return "";
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      return clampText(element.getAttribute("placeholder") || element.getAttribute("aria-label") || "", maxLength);
    }
    return clampText(element.innerText || element.textContent || "", maxLength);
  }

  function getExplicitLabel(element) {
    if (!(element instanceof Element)) return "";
    const ariaLabel = element.getAttribute("aria-label");
    if (ariaLabel) return clampText(ariaLabel, 140);
    const labelledBy = element.getAttribute("aria-labelledby");
    if (labelledBy) {
      const label = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent || "")
        .join(" ");
      if (label.trim()) return clampText(label, 140);
    }
    if (element.id) {
      const labelElement = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
      if (labelElement) return clampText(labelElement.textContent || "", 140);
    }
    if (element instanceof HTMLImageElement) return clampText(element.alt, 140);
    return "";
  }

  function classifyRole(element) {
    if (!(element instanceof Element)) return "unknown";
    const explicitRole = element.getAttribute("role");
    if (explicitRole) return explicitRole;
    const tag = element.tagName.toLowerCase();
    if (tag === "a") return "link";
    if (tag === "button") return "button";
    if (["input", "textarea", "select"].includes(tag)) return "input";
    if (["section", "main", "aside", "nav", "footer", "header"].includes(tag)) return "section";
    if (["article", "li"].includes(tag)) return "card";
    if (/^h[1-6]$/.test(tag)) return "heading";
    return "text";
  }

  function nearestHeadingText(element) {
    const scopedHeading = element.closest("section, article, aside, main")?.querySelector("h1, h2, h3, h4");
    if (scopedHeading) return clampText(scopedHeading.textContent || "", 140);
    let cursor = element.previousElementSibling;
    while (cursor) {
      if (cursor.matches?.("h1, h2, h3, h4")) return clampText(cursor.textContent || "", 140);
      cursor = cursor.previousElementSibling;
    }
    return "";
  }

  function selectorFor(element) {
    if (!(element instanceof Element)) return "";
    if (element.id) return `#${CSS.escape(element.id)}`;
    const parts = [];
    let cursor = element;
    while (cursor && cursor.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
      const tag = cursor.tagName.toLowerCase();
      if (cursor.id) {
        parts.unshift(`#${CSS.escape(cursor.id)}`);
        break;
      }
      const parent = cursor.parentElement;
      if (!parent) {
        parts.unshift(tag);
        break;
      }
      const sameTagSiblings = Array.from(parent.children).filter((child) => child.tagName === cursor.tagName);
      const suffix = sameTagSiblings.length > 1 ? `:nth-of-type(${sameTagSiblings.indexOf(cursor) + 1})` : "";
      parts.unshift(`${tag}${suffix}`);
      cursor = parent;
    }
    return parts.join(" > ");
  }

  function actionElementFor(element) {
    return element?.closest?.("a[href], button, input, textarea, select, [role='button'], [tabindex]:not([tabindex='-1'])") || element;
  }

  function buildTargetPacket(element) {
    const target = actionElementFor(element);
    const href = target instanceof HTMLAnchorElement ? target.href : "";
    const helperMetadata = target.getAttribute?.("data-mullu-helper")
      || element.closest?.("[data-mullu-helper]")?.getAttribute("data-mullu-helper")
      || "";
    const section = target.closest?.("section, article, aside, main") || target;
    const label = getExplicitLabel(target) || safeTextFromElement(target, 140) || nearestHeadingText(target);
    const text = safeTextFromElement(target, 280);
    const sectionText = section === target ? text : safeTextFromElement(section, 620);

    return {
      role: classifyRole(target),
      tag: target.tagName?.toLowerCase?.() || "",
      label,
      heading: nearestHeadingText(target),
      text,
      sectionText,
      helperMetadata: clampText(helperMetadata, 420),
      href,
      selector: selectorFor(target),
      url: global.location.href,
      title: document.title,
      risky: isRiskyPacket({ label, text, sectionText, href }),
    };
  }

  function isRiskyPacket(packet) {
    const haystack = `${packet.label || ""} ${packet.text || ""} ${packet.sectionText || ""} ${packet.href || ""}`.toLowerCase();
    return RISKY_WORDS.some((word) => haystack.includes(word));
  }

  function targetFromPoint(x, y) {
    const elements = document.elementsFromPoint(x, y);
    return elements.find((element) => !isHelperNode(element) && isVisibleElement(element) && element !== document.documentElement && element !== document.body) || null;
  }

  function createEyePair(className) {
    const pair = document.createElement("span");
    pair.className = className;
    pair.setAttribute("aria-hidden", "true");
    for (let index = 0; index < 2; index += 1) {
      const eye = document.createElement("span");
      eye.className = "mullu-eye-helper-eye";
      pair.append(eye);
    }
    return pair;
  }

  function createDom(options) {
    const dock = document.createElement("button");
    dock.type = "button";
    dock.className = "mullu-eye-helper-dock";
    dock.setAttribute(HELPER_ROOT_ATTRIBUTE, "");
    dock.setAttribute("aria-pressed", "false");
    dock.setAttribute("aria-label", "Activate Mullu eye helper");
    dock.append(createEyePair("mullu-eye-helper-dock-eyes"));
    const dockLabel = document.createElement("span");
    dockLabel.className = "mullu-eye-helper-dock-label";
    dockLabel.textContent = "Eye helper";
    dock.append(dockLabel);

    const cursor = document.createElement("div");
    cursor.className = "mullu-eye-helper-cursor";
    cursor.setAttribute(HELPER_ROOT_ATTRIBUTE, "");
    cursor.style.setProperty("--mullu-eye-helper-scale", String(options.eyeCursorOptions.size || 1));
    cursor.hidden = true;
    cursor.append(createEyePair("mullu-eye-helper-cursor-eyes"));

    const highlight = document.createElement("div");
    highlight.className = "mullu-eye-helper-highlight";
    highlight.setAttribute(HELPER_ROOT_ATTRIBUTE, "");
    highlight.hidden = true;

    const panel = document.createElement("section");
    panel.className = "mullu-eye-helper-panel";
    panel.setAttribute(HELPER_ROOT_ATTRIBUTE, "");
    panel.setAttribute("aria-label", "Mullu eye helper actions");
    panel.hidden = true;

    const toast = document.createElement("div");
    toast.className = "mullu-eye-helper-toast";
    toast.setAttribute(HELPER_ROOT_ATTRIBUTE, "");
    toast.setAttribute("role", "status");
    toast.hidden = true;

    document.body.append(dock, cursor, highlight, panel, toast);
    return { dock, dockLabel, cursor, highlight, panel, toast };
  }

  function install(options) {
    if (global[INSTALL_STATE_KEY]) return global[INSTALL_STATE_KEY].api;
    const resolvedOptions = mergeOptions(options);
    const coarsePointer = global.matchMedia?.("(pointer: coarse)")?.matches;
    if (coarsePointer && !resolvedOptions.eyeCursorOptions.enabledOnCoarsePointer) {
      return { activate() {}, deactivate() {}, inspect() { return null; } };
    }

    const dom = createDom(resolvedOptions);
    const state = {
      active: false,
      pointer: { x: -200, y: -200 },
      renderedPointer: { x: -200, y: -200 },
      currentElement: null,
      currentPacket: null,
      animationFrame: 0,
      confirmActionId: "",
      toastTimer: 0,
    };

    function updateEyeFocus(x, y) {
      const viewportWidth = Math.max(1, global.innerWidth || 1);
      const viewportHeight = Math.max(1, global.innerHeight || 1);
      const focusX = Math.max(-3, Math.min(3, ((x / viewportWidth) - 0.5) * 6));
      const focusY = Math.max(-2, Math.min(2, ((y / viewportHeight) - 0.5) * 4));
      document.documentElement.style.setProperty("--mullu-eye-helper-eye-x", `${focusX.toFixed(2)}px`);
      document.documentElement.style.setProperty("--mullu-eye-helper-eye-y", `${focusY.toFixed(2)}px`);
    }

    function resetEyeFocus() {
      document.documentElement.style.setProperty("--mullu-eye-helper-eye-x", "0px");
      document.documentElement.style.setProperty("--mullu-eye-helper-eye-y", "0px");
    }

    function setDockLabel(text) {
      dom.dockLabel.textContent = clampText(text || "Eye helper", 42);
    }

    function showToast(text) {
      global.clearTimeout(state.toastTimer);
      dom.toast.textContent = text;
      dom.toast.hidden = false;
      state.toastTimer = global.setTimeout(() => {
        dom.toast.hidden = true;
      }, 2400);
    }

    function updateHighlight(element) {
      if (!element) {
        dom.highlight.hidden = true;
        return;
      }
      const rect = element.getBoundingClientRect();
      dom.highlight.hidden = false;
      dom.highlight.style.left = `${Math.max(6, rect.left - 4)}px`;
      dom.highlight.style.top = `${Math.max(6, rect.top - 4)}px`;
      dom.highlight.style.width = `${Math.min(global.innerWidth - 12, rect.width + 8)}px`;
      dom.highlight.style.height = `${Math.min(global.innerHeight - 12, rect.height + 8)}px`;
    }

    function animateCursor() {
      if (!state.active) return;
      const smooth = Number(resolvedOptions.eyeCursorOptions.smooth) || 0.22;
      state.renderedPointer.x += (state.pointer.x - state.renderedPointer.x) * smooth;
      state.renderedPointer.y += (state.pointer.y - state.renderedPointer.y) * smooth;
      dom.cursor.style.transform = `translate3d(${state.renderedPointer.x - 27}px, ${state.renderedPointer.y - 17}px, 0)`;
      state.animationFrame = global.requestAnimationFrame(animateCursor);
    }

    function setActive(nextActive) {
      state.active = Boolean(nextActive);
      dom.dock.setAttribute("aria-pressed", String(state.active));
      dom.dock.setAttribute("aria-label", state.active ? "Deactivate Mullu eye helper" : "Activate Mullu eye helper");
      dom.cursor.hidden = !state.active;
      if (!state.active) {
        dom.highlight.hidden = true;
        dom.panel.hidden = true;
        document.documentElement.classList.remove("mullu-eye-helper-active");
        global.cancelAnimationFrame(state.animationFrame);
        setDockLabel("Eye helper");
        resetEyeFocus();
        return;
      }
      if (resolvedOptions.eyeCursorOptions.hideNativeCursor) {
        document.documentElement.classList.add("mullu-eye-helper-active");
      }
      setDockLabel("Helper active");
      state.animationFrame = global.requestAnimationFrame(animateCursor);
    }

    function updateTargetFromPointer(event) {
      if (!state.active || isHelperNode(event.target)) return;
      state.pointer = { x: event.clientX, y: event.clientY };
      updateEyeFocus(event.clientX, event.clientY);
      const target = targetFromPoint(event.clientX, event.clientY);
      state.currentElement = target;
      state.currentPacket = target ? buildTargetPacket(target) : null;
      updateHighlight(target);
      if (state.currentPacket) {
        setDockLabel(state.currentPacket.label || state.currentPacket.heading || state.currentPacket.role);
      }
    }

    function explainPacket(packet) {
      const basis = packet.helperMetadata || packet.sectionText || packet.text || packet.label || "No readable target text.";
      const heading = packet.heading ? ` under "${packet.heading}"` : "";
      return `Target: ${packet.role}${heading}. ${clampText(basis, 240)}`;
    }

    async function callEndpoint(packet) {
      if (!resolvedOptions.endpoint) return null;
      const response = await fetch(resolvedOptions.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "mullu.helper.inspect", packet }),
      });
      if (!response.ok) throw new Error(`Helper endpoint rejected inspection with HTTP ${response.status}.`);
      return response.json();
    }

    async function copyText(text, label) {
      if (!text) {
        showToast("No visible text available.");
        return;
      }
      await navigator.clipboard.writeText(text);
      showToast(`${label} copied.`);
    }

    function focusTarget() {
      const target = state.currentElement && actionElementFor(state.currentElement);
      if (target instanceof HTMLElement) {
        target.focus({ preventScroll: false });
        showToast("Field focused.");
      }
    }

    function openHref(packet) {
      if (!packet.href) return;
      global.location.href = packet.href;
    }

    function clickTarget() {
      const target = state.currentElement && actionElementFor(state.currentElement);
      if (!(target instanceof HTMLElement)) return;
      target.click();
      showToast("Target clicked.");
    }

    function actionsForPacket(packet) {
      const actions = [
        { id: "explain", label: "Explain target", note: "Uses visible page context", risky: false },
        { id: "copy-text", label: "Copy visible text", note: "Visible text only", risky: false },
      ];
      if (packet.href) {
        actions.unshift({ id: "open-link", label: "Open link", note: new URL(packet.href, global.location.href).hostname, risky: packet.risky });
        actions.push({ id: "copy-link", label: "Copy link", note: "URL only", risky: false });
      }
      if (packet.role === "button") {
        actions.unshift({ id: "click-target", label: "Click target", note: packet.risky ? "Confirmation required" : "User-triggered click", risky: packet.risky });
      }
      if (packet.role === "input") {
        actions.unshift({ id: "focus-field", label: "Focus field", note: "No value read", risky: false });
      }
      return actions;
    }

    function positionPanel(x, y) {
      const panelWidth = 340;
      const panelHeight = 360;
      const left = Math.min(Math.max(12, x + 16), Math.max(12, global.innerWidth - panelWidth - 12));
      const top = Math.min(Math.max(12, y + 16), Math.max(12, global.innerHeight - panelHeight - 12));
      dom.panel.style.left = `${left}px`;
      dom.panel.style.top = `${top}px`;
    }

    async function executeAction(actionId, packet, action) {
      if (action?.risky && state.confirmActionId !== actionId) {
        state.confirmActionId = actionId;
        renderPanel(packet, state.pointer.x, state.pointer.y, `Confirm before "${action.label}".`);
        return;
      }
      state.confirmActionId = "";
      if (actionId === "explain") {
        try {
          const remote = await callEndpoint(packet);
          showToast(remote?.summary ? clampText(remote.summary, 220) : explainPacket(packet));
        } catch (error) {
          showToast(error instanceof Error ? error.message : "Helper endpoint failed.");
        }
      } else if (actionId === "copy-text") {
        await copyText(packet.text || packet.sectionText, "Visible text");
      } else if (actionId === "copy-link") {
        await copyText(packet.href, "Link");
      } else if (actionId === "open-link") {
        openHref(packet);
      } else if (actionId === "click-target") {
        clickTarget();
      } else if (actionId === "focus-field") {
        focusTarget();
      }
      dom.panel.hidden = true;
    }

    function renderPanel(packet, x, y, warningText) {
      const actions = actionsForPacket(packet);
      const title = packet.label || packet.heading || packet.role || "Page target";
      dom.panel.replaceChildren();

      const head = document.createElement("div");
      head.className = "mullu-eye-helper-panel-head";
      const titleWrap = document.createElement("div");
      const kicker = document.createElement("p");
      kicker.className = "mullu-eye-helper-kicker";
      kicker.textContent = `${packet.role} - ${packet.tag}`;
      const titleElement = document.createElement("h2");
      titleElement.className = "mullu-eye-helper-title";
      titleElement.textContent = title;
      titleWrap.append(kicker, titleElement);
      const close = document.createElement("button");
      close.type = "button";
      close.className = "mullu-eye-helper-close";
      close.setAttribute("aria-label", "Close helper panel");
      close.textContent = "x";
      close.addEventListener("click", () => {
        dom.panel.hidden = true;
        state.confirmActionId = "";
      });
      head.append(titleWrap, close);

      const summary = document.createElement("p");
      summary.className = "mullu-eye-helper-summary";
      summary.textContent = packet.helperMetadata || packet.heading || clampText(packet.sectionText || packet.text || "No visible text available.", 220);

      const actionsWrap = document.createElement("div");
      actionsWrap.className = "mullu-eye-helper-actions";
      for (const action of actions) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.action = action.id;
        button.dataset.risk = String(action.risky);
        const label = document.createElement("span");
        label.textContent = action.risky && state.confirmActionId === action.id ? `Confirm ${action.label}` : action.label;
        const note = document.createElement("span");
        note.className = "mullu-eye-helper-action-note";
        note.textContent = action.note;
        button.append(label, note);
        button.addEventListener("click", () => {
          executeAction(action.id, packet, action).catch((error) => {
            showToast(error instanceof Error ? error.message : "Action failed.");
          });
        });
        actionsWrap.append(button);
      }

      dom.panel.append(head, summary, actionsWrap);
      if (packet.risky || warningText) {
        const warning = document.createElement("p");
        warning.className = "mullu-eye-helper-warning";
        warning.textContent = warningText || "This target contains state-changing language. Risky actions require a second confirmation.";
        dom.panel.append(warning);
      }
      positionPanel(x, y);
      dom.panel.hidden = false;
    }

    function inspect() {
      return state.currentPacket ? { ...state.currentPacket } : null;
    }

    dom.dock.addEventListener("click", () => setActive(!state.active));
    document.addEventListener("pointermove", updateTargetFromPointer, { passive: true });
    document.addEventListener(
      "click",
      (event) => {
        if (!state.active || isHelperNode(event.target)) return;
        const target = targetFromPoint(event.clientX, event.clientY);
        if (!target) return;
        event.preventDefault();
        event.stopPropagation();
        state.currentElement = target;
        state.currentPacket = buildTargetPacket(target);
        renderPanel(state.currentPacket, event.clientX, event.clientY, "");
      },
      true,
    );
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        dom.panel.hidden = true;
        state.confirmActionId = "";
      }
    });

    const api = {
      activate() {
        setActive(true);
      },
      deactivate() {
        setActive(false);
      },
      inspect,
    };

    global[INSTALL_STATE_KEY] = { api, state };
    if (resolvedOptions.activeByDefault) setActive(true);
    return api;
  }

  global.MulluEyeHelper = Object.freeze({ install });
})(window);
