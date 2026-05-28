<!--
Purpose: scope the governance-kernel rewrite needed to permit homepage sections to migrate from index.html onto dedicated routes (/sciences/, /architecture/, /surfaces/, /about/, /news/), without weakening the public-claim contract.
Governance scope: validate-site index pinning, plain-language i18n keys, lifecycle-plan fallback selectors, content-hash discipline, and section-migration safety.
Dependencies: scripts/validate-site.mjs, scripts/test-validate-site-doctrine-wording.mjs, assets/runtime/homepage-lifecycle-plan.js, data/i18n.json, status.json content_hashes, and the existing public-claim-gate.
Invariants: no public claim ships without a status; section migration is reviewable; old anchors continue to resolve or redirect; the contract becomes "claim exists somewhere on the public site" rather than "claim exists on index.html".
-->

# Homepage Section Boundary Proposal

**Status:** Draft. AwaitingDoctrineApproval.

## Problem

The public homepage (`index.html`) is currently ~700 lines of dense
content across ~18 sections (hero, start, metrics, oldway, platform,
govern-cloud, use-cases, production-boundary, evidence, architecture,
interfaces, services, products, sciences, repos, roadmap, governance,
news, cta). Visitors face a long scroll where every section reads as
equal-weight; the IA cannot communicate which surfaces are live and
which are roadmap.

The straightforward fix — move late, lower-weight sections
(`#sciences`, `#repos`, `#architecture` pipe, governance/architect
note, `#news`) onto dedicated routes — is currently blocked by the
governance kernel. `scripts/validate-site.mjs` pins these sections to
`index.html` via several intentional invariants laid down in the
doctrine v1.2 honesty pass. The invariants protect against silent
drift; they were not designed to prevent IA evolution.

This document proposes how to keep the safety the invariants give us
while allowing the homepage to shed sections that have outgrown it.

## What Currently Pins Sections to index.html

```text
scripts/validate-site.mjs

3534  validateI18n() reads index.html only — undefined data-i18n keys
      on any other public HTML file are not detected.

3553  validateIndexDesignContract() is index-only:
3699    requires id="start" exists and appears before id="metrics"
3700    requires id="metrics" exists
3701    requires id="news" exists and appears after governance section
1711    requires id="production-boundary" exists
3731    requires data-i18n="hero.plain", "govern.plain", "evidence.plain",
        "architecture.plain", "products.plain", "sciences.plain",
        "governance.plain" — all on index.html

assets/runtime/homepage-lifecycle-plan.js

      staticFallbackTargets array enumerates data-* selectors that the
      validator (line 4045-4061) requires to be addressed by the
      lifecycle plan: [data-platform-layers], [data-request-flow],
      [data-platform-build-sequence], [data-product-questions],
      [data-proof-lanes], [data-interface-links], [data-release-stages],
      [data-future-domains], [data-product-registry-controls],
      [data-product-registry], [data-mullu-activity].

status.json

      content_hashes records the canonical hash of index.html and
      validate-site recomputes against the live file; any move of
      content out of index.html bumps the hash.

scripts/test-validate-site-doctrine-wording.mjs

      Asserts that certain doctrine phrases appear on index.html
      verbatim (governs the honesty pass copy from PR #65-#68).
```

## What the New Contract Should Assert

