/*
Purpose: install the Mullu Eye Helper on public pages without inline executable script.
Governance scope: helper boot configuration, delayed bundle sensing, explicit boot failure state, and DOM readiness.
Dependencies: assets/helper/mullu-eye-helper-v3.bundle.js.
Invariants: helper starts inactive, avoids coarse pointers by default, keeps native text-field cursor behavior, and never fails silently.
Test contract: run node --check assets/helper/mullu-eye-helper-v3.install.js.
*/

(function installMulluEyeHelper(global) {
  "use strict";

  const BOOT_ATTRIBUTE = "data-mullu-eye-helper-boot";
  const ERROR_ATTRIBUTE = "data-mullu-eye-helper-error";
  const MAX_ATTEMPTS = 20;
  const RETRY_DELAY_MS = 100;

  function markBootState(state, errorMessage) {
    document.documentElement.setAttribute(BOOT_ATTRIBUTE, state);
    if (errorMessage) {
      document.documentElement.setAttribute(ERROR_ATTRIBUTE, errorMessage);
    } else {
      document.documentElement.removeAttribute(ERROR_ATTRIBUTE);
    }
  }

  function installHelper() {
    try {
      global.MulluEyeHelper.install({
        activeByDefault: false,
        eyeCursorOptions: {
          size: 0.86,
          smooth: 0.22,
          hideNativeCursor: true,
          restoreNativeOnText: true,
          enabledOnCoarsePointer: false,
        },
      });
      markBootState("installed", "");
    } catch (error) {
      markBootState("failed", "Mullu Eye Helper install failed.");
      throw error;
    }
  }

  function waitForHelper(attempt) {
    if (global.MulluEyeHelper?.install) {
      installHelper();
      return;
    }
    if (attempt >= MAX_ATTEMPTS) {
      markBootState("unavailable", "Mullu Eye Helper bundle is unavailable.");
      return;
    }
    markBootState("waiting", "");
    global.setTimeout(() => waitForHelper(attempt + 1), RETRY_DELAY_MS);
  }

  function bootWhenReady() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => waitForHelper(0), { once: true });
      return;
    }
    waitForHelper(0);
  }

  bootWhenReady();
})(window);
