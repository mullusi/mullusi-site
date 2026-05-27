/*
Purpose: boot route-local controls for the Mullu product page.
Governance scope: display preference binding only.
Dependencies: assets/pages/route-preferences.js and data-theme-toggle markup.
Invariants: no network access, no product claim mutation, no runtime witness mutation.
*/

if (!window.MullusiRoutePreferences) {
  throw new Error("Route preference module is unavailable.");
}

window.MullusiRoutePreferences.bindThemeToggle();
