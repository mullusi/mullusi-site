/*
Purpose: verify the Mullu Eye Helper interaction and authority contract without requiring a browser runtime.
Governance scope: helper boot state, target packet evidence, risky action confirmation, stale-target blocking, receipts, keyboard interaction, reduced-motion boundary, and secret-safety guards.
Dependencies: Node.js standard library, index.html, assets/helper/mullu-eye-helper-v3.bundle.js, assets/helper/mullu-eye-helper-v3.bundle.css, and assets/helper/mullu-eye-helper-v3.install.js.
Invariants: tests inspect public source contracts only, do not execute browser actions, and fail closed on missing helper authority guards.
*/

import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync("index.html", "utf8");
const bundle = fs.readFileSync("assets/helper/mullu-eye-helper-v3.bundle.js", "utf8");
const css = fs.readFileSync("assets/helper/mullu-eye-helper-v3.bundle.css", "utf8");
const install = fs.readFileSync("assets/helper/mullu-eye-helper-v3.install.js", "utf8");
const readme = fs.readFileSync("assets/helper/MULLU_EYE_HELPER_V3_README.md", "utf8");

function indexOfRequired(source, term) {
  const position = source.indexOf(term);
  assert.notEqual(position, -1, `missing term: ${term}`);
  return position;
}

function testBootAndHomepageMetadataContract() {
  assert.ok(html.includes("/assets/helper/mullu-eye-helper-v3.bundle.css?v=2026.06.helper.4"));
  assert.ok(html.includes("/assets/helper/mullu-eye-helper-v3.bundle.js?v=2026.06.helper.4"));
  assert.ok(html.includes("/assets/helper/mullu-eye-helper-v3.install.js?v=2026.06.helper.4"));
  assert.ok(indexOfRequired(html, "/assets/helper/mullu-eye-helper-v3.bundle.js") < indexOfRequired(html, "/assets/helper/mullu-eye-helper-v3.install.js"));
  assert.ok(install.includes("activeByDefault: false"));
  assert.ok(install.includes("enabledOnCoarsePointer: false"));
  assert.ok(install.includes("data-mullu-eye-helper-boot"));
  assert.ok(install.includes("MAX_ATTEMPTS"));
  assert.ok(install.includes("document.readyState === \"loading\""));
  assert.ok(install.includes("markBootState(\"installed\""));
  assert.ok(install.includes("markBootState(\"unavailable\""));
  assert.ok(install.includes("markBootState(\"failed\""));
  assert.ok(html.includes('data-mullu-helper="Explain the Mullusi homepage foundation boundary'));
  assert.ok(html.includes('data-mullu-helper="Explain product cards'));
}

