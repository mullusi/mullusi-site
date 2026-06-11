<!--
Purpose: record closure of the homepage section boundary migration from index-coupled sections to manifest-owned public routes.
Governance scope: validate-site section placement, plain-language i18n keys, lifecycle fallback selectors, content-hash discipline, and section-migration rollback safety.
Dependencies: scripts/validate-site.mjs, scripts/test-validate-site-doctrine-wording.mjs, assets/runtime/homepage-lifecycle-plan.js, data/i18n.json, data/manual/homepage-section-routes.json, status.json, and ops/public-claim-gate.md.
Invariants: no public claim ships without status; section ownership is reviewable; old anchors keep a homepage handoff or a canonical route; route ownership is declared in the manifest.
-->

# Homepage Section Boundary Closure

**Status:** SolvedVerified. Closed 2026-06-11.

## Closure Record

The homepage section migration plan has been executed. The route
manifest now owns the moved sections as follows:

| Section | Route | Mirror PR |
| --- | --- | --- |
| `#sciences` | `/sciences/` | `mullusi-site#87` |
| `#repos` | `/surfaces/` | `mullusi-site#88` |
| `#architecture` | `/architecture/` | `mullusi-site#89` |
| `#governance` | `/about/` | `mullusi-site#90` |
| `#news` | `/news/` | `mullusi-site#91` |

Deploy-source ports were merged after the mirror changes and published
through the Cloudflare Pages workflow. The final public routes are
available at `mullusi.com`.

## Active Contract

The former contract was index-coupled: a governed claim had to exist
inside `index.html`. The active contract is surface-coupled: a governed
claim must exist on the route declared in
`data/manual/homepage-section-routes.json`.

The validator now checks:

1. The declared route resolves to a public HTML file.
2. The declared route contains the governed section id.
3. Any declared `titleKey` and `plainKey` appear in that route.
4. The declared i18n keys resolve for both supported languages.
5. Homepage ordering rules apply only to sections that still live on `/`.
6. Mobile/footer handoffs may point to dedicated routes for migrated sections.

## Preserved Invariants

- The public-claim gate remains unchanged.
- The honesty-pass wording remains checked by validation.
- Dynamic route content uses explicit load failures instead of silent fallback.
- `status.json`, `sitemap.xml`, `_redirects`, build allowlists, and validator
  inventories are updated with each public route.
- The homepage keeps compact handoffs for migrated sections where old scroll
  position or information scent still matters.

## Validation Evidence

Each route migration passed:

```text
node scripts/build-cloudflare-pages.mjs
node --check scripts/validate-site.mjs
git diff --check
node scripts/validate-site.mjs
node scripts/test-validate-site-doctrine-wording.mjs
node scripts/validate-architecture-boundaries.mjs
node scripts/test-validate-architecture-boundaries.mjs
node scripts/validate-checkpoint.mjs
```

Each deployed route was also verified with local and live browser checks for
route rendering, dynamic content where applicable, console errors, and mobile
overflow.

## Rollback Path

Rollback remains explicit:

1. Move the affected manifest entry back to `"/"`.
2. Restore the homepage section content.
3. Remove the dedicated route from `sitemap.xml`, `status.json`, `_redirects`,
   build allowlists, and validator inventories.
4. Recompute the homepage content hash.
5. Rerun the full validation gate before merge and deploy.

## Related

- `ops/public-claim-gate.md`
- `ops/repo-release-gate.md`
- `docs/mirror-to-deploy-port-runbook.md`
- `data/manual/homepage-section-routes.json`