The current contract is _index-coupled_ ("this claim must exist on
`index.html`"). The proposed contract is _surface-coupled_ ("this
claim must exist on the public site, on the route declared in a
manifest").

```text
claim_manifest
  data/manual/homepage-section-routes.json (new)
  Maps each governed section by id to the route that owns it.
  Default: "/". Migration: a section can be moved by changing its
  manifest entry to a new route, and validate-site reads it from
  there instead.

  Example:
    {
      "sciences":   { "route": "/sciences/",   "plainKey": "sciences.plain" },
      "products":   { "route": "/",            "plainKey": "products.plain" },
      "architecture": { "route": "/architecture/", "plainKey": "architecture.plain" }
    }

validateSectionPlacement (renamed from validateIndexDesignContract)
  For each entry in claim_manifest:
    - Verify the route file exists in publicHtmlFiles.
    - Verify id="<section>" exists in that route's HTML.
    - Verify data-i18n="<plainKey>" exists in that route's HTML.
    - Verify the i18n key resolves in both en and am.
  Verify ordering only within the home route (#start before #metrics,
  #news after governance), not across routes.

validateI18n
  Walks every file in publicHtmlFiles, not just index.html, when
  computing referencedKeys. An undefined data-i18n on /sciences/ now
  fails validation the same way an undefined key on / does.

validateLocalLinks (already cross-file at line 1609)
  Already validates that anchor targets resolve on every public
  HTML file. No change needed.

status.json content_hashes
  Add a hash entry per route that owns a governed claim. The
  generate-platform.mjs script regenerates them on every build (or a
  new generate-content-hashes.mjs script does, scoped to public HTML
  and structured data).
```

## What Stays Unchanged

- The public-claim-gate (`ops/public-claim-gate.md`) — every claim still needs status / evidence / surface / risk / rollback. The split only changes _where_ the claim is rendered.
- The honesty-pass wording — verbatim sentences still must exist; the test just searches across all public HTML instead of only index.html.
- The doctrine v1.2 invariants — "no public claim ships without status, evidence basis, exposure decision, rollback path." Section migration is itself a claim move; it needs a rollback record (point the manifest back to `/`).

## Proposed Migration Plan

A two-step rollout proves the contract change works before any user-visible move:

```text
Step 1: refactor without moving anything
  - Land claim_manifest with every section pointing to "/".
  - Update validate-site.mjs to read placement from the manifest.
  - All tests pass; no HTML moves.
  - Validates the new validator on the existing layout.

Step 2: move one section
  - Pick #sciences (lowest user-traffic, clearest evidence boundary).
  - Create /sciences/index.html with the existing section HTML +
    required wrapper + the same `data-i18n` + plain keys.
  - Update claim_manifest: sciences.route = "/sciences/".
  - Remove the #sciences section from index.html.
  - Add a redirect rule in _redirects: /#sciences -> /sciences/
  - Update sitemap.xml to include /sciences/.
  - Validate: all tests still pass.
  - Browser-verify the new route renders.

Step 3+: repeat for #repos (→ /surfaces/), #architecture pipe
(→ /architecture/), governance/architect note (→ /about/), #news
(→ /news/). Each is its own PR with its own validation gate.
```

## Risks

```text
risk: lifecycle-plan fallback selectors
  Moving #sciences to /sciences/ removes the [data-future-domains]
  selector from index.html. The lifecycle plan still references it
  in siteRenderActions. Mitigation: the lifecycle plan must read the
  same claim_manifest and only register selectors that live on the
  current route.

risk: cross-route content drift
  Two routes could host the same section with different copy. The
  i18n cross-file walk catches the data-i18n side; copy outside of
  data-i18n could drift. Mitigation: extend
  test-validate-site-doctrine-wording.mjs to walk all public HTML
  for the pinned doctrine phrases, not just index.html.

risk: old deep links
  Anyone with /#sciences bookmarked gets dropped if we delete the id
  without redirecting. Mitigation: _redirects rule from /#fragment to
  /<route>/ before removal.

risk: SEO redistribution
  Splitting may dilute the homepage's keyword density. Mitigation:
  acceptable — the homepage as it exists is too dense for a clear
  signal anyway, and dedicated /architecture/ /sciences/ pages match
  long-tail queries better.

risk: governance kernel takes longer than the design payoff
  Mitigation: the design refresh shipped in #69/#23 already captures
  ~70% of the visual-hierarchy gain via in-place tier reassignment
  and font/spacing fixes. The split is the remaining 30%, not 100%.
  This proposal can sit at AwaitingDoctrineApproval indefinitely
  without blocking other work.
```

## Effort Estimate

```text
Step 1 (manifest + validator refactor):  ~half-day
Step 2 (move #sciences):                  ~2 hours, sets the pattern
Step 3+ (each subsequent section):        ~1 hour each

Total to migrate all 5 candidate sections: ~1 day
```

## Decision Surface

This document does not authorize implementation. It records the
proposal so the doctrine conversation has a concrete artifact to
read, edit, accept, or reject.

If accepted, Step 1 should be its own PR with no HTML moves — just
the contract refactor — and should be reviewable as a pure governance
change.

If rejected, this document records that the homepage IA is
intentionally locked to the current shape, and design proposals that
require section migration should be turned down explicitly.

## Related

- `ops/mullusi-doctrine.md` — overall doctrine
- `ops/public-claim-gate.md` — what every claim must satisfy
- `ops/repo-release-gate.md` — when a private surface becomes public
- `docs/mirror-to-deploy-port-runbook.md` — how this proposal, once accepted, would reach mullusi.com
- `mullusi-site#69` — the design refresh that proved the IA need
