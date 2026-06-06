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
      attentionIntervalMs: 420,
      hideNativeCursor: true,
      restoreNativeOnText: true,
      enabledOnCoarsePointer: false,
    },
  };

  const HELPER_ROOT_ATTRIBUTE = "data-mullu-eye-helper-root";
  const INSTALL_STATE_KEY = "__mulluEyeHelperV3";
  const TARGET_CLASS_NAMES = [
    "mullu-eye-helper-target-button",
    "mullu-eye-helper-target-card",
    "mullu-eye-helper-target-heading",
    "mullu-eye-helper-target-input",
    "mullu-eye-helper-target-link",
    "mullu-eye-helper-target-section",
    "mullu-eye-helper-target-text",
  ];

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

  function stableHash(value) {
    let hash = 2166136261;
    const text = String(value || "");
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36).padStart(7, "0").slice(0, 7);
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
    const role = classifyRole(target);
    const heading = nearestHeadingText(target);
    const label = getExplicitLabel(target) || safeTextFromElement(target, 140) || nearestHeadingText(target);
    const text = safeTextFromElement(target, 280);
    const sectionText = section === target ? text : safeTextFromElement(section, 620);
    const selector = selectorFor(target);
    const evidence = [];
    if (helperMetadata) evidence.push("metadata");
    if (label) evidence.push("label");
    if (heading) evidence.push("heading");
    if (text) evidence.push("visible-text");
    if (href) evidence.push("href");
    if (["button", "input", "link"].includes(role)) evidence.push("action-role");
    const confidence = Math.min(
      0.98,
      0.28
        + (helperMetadata ? 0.22 : 0)
        + (label ? 0.18 : 0)
        + (heading ? 0.12 : 0)
        + (text ? 0.1 : 0)
        + (href ? 0.04 : 0)
        + (["button", "input", "link"].includes(role) ? 0.04 : 0),
    );
    const targetId = stableHash([role, target.tagName?.toLowerCase?.() || "", label, heading, href, selector].join("|"));

    return {
      targetId,
      role,
      tag: target.tagName?.toLowerCase?.() || "",
      label,
      heading,
      text,
      sectionText,
      helperMetadata: clampText(helperMetadata, 420),
      evidence,
      confidence: Number(confidence.toFixed(2)),
      href,
      selector,
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

  function targetMatchesPacket(target, packet) {
    if (!(target instanceof Element) || !packet) return false;
    const targetHref = target instanceof HTMLAnchorElement ? target.href : "";
    const targetLabel = getExplicitLabel(target) || safeTextFromElement(target, 140) || nearestHeadingText(target);
    return target.tagName?.toLowerCase?.() === packet.tag
      && classifyRole(target) === packet.role
      && clampText(targetLabel, 140) === clampText(packet.label || "", 140)
      && targetHref === (packet.href || "");
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
      return { activate() {}, deactivate() {}, inspect() { return null; }, receipts() { return []; } };
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
      pinnedElement: null,
      pinnedPacket: null,
      receipts: [],
      revealTimer: 0,
      toastTimer: 0,
      wakeTimer: 0,
      attentionTimer: 0,
      lastPointerAt: 0,
      keyboardElement: null,
    };

    function roleClassName(packet) {
      const role = String(packet?.role || "text").toLowerCase();
      const className = `mullu-eye-helper-target-${role}`;
      return TARGET_CLASS_NAMES.includes(className) ? className : "mullu-eye-helper-target-text";
    }

    function recordReceipt(actionId, packet, result) {
      state.receipts.push({
        actionId,
        targetId: packet?.targetId || "",
        label: clampText(packet?.label || "", 96),
        result,
        risky: Boolean(packet?.risky),
        role: packet?.role || "unknown",
        selector: packet?.selector || "",
        timestamp: new Date().toISOString(),
      });
      if (state.receipts.length > 20) {
        state.receipts.splice(0, state.receipts.length - 20);
      }
    }

    function resolveActionTarget(packet, actionId) {
      if (!packet?.selector) {
        recordReceipt(actionId, packet, "blocked_missing_selector");
        showToast("Target lock missing. Point again and retry.");
        return null;
      }
      let resolvedTarget = null;
      try {
        resolvedTarget = document.querySelector(packet.selector);
      } catch (error) {
        recordReceipt(actionId, packet, "blocked_invalid_selector");
        showToast("Target selector invalid. Point again and retry.");
        return null;
      }
      if (!targetMatchesPacket(resolvedTarget, packet)) {
        recordReceipt(actionId, packet, "blocked_stale_target");
        showToast("Target changed. Point again and retry.");
        return null;
      }
      return resolvedTarget;
    }

    function clearVisualTargetState() {
      document.documentElement.classList.remove("mullu-eye-helper-risky", ...TARGET_CLASS_NAMES);
      dom.highlight.hidden = true;
      state.currentElement = null;
      state.currentPacket = null;
      state.confirmActionId = "";
    }

    function refreshPinnedTarget() {
      if (!state.pinnedPacket) return false;
      const pinnedTarget = document.querySelector(state.pinnedPacket.selector);
      if (!targetMatchesPacket(pinnedTarget, state.pinnedPacket)) {
        recordReceipt("pin-target", state.pinnedPacket, "blocked_stale_pinned_target");
        state.pinnedElement = null;
        state.pinnedPacket = null;
        document.documentElement.classList.remove("mullu-eye-helper-pinned");
        clearVisualTargetState();
        showToast("Pinned target changed. Pin cleared.");
        return false;
      }
      state.pinnedElement = pinnedTarget;
      state.currentElement = pinnedTarget;
      state.currentPacket = { ...state.pinnedPacket };
      updateTargetState(state.currentPacket);
      updateHighlight(pinnedTarget);
      setDockLabel(`Pinned ${state.currentPacket.label || state.currentPacket.role}`);
      return true;
    }

    function clearPinnedTarget(record = true) {
      const pinnedPacket = state.pinnedPacket;
      state.pinnedElement = null;
      state.pinnedPacket = null;
      document.documentElement.classList.remove("mullu-eye-helper-pinned");
      clearVisualTargetState();
      if (record && pinnedPacket) {
        recordReceipt("unpin-target", pinnedPacket, "unpinned");
        showToast("Target unpinned.");
      }
    }

    function pulseRevealTarget() {
      document.documentElement.classList.add("mullu-eye-helper-revealing");
      global.clearTimeout(state.revealTimer);
      state.revealTimer = global.setTimeout(() => {
        document.documentElement.classList.remove("mullu-eye-helper-revealing");
      }, 980);
    }

    function clearTargetState() {
      if (state.pinnedPacket && refreshPinnedTarget()) return;
      clearVisualTargetState();
      if (state.active && dom.panel.hidden) {
        setDockLabel("Helper active");
      }
    }

    function pinTarget(packet) {
      const target = resolveActionTarget(packet, "pin-target");
      if (!target) return false;
      state.pinnedElement = target;
      state.pinnedPacket = { ...packet };
      document.documentElement.classList.add("mullu-eye-helper-pinned");
      updateTargetState(state.pinnedPacket);
      updateHighlight(target);
      setDockLabel(`Pinned ${packet.label || packet.role}`);
      recordReceipt("pin-target", packet, "pinned");
      showToast("Target pinned.");
      return true;
    }

    function updateTargetState(packet) {
      document.documentElement.classList.remove(...TARGET_CLASS_NAMES);
      document.documentElement.classList.toggle("mullu-eye-helper-risky", Boolean(packet?.risky));
      if (packet) {
        document.documentElement.classList.add(roleClassName(packet));
      }
    }

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

    function updateIdleAttention() {
      if (!state.active) return;
      if (state.pinnedPacket || !dom.panel.hidden) return;
      const idleForMs = performance.now() - state.lastPointerAt;
      document.documentElement.classList.toggle("mullu-eye-helper-scanning", idleForMs > 900 && !state.currentPacket);
      if (idleForMs <= 900 || state.currentPacket) return;
      const phase = Math.floor(performance.now() / Math.max(160, Number(resolvedOptions.eyeCursorOptions.attentionIntervalMs) || 420));
      const focusX = (((phase * 5) % 7) - 3) * 0.72;
      const focusY = (((phase * 3) % 5) - 2) * 0.56;
      document.documentElement.style.setProperty("--mullu-eye-helper-eye-x", `${focusX.toFixed(2)}px`);
      document.documentElement.style.setProperty("--mullu-eye-helper-eye-y", `${focusY.toFixed(2)}px`);
      setDockLabel("Scanning page");
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
        dom.panel.hidden = true;
        document.documentElement.classList.remove("mullu-eye-helper-active");
        document.documentElement.classList.remove("mullu-eye-helper-waking");
        document.documentElement.classList.remove("mullu-eye-helper-revealing");
        document.documentElement.classList.remove("mullu-eye-helper-scanning");
        document.documentElement.classList.remove("mullu-eye-helper-keyboard-lock");
        document.documentElement.classList.remove("mullu-eye-helper-panel-open");
        clearPinnedTarget(false);
        clearTargetState();
        global.clearTimeout(state.revealTimer);
        global.clearTimeout(state.wakeTimer);
        global.clearInterval(state.attentionTimer);
        global.cancelAnimationFrame(state.animationFrame);
        state.keyboardElement = null;
        setDockLabel("Eye helper");
        resetEyeFocus();
        return;
      }
      if (resolvedOptions.eyeCursorOptions.hideNativeCursor) {
        document.documentElement.classList.add("mullu-eye-helper-active");
      }
      global.clearTimeout(state.wakeTimer);
      document.documentElement.classList.add("mullu-eye-helper-waking");
      state.wakeTimer = global.setTimeout(() => {
        document.documentElement.classList.remove("mullu-eye-helper-waking");
      }, 620);
      setDockLabel("Helper active");
      state.lastPointerAt = performance.now();
      global.clearInterval(state.attentionTimer);
      state.attentionTimer = global.setInterval(updateIdleAttention, Math.max(160, Number(resolvedOptions.eyeCursorOptions.attentionIntervalMs) || 420));
      state.animationFrame = global.requestAnimationFrame(animateCursor);
    }

    function updateTargetFromPointer(event) {
      if (!state.active || isHelperNode(event.target)) return;
      state.lastPointerAt = performance.now();
      document.documentElement.classList.remove("mullu-eye-helper-scanning", "mullu-eye-helper-keyboard-lock");
      state.keyboardElement = null;
      state.pointer = { x: event.clientX, y: event.clientY };
      updateEyeFocus(event.clientX, event.clientY);
      if (state.pinnedPacket) {
        refreshPinnedTarget();
        return;
      }
      const target = targetFromPoint(event.clientX, event.clientY);
      state.currentElement = target;
      state.currentPacket = target ? buildTargetPacket(target) : null;
      updateTargetState(state.currentPacket);
      updateHighlight(target);
      if (state.currentPacket) {
        setDockLabel(state.currentPacket.label || state.currentPacket.heading || state.currentPacket.role);
      }
    }

    function inspectFocusedTarget(element) {
      if (!state.active || isHelperNode(element) || !isVisibleElement(element)) return false;
      const packet = buildTargetPacket(element);
      const rect = element.getBoundingClientRect();
      const centerX = Math.min(global.innerWidth - 12, Math.max(12, rect.left + (rect.width / 2)));
      const centerY = Math.min(global.innerHeight - 12, Math.max(12, rect.top + (rect.height / 2)));
      state.keyboardElement = element;
      state.currentElement = element;
      state.currentPacket = packet;
      state.pointer = { x: centerX, y: centerY };
      document.documentElement.classList.remove("mullu-eye-helper-scanning");
      document.documentElement.classList.add("mullu-eye-helper-keyboard-lock");
      updateEyeFocus(centerX, centerY);
      updateTargetState(packet);
      updateHighlight(element);
      setDockLabel(packet.label || packet.heading || "Keyboard target");
      return true;
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
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API is unavailable for this browser context.");
      }
      await navigator.clipboard.writeText(text);
      showToast(`${label} copied.`);
    }

    function exportPacket(packet) {
      return {
        type: "mullu.helper.inspect",
        exportedAt: new Date().toISOString(),
        packet: {
          targetId: packet.targetId,
          role: packet.role,
          tag: packet.tag,
          label: packet.label,
          heading: packet.heading,
          text: packet.text,
          sectionText: packet.sectionText,
          helperMetadata: packet.helperMetadata,
          evidence: [...packet.evidence],
          confidence: packet.confidence,
          href: packet.href,
          selector: packet.selector,
          url: packet.url,
          title: packet.title,
          risky: packet.risky,
        },
      };
    }

    function exportReceipts() {
      return {
        type: "mullu.helper.receipts",
        exportedAt: new Date().toISOString(),
        receipts: receipts(),
      };
    }

    function focusTarget(packet, actionId) {
      const target = resolveActionTarget(packet, actionId);
      if (!(target instanceof HTMLElement)) return false;
      target.focus({ preventScroll: false });
      showToast("Field focused.");
      return true;
    }

    function openHref(packet, actionId) {
      if (!packet.href) return false;
      if (!resolveActionTarget(packet, actionId)) return false;
      global.location.href = packet.href;
      return true;
    }

    function clickTarget(packet, actionId) {
      const target = resolveActionTarget(packet, actionId);
      if (target instanceof HTMLElement) {
        target.click();
        showToast("Target clicked.");
        return true;
      }
      return false;
    }

    function revealTarget(packet, actionId) {
      const target = resolveActionTarget(packet, actionId);
      if (!(target instanceof HTMLElement)) return false;
      target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      state.currentElement = target;
      state.currentPacket = { ...packet };
      updateTargetState(packet);
      updateHighlight(target);
      pulseRevealTarget();
      showToast("Target revealed.");
      return true;
    }

    function actionsForPacket(packet) {
      const lowConfidenceExecutable = packet.confidence < 0.58 && ["button", "input"].includes(packet.role);
      const actions = [
        state.pinnedPacket ? { id: "unpin-target", label: "Unpin target", note: "Release lock", risky: false } : { id: "pin-target", label: "Pin target", note: "Freeze context", risky: false },
        { id: "reveal-target", label: "Reveal target", note: "Center on page", risky: false },
        { id: "explain", label: "Explain target", note: "Uses visible page context", risky: false },
        { id: "copy-text", label: "Copy visible text", note: "Visible text only", risky: false },
        { id: "copy-packet", label: "Copy packet", note: "Visible JSON", risky: false },
      ];
      if (state.receipts.length > 0) {
        actions.push({ id: "copy-receipts", label: "Copy receipts", note: `${state.receipts.length} local`, risky: false });
      }
      if (packet.href) {
        actions.unshift({ id: "open-link", label: "Open link", note: new URL(packet.href, global.location.href).hostname, risky: packet.risky });
        actions.push({ id: "copy-link", label: "Copy link", note: "URL only", risky: false });
      }
      if (packet.role === "button") {
        actions.unshift({
          id: "click-target",
          label: "Click target",
          note: packet.risky || lowConfidenceExecutable ? "Confirmation required" : "User-triggered click",
          risky: packet.risky,
          requiresConfirmation: lowConfidenceExecutable,
        });
      }
      if (packet.role === "input") {
        actions.unshift({
          id: "focus-field",
          label: "Focus field",
          note: lowConfidenceExecutable ? "Confirm weak lock" : "No value read",
          risky: false,
          requiresConfirmation: lowConfidenceExecutable,
        });
      }
      return actions;
    }

    function positionPanel(x, y) {
      const rect = dom.panel.getBoundingClientRect();
      const panelWidth = Math.min(rect.width || 340, global.innerWidth - 24);
      const panelHeight = Math.min(rect.height || 360, global.innerHeight - 24);
      const rightSideLeft = x + 16;
      const leftSideLeft = x - panelWidth - 16;
      const belowTop = y + 16;
      const aboveTop = y - panelHeight - 16;
      const preferredLeft = rightSideLeft + panelWidth <= global.innerWidth - 12 ? rightSideLeft : leftSideLeft;
      const preferredTop = belowTop + panelHeight <= global.innerHeight - 12 ? belowTop : aboveTop;
      const left = Math.min(Math.max(12, preferredLeft), Math.max(12, global.innerWidth - panelWidth - 12));
      const top = Math.min(Math.max(12, preferredTop), Math.max(12, global.innerHeight - panelHeight - 12));
      dom.panel.style.left = `${left}px`;
      dom.panel.style.top = `${top}px`;
    }

    async function executeAction(actionId, packet, action) {
      if ((action?.risky || action?.requiresConfirmation) && state.confirmActionId !== actionId) {
        state.confirmActionId = actionId;
        recordReceipt(actionId, packet, "confirmation_required");
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
        recordReceipt(actionId, packet, "explained");
      } else if (actionId === "copy-text") {
        await copyText(packet.text || packet.sectionText, "Visible text");
        recordReceipt(actionId, packet, "copied_text");
      } else if (actionId === "copy-packet") {
        await copyText(JSON.stringify(exportPacket(packet), null, 2), "Target packet");
        recordReceipt(actionId, packet, "copied_packet");
      } else if (actionId === "copy-receipts") {
        await copyText(JSON.stringify(exportReceipts(), null, 2), "Helper receipts");
        recordReceipt(actionId, packet, "copied_receipts");
      } else if (actionId === "copy-link") {
        await copyText(packet.href, "Link");
        recordReceipt(actionId, packet, "copied_link");
      } else if (actionId === "open-link") {
        if (openHref(packet, actionId)) recordReceipt(actionId, packet, "opening_link");
      } else if (actionId === "click-target") {
        if (clickTarget(packet, actionId)) recordReceipt(actionId, packet, "clicked");
      } else if (actionId === "focus-field") {
        if (focusTarget(packet, actionId)) recordReceipt(actionId, packet, "focused");
      } else if (actionId === "pin-target") {
        pinTarget(packet);
      } else if (actionId === "unpin-target") {
        clearPinnedTarget(true);
      } else if (actionId === "reveal-target") {
        if (revealTarget(packet, actionId)) recordReceipt(actionId, packet, "revealed");
      }
      dom.panel.hidden = true;
      document.documentElement.classList.remove("mullu-eye-helper-panel-open");
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
        document.documentElement.classList.remove("mullu-eye-helper-panel-open");
      });
      head.append(titleWrap, close);

      const summary = document.createElement("p");
      summary.className = "mullu-eye-helper-summary";
      summary.textContent = packet.helperMetadata || packet.heading || clampText(packet.sectionText || packet.text || "No visible text available.", 220);

      const meta = document.createElement("div");
      meta.className = "mullu-eye-helper-meta";
      const confidence = document.createElement("span");
      confidence.textContent = `k=${packet.confidence.toFixed(2)}`;
      const targetId = document.createElement("span");
      targetId.textContent = `id=${packet.targetId}`;
      const evidence = document.createElement("span");
      evidence.textContent = packet.evidence.length > 0 ? packet.evidence.join(" + ") : "visible-target";
      const selector = document.createElement("span");
      selector.textContent = clampText(packet.selector || packet.tag || "target", 54);
      meta.append(confidence, targetId, evidence, selector);

      const actionsWrap = document.createElement("div");
      actionsWrap.className = "mullu-eye-helper-actions";
      for (const action of actions) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.action = action.id;
        button.dataset.risk = String(action.risky || action.requiresConfirmation);
        const label = document.createElement("span");
        label.textContent = (action.risky || action.requiresConfirmation) && state.confirmActionId === action.id ? `Confirm ${action.label}` : action.label;
        const note = document.createElement("span");
        note.className = "mullu-eye-helper-action-note";
        note.textContent = action.note;
        button.append(label, note);
        button.addEventListener("click", () => {
          executeAction(action.id, packet, action).catch((error) => {
            recordReceipt(action.id, packet, "failed");
            showToast(error instanceof Error ? error.message : "Action failed.");
          });
        });
        actionsWrap.append(button);
      }

      dom.panel.append(head, summary, meta, actionsWrap);
      if (packet.risky || warningText) {
        const warning = document.createElement("p");
        warning.className = "mullu-eye-helper-warning";
        warning.textContent = warningText || "This target contains state-changing language. Risky actions require a second confirmation.";
        dom.panel.append(warning);
      }
      dom.panel.hidden = false;
      document.documentElement.classList.add("mullu-eye-helper-panel-open");
      positionPanel(x, y);
      const firstAction = dom.panel.querySelector("button[data-action], .mullu-eye-helper-close");
      global.requestAnimationFrame(() => firstAction?.focus?.({ preventScroll: true }));
    }

    function inspect() {
      return state.currentPacket ? { ...state.currentPacket } : null;
    }

    function receipts() {
      return state.receipts.map((receipt) => ({ ...receipt }));
    }

    dom.dock.addEventListener("click", () => setActive(!state.active));
    document.addEventListener("pointermove", updateTargetFromPointer, { passive: true });
    document.addEventListener("pointerleave", () => {
      if (state.active && dom.panel.hidden) clearTargetState();
    });
    document.addEventListener("focusin", (event) => {
      if (!state.active || state.pinnedPacket || !dom.panel.hidden) return;
      inspectFocusedTarget(event.target);
    });
    global.addEventListener("scroll", () => {
      if (state.active && dom.panel.hidden) clearTargetState();
      if (state.active && !dom.panel.hidden && state.currentElement) updateHighlight(state.currentElement);
    }, { passive: true });
    global.addEventListener("resize", () => {
      if (state.active && dom.panel.hidden) clearTargetState();
      if (!dom.panel.hidden) positionPanel(state.pointer.x, state.pointer.y);
      if (state.active && state.currentElement) updateHighlight(state.currentElement);
    }, { passive: true });
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
        updateTargetState(state.currentPacket);
        renderPanel(state.currentPacket, event.clientX, event.clientY, "");
      },
      true,
    );
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        if (!dom.panel.hidden) {
          dom.panel.hidden = true;
          state.confirmActionId = "";
          document.documentElement.classList.remove("mullu-eye-helper-panel-open");
          return;
        }
        if (state.active) {
          setActive(false);
        }
      } else if (state.active && event.altKey && event.key === "Enter" && state.currentPacket) {
        event.preventDefault();
        event.stopPropagation();
        renderPanel(state.currentPacket, state.pointer.x, state.pointer.y, "");
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
      receipts,
    };

    global[INSTALL_STATE_KEY] = { api, state };
    if (resolvedOptions.activeByDefault) setActive(true);
    return api;
  }

  global.MulluEyeHelper = Object.freeze({ install });
})(window);
