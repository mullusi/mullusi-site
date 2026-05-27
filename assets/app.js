/*
Purpose: boot the Mullusi homepage runtime.
Governance scope: JavaScript-enabled marker, runtime context creation, substrate initialization, and controller handoff.
Dependencies: assets/runtime/homepage-context.js and its declared runtime, registry, and renderer dependencies.
Invariants: app boot owns no rendering, registry loading, product orchestration, or lifecycle sequencing logic.
*/

document.documentElement.classList.add("js-enabled");

if (!window.MullusiHomepageContext) {
  throw new Error("Homepage context module is unavailable.");
}

const homepageRuntime = window.MullusiHomepageContext.createHomepageRuntime();

homepageRuntime.substrateRuntime.initSubstrate({ qs: homepageRuntime.qs });
homepageRuntime.homepageController.initContent(homepageRuntime.controllerContext());
