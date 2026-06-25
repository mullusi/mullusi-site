/*
Purpose: control the homepage Governed Claim Lens interaction and claim rewrite sequence.
Governance scope: public claim-state switching, evidence-bound wording, accessible tab state, and reduced-motion fallback.
Dependencies: browser DOM APIs, same-document View Transition API when available, and static homepage markup.
Invariants: claim states are hardcoded public records, no runtime readiness is promoted, and missing DOM targets fail visibly in console.
*/

(() => {
  const lensNodes = Object.freeze([
    {
      id: "public-route",
      state: "Live",
      title: "Product route",
      text: "Mullu is the foundation route for a work assistant that helps teams plan, preview, review, and complete controlled work.",
      rule: "Move from intent to action without losing approval, evidence, or operating context.",
      href: "/mullu/",
      cta: "Explore Product",
    },
    {
      id: "proof-boundary",
      state: "Visible",
      title: "Proof status",
      text: "The public site keeps proof status visible so visitors can distinguish what is live, what is staged, and what is still awaiting evidence.",
      rule: "Trust is easier when the current state is shown plainly.",
      href: "/proof/",
      cta: "See Proof Status",
    },
    {
      id: "runtime-witness",
      state: "AwaitingEvidence",
      title: "Runtime state",
      text: "Runtime witness remains AwaitingEvidence until /health, /gateway/witness, and /runtime/conformance close.",
      rule: "The website is live; the runtime witness is not claimed as closed.",
      href: "/proof/",
      cta: "View Runtime State",
    },
    {
      id: "platform-spine",
      state: "Visible",
      title: "Platform path",
      text: "A request can move from user surface to API gateway, checks, job registry, product service, storage, audit, and result surface.",
      rule: "The technical offer is a controlled path from work request to reviewed result.",
      href: "#platform",
      cta: "View Platform Spine",
    },
    {
      id: "release-gates",
      state: "Planned",
      title: "Release path",
      text: "New surfaces move through Register, Attach, Verify, and Publish before they are presented as public capability.",
      rule: "This keeps the marketing story tied to the product state.",
      href: "#roadmap",
      cta: "Inspect Release Gates",
    },
  ]);

  const claimFrames = Object.freeze([
    "Runtime claim requested",
    "Trust check: witness endpoint missing",
    "Public wording adjusted",
    "Runtime: AwaitingEvidence",
  ]);

  function requiredElement(root, selector) {
    const element = root.querySelector(selector);
    if (!element) {
      throw new Error(`Claim lens target missing: ${selector}`);
    }
    return element;
  }

  function reducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function updatePanel(root, panelTargets, node) {
    root.dataset.activeLens = node.id;
    panelTargets.state.textContent = node.state;
    panelTargets.title.textContent = node.title;
    panelTargets.text.textContent = node.text;
    panelTargets.rule.textContent = node.rule;
    panelTargets.link.setAttribute("href", node.href);
    panelTargets.link.textContent = node.cta;
  }

  function activateLens(root, panelTargets, tabs, node, options = {}) {
    const write = () => {
      tabs.forEach((tab) => {
        const active = tab.dataset.lensNode === node.id;
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-selected", String(active));
        tab.tabIndex = active ? 0 : -1;
      });
      updatePanel(root, panelTargets, node);
    };

    if (!options.skipTransition && document.startViewTransition && !reducedMotion()) {
      document.startViewTransition(write);
      return;
    }
    write();
  }

  function bindTabs(root) {
    const tabs = Array.from(root.querySelectorAll("[data-lens-node]"));
    const panelTargets = {
      state: requiredElement(root, "[data-lens-state]"),
      title: requiredElement(root, "[data-lens-title]"),
      text: requiredElement(root, "[data-lens-text]"),
      rule: requiredElement(root, "[data-lens-rule]"),
      link: requiredElement(root, "[data-lens-href]"),
    };

    const nodeById = new Map(lensNodes.map((node) => [node.id, node]));
    const defaultNode = nodeById.get(root.dataset.activeLens) || lensNodes[0];

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const node = nodeById.get(tab.dataset.lensNode);
        if (!node) return;
        activateLens(root, panelTargets, tabs, node);
      });

      tab.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();

        const activeIndex = tabs.indexOf(tab);
        const nextIndex = event.key === "Home"
          ? 0
          : event.key === "End"
            ? tabs.length - 1
            : event.key === "ArrowRight"
              ? (activeIndex + 1) % tabs.length
              : (activeIndex - 1 + tabs.length) % tabs.length;

        tabs[nextIndex].focus();
        tabs[nextIndex].click();
      });
    });

    activateLens(root, panelTargets, tabs, defaultNode, { skipTransition: true });
  }

  function bindClaimRewrite(root) {
    const frame = requiredElement(root, "[data-claim-frame-text]");
    const steps = Array.from(root.querySelectorAll("[data-claim-step]"));
    const replay = requiredElement(root, "[data-claim-replay]");
    let timers = [];

    function clearTimers() {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers = [];
    }

    function setFrame(index) {
      frame.textContent = claimFrames[index];
      root.dataset.claimFrame = String(index);
      steps.forEach((step, stepIndex) => {
        step.classList.toggle("is-active", stepIndex === index);
        step.classList.toggle("is-complete", stepIndex < index);
      });
    }

    function runSequence() {
      clearTimers();
      if (reducedMotion()) {
        setFrame(claimFrames.length - 1);
        return;
      }

      claimFrames.forEach((_, index) => {
        timers.push(window.setTimeout(() => setFrame(index), 500 + index * 1650));
      });
    }

    replay.addEventListener("click", runSequence);
    runSequence();
  }

  function initClaimLens() {
    const root = document.querySelector("[data-claim-lens]");
    if (!root) return;

    try {
      bindTabs(root);
      bindClaimRewrite(root);
    } catch (error) {
      console.error(error);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initClaimLens, { once: true });
    return;
  }
  initClaimLens();
})();
