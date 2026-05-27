/*
Purpose: boot the Mullusi proof boundary page.
Governance scope: display preference binding and proof renderer startup.
Dependencies: assets/pages/route-preferences.js, assets/pages/proof-renderer.js, generated proof/product/runtime JSON, and proof page markup.
Invariants: boot owns no proof rendering logic, no public claim renders outside generated proof decisions, and runtime closure remains data-driven.
*/

if (!window.MullusiRoutePreferences) {
  throw new Error("Route preference module is unavailable.");
}
if (!window.MullusiProofRenderer) {
  throw new Error("Proof renderer module is unavailable.");
}

window.MullusiRoutePreferences.bindThemeToggle();
window.MullusiProofRenderer.init();