function makeInstallRuntime({ readyState, helper }) {
  const attributes = new Map();
  const listeners = new Map();
  const document = {
    readyState,
    documentElement: {
      setAttribute(name, value) {
        attributes.set(name, value);
      },
      removeAttribute(name) {
        attributes.delete(name);
      },
      getAttribute(name) {
        return attributes.get(name) || null;
      },
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
  };
  const window = {
    document,
    MulluEyeHelper: helper,
    setTimeout(listener) {
      listener();
    },
  };
  return {
    context: vm.createContext({ document, window }),
    document,
    listeners,
  };
}

function testInstallExecutionContract() {
  let installCount = 0;
  const installedRuntime = makeInstallRuntime({
    readyState: "complete",
    helper: {
      install(options) {
        installCount += 1;
        assert.equal(options.activeByDefault, false);
        assert.equal(options.eyeCursorOptions.enabledOnCoarsePointer, false);
      },
    },
  });
  vm.runInContext(install, installedRuntime.context);
  assert.equal(installCount, 1);
  assert.equal(installedRuntime.document.documentElement.getAttribute("data-mullu-eye-helper-boot"), "installed");

  const unavailableRuntime = makeInstallRuntime({ readyState: "loading", helper: null });
  vm.runInContext(install, unavailableRuntime.context);
  assert.equal(unavailableRuntime.document.documentElement.getAttribute("data-mullu-eye-helper-boot"), null);
  unavailableRuntime.listeners.get("DOMContentLoaded")();
  assert.equal(unavailableRuntime.document.documentElement.getAttribute("data-mullu-eye-helper-boot"), "unavailable");
  assert.equal(
    unavailableRuntime.document.documentElement.getAttribute("data-mullu-eye-helper-error"),
    "Mullu Eye Helper bundle is unavailable.",
  );

  const failedRuntime = makeInstallRuntime({
    readyState: "complete",
    helper: {
      install() {
        throw new Error("install blocked");
      },
    },
  });
  assert.throws(() => vm.runInContext(install, failedRuntime.context), /install blocked/);
  assert.equal(failedRuntime.document.documentElement.getAttribute("data-mullu-eye-helper-boot"), "failed");
  assert.equal(
    failedRuntime.document.documentElement.getAttribute("data-mullu-eye-helper-error"),
    "Mullu Eye Helper install failed.",
  );
}

function testTargetPacketAndEvidenceContract() {
  assert.ok(bundle.includes("function buildTargetPacket"));
  assert.ok(bundle.includes("targetId"));
  assert.ok(bundle.includes("confidence: Number"));
  assert.ok(bundle.includes("evidence.push(\"metadata\")"));
  assert.ok(bundle.includes("evidence.push(\"visible-text\")"));
  assert.ok(bundle.includes("helperMetadata: clampText(helperMetadata, 420)"));
  assert.ok(bundle.includes("type: \"mullu.helper.inspect\""));
  assert.ok(bundle.includes("function stableHash"));
}

function testModeAwareGuideContract() {
  assert.ok(bundle.includes("HELPER_MODES"));
  assert.ok(bundle.includes("public-guide"));
  assert.ok(bundle.includes("proof-lens"));
  assert.ok(bundle.includes("builder-inspect"));
  assert.ok(bundle.includes("function publicSummaryForPacket"));
  assert.ok(bundle.includes("function proofSummaryForPacket"));
  assert.ok(bundle.includes("function renderModeControls"));
  assert.ok(bundle.includes("state.mode === \"builder-inspect\""));
  assert.ok(bundle.includes("Switch to Builder Inspect for governed actions."));
  assert.ok(css.includes(".mullu-eye-helper-modes"));
  assert.ok(css.includes("button[aria-pressed=\"true\"]"));
}

function testAuthorityAndFailureGuards() {
  assert.ok(bundle.includes("input[type='password'], input[type='hidden']"));
  assert.ok(bundle.includes("if ((action?.risky || action?.requiresConfirmation) && state.confirmActionId !== actionId)"));
  assert.ok(bundle.includes("recordReceipt(actionId, packet, \"confirmation_required\")"));
  assert.ok(bundle.includes("blocked_stale_target"));
  assert.ok(bundle.includes("blocked_stale_pinned_target"));
  assert.ok(bundle.includes("Clipboard API is unavailable for this browser context."));
  assert.equal(bundle.includes("form.submit("), false);
  assert.equal(bundle.includes(".submit()"), false);
}

function testInteractionSurfaceContract() {
  assert.ok(bundle.includes("pin-target"));
  assert.ok(bundle.includes("reveal-target"));
  assert.ok(bundle.includes("copy-packet"));
  assert.ok(bundle.includes("copy-receipts"));
  assert.ok(bundle.includes("event.altKey && event.key === \"Enter\""));
  assert.ok(bundle.includes("document.addEventListener(\"focusin\""));
  assert.ok(bundle.includes("document.addEventListener(\"pointerleave\""));
  assert.ok(bundle.includes("global.addEventListener(\"resize\""));
  assert.ok(bundle.includes("function receipts()"));
}

function testVisualAndReducedMotionContract() {
  assert.ok(css.includes("@media (prefers-reduced-motion: reduce)"));
  assert.ok(css.includes("html.mullu-eye-helper-risky"));
  assert.ok(css.includes("html.mullu-eye-helper-pinned"));
  assert.ok(css.includes("html.mullu-eye-helper-scanning"));
  assert.ok(css.includes("html.mullu-eye-helper-keyboard-lock"));
  assert.ok(css.includes("@keyframes mullu-eye-helper-reveal-pulse"));
  assert.ok(css.includes("@keyframes mullu-eye-helper-search-saccade"));
  assert.ok(css.includes(".mullu-eye-helper-meta"));
}

function testReadmeVerificationContract() {
  assert.ok(readme.includes("Risky actions require a second confirmation."));
  assert.ok(readme.includes("Executable actions re-resolve the selector lock before acting and block stale DOM targets."));
  assert.ok(readme.includes("Escape closes the open panel first; Escape again deactivates helper mode."));
  assert.ok(readme.includes("prefers-reduced-motion: reduce"));
  assert.ok(readme.includes("node --check assets/helper/mullu-eye-helper-v3.bundle.js"));
  assert.ok(readme.includes("npm.cmd run validate:site"));
}

testBootAndHomepageMetadataContract();
testInstallExecutionContract();
testTargetPacketAndEvidenceContract();
testModeAwareGuideContract();
testAuthorityAndFailureGuards();
testInteractionSurfaceContract();
testVisualAndReducedMotionContract();
testReadmeVerificationContract();
console.log("Mullu Eye Helper contract tests passed");
