/*
Purpose: declare Mullusi homepage render sequencing and fallback recovery groups.
Governance scope: homepage lifecycle action order, fallback selector ownership, and controller drift prevention.
Dependencies: assets/runtime/homepage-controller.js action dispatcher and renderer adapter names exposed by homepage context.
Invariants: this module owns sequencing data only; it performs no DOM writes, fetches no data, and mutates no runtime state.
*/

(() => {
  const freezeList = (items) => Object.freeze([...items]);

  const lifecyclePlan = Object.freeze({
    visitStorageKey: "mullusi-visits",
    registryFallbackSelectors: freezeList([
      "[data-platform-layers]",
      "[data-request-flow]",
      "[data-platform-build-sequence]",
      "[data-product-questions]",
      "[data-proof-lanes]",
      "[data-interface-links]",
      "[data-release-stages]",
      "[data-future-domains]",
      "[data-product-registry-controls]",
      "[data-product-registry]",
      "[data-mullu-activity]",
    ]),
    siteFailureSelectors: freezeList([
      "[data-proof-lanes]",
      "[data-interface-links]",
      "[data-platform-layers]",
      "[data-request-flow]",
      "[data-platform-build-sequence]",
      "[data-product-questions]",
      "[data-service-grid]",
      "[data-service-tiers]",
      "[data-api-contracts]",
      "[data-flow-diagram]",
      "[data-evaluation-example]",
      "[data-system-status]",
      "[data-use-cases]",
      "[data-mullu-activity]",
      "[data-release-stages]",
      "[data-repository-handoff]",
      "[data-boundary-map]",
      "[data-release-machine]",
      "[data-metrics]",
    ]),
    siteRestoreSelectors: freezeList([
      "[data-platform-layers]",
      "[data-request-flow]",
      "[data-platform-build-sequence]",
      "[data-product-questions]",
      "[data-proof-lanes]",
      "[data-interface-links]",
      "[data-mullu-activity]",
      "[data-release-stages]",
    ]),
    registryFailureSelectors: freezeList([
      "[data-future-domains]",
      "[data-product-registry-controls]",
      "[data-product-registry]",
      "[data-repo-stats]",
      "[data-metrics]",
    ]),
    registryRestoreSelectors: freezeList([
      "[data-future-domains]",
      "[data-product-registry-controls]",
      "[data-product-registry]",
    ]),
    siteRenderActions: freezeList([
      "renderPlatformLayers",
      "renderRequestFlow",
      "renderPlatformBuildSequence",
      "renderProductQuestions",
      "renderProofLanes",
      "renderInterfaceLinks",
      "renderServices",
      "renderServiceTiers",
      "renderApiContracts",
      "renderEvaluationExample",
      "renderStatusBoard",
      "renderUseCases",
      "renderMulluActivity",
      "renderReleaseStages",
      "renderRepositoryHandoff",
      "renderFlowDiagram",
      "renderBoundaryMap",
      "renderReleaseMachine",
      "renderMetrics",
    ]),
    registryRenderActions: freezeList([
      "renderSnapshot",
      "renderFutureDomains",
      "renderProductRegistryControls",
      "renderProductRegistry",
      "renderFilters",
      "renderStats",
      "renderRepoGrid",
      "renderMetrics",
    ]),
    languageChangeActions: freezeList([
      "renderNews",
      "renderVisitMeter",
    ]),
  });

  window.MullusiHomepageLifecyclePlan = lifecyclePlan;
})();
