/*
Purpose: install the Mullu Eye Helper on the public homepage without inline executable script.
Governance scope: helper boot configuration and DOMContentLoaded timing.
Dependencies: assets/helper/mullu-eye-helper-v3.bundle.js.
Invariants: helper starts inactive, avoids coarse pointers by default, and keeps native text-field cursor behavior.
Test contract: run node --check assets/helper/mullu-eye-helper-v3.install.js.
*/

window.addEventListener("DOMContentLoaded", () => {
  if (!window.MulluEyeHelper) {
    throw new Error("Mullu Eye Helper bundle is unavailable.");
  }

  window.MulluEyeHelper.install({
    activeByDefault: false,
    eyeCursorOptions: {
      size: 0.86,
      smooth: 0.22,
      hideNativeCursor: true,
      restoreNativeOnText: true,
      enabledOnCoarsePointer: false,
    },
  });
});
