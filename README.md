# Mullusi Website

Private-source public website package for `mullusi.com`.

This package is designed for a public website deployment whose source remains
controlled by Mullusi. It does not require a build step, package manager,
framework, database, or server runtime.

## What is included

```text
.
|-- index.html                         # Public landing page
|-- doctrine/index.html                # Public Doctrine v1.2 route
|-- mullu/index.html                   # Flagship Mullu product route
|-- search/index.html                  # Noindex Mullu Search route shell
|-- browse/index.html                  # Noindex Mullu Browse route shell
|-- proof/index.html                   # Public proof-boundary route
|-- playground/index.html              # Simulated (client-only) govern-evaluation demo
|-- 404.html                           # Branded not-found route
|-- _headers                           # Cloudflare Pages security and cache headers
|-- _redirects                         # Cloudflare Pages canonical redirects
|-- .nojekyll                          # GitHub Pages fallback for .well-known/
|-- .well-known/security.txt           # RFC 9116 disclosure contact
|-- CNAME                              # GitHub Pages fallback custom domain
|-- favicon.ico                        # Legacy browser favicon
|-- robots.txt                         # Crawl policy
|-- sitemap.xml                        # Search sitemap
|-- site.webmanifest                   # Browser/app icon manifest
|-- data/products.json                 # Product and public-surface registry
|-- data/manual/                       # Manual non-product public-surface sources
|-- data/generated/                    # Generated product manifest witnesses
|-- data/news.json                     # Cached Frontier Signal feed
|-- data/site.json                     # Structured public site content
|-- data/i18n.json                     # en/am translation dictionary
|-- products/                          # Product manifest authority records
|-- schemas/                           # Manifest and boundary schemas
|-- contracts/                         # Product API contract schemas
|-- docs/private-source-deployment-migration.md # Source-private hosting runbook
|-- ops/
|   |-- public-claim-gate.md          # Public copy and claim release gate
|   |-- repo-release-gate.md          # Repository visibility and license gate
|   |-- product-release-gate.md       # Product surface readiness gate
|   |-- ip-disclosure-gate.md         # Technical disclosure and IP gate
|   |-- MULLUSI_INFRASTRUCTURE_ROOT.md # Public-safe infrastructure inventory
|   |-- api-runtime-host-path.md      # Provider-neutral API host path
|   |-- api-production-readiness-gate.md # api.mullusi.com go/no-go gate
|   |-- website-origin-witness.md     # Live website origin-header witness
|   |-- public-visibility-witness.md  # Public DNS and HTTPS visibility witness
|   |-- security-header-witness.md    # Live browser-control header witness
|   |-- search-indexing-witness.md    # Live crawl-surface and sitemap witness
|   |-- www-canonical-redirect-gate.md # www-to-apex redirect gate
|   |-- recovery-inventory-template.md # Private recovery inventory template
|   |-- recovery-completion-witness.md # Recovery completion state
|   `-- runtime-witness/               # Product runtime witness registry
|-- assets/
|   |-- app.js                         # Repo search/filter renderer
|   |-- styles.css                     # Full visual system
|   |-- fonts/
|   |   |-- noto-sans-symbols-2-math.woff2 # Scoped symbol font for Greek/math glyphs
|   |   `-- OFL.txt                    # SIL Open Font License witness
|   |-- mullusi-icon.svg                # Square favicon/header icon
|   |-- mullusi-icon-32.png             # Browser PNG favicon fallback
|   |-- mullusi-icon-180.png            # Apple touch icon
|   |-- mullusi-icon-192.png            # Web app manifest icon
|   |-- mullusi-icon-512.png            # Web app manifest icon
|   |-- mullusi-icon-transparent.svg    # Transparent icon variant
|   |-- mullusi-logo.svg                # Horizontal public logo (dark theme)
|   |-- mullusi-logo-light.svg          # Horizontal public logo (light theme)
|   `-- mullusi-mark.svg                # Legacy compact mark reference
`-- scripts/
    |-- build-cloudflare-pages.mjs     # Builds the public Cloudflare Pages artifact
    |-- generate-platform.mjs          # Generates product manifest artifacts
    |-- validate-manifests.mjs         # Validates product manifest authority
    |-- test-build-cloudflare-pages.mjs # Verifies artifact source-boundary rules
    |-- test-validate-site-doctrine-wording.mjs # Tests Doctrine wording gate coverage
    |-- check-search-indexing-surface.mjs # Compares local sitemap to live crawl surfaces
    |-- test-check-search-indexing-surface.mjs # Tests search-surface gate behavior
    |-- check-website-origin.mjs       # Classifies live origin response headers
    |-- test-check-website-origin.mjs  # Tests origin-header classification
    |-- check-public-visibility.mjs    # Checks public DNS, HTTPS, TLS, and www routing
    |-- test-check-public-visibility.mjs # Tests visibility gate behavior
    |-- check-live-security-headers.mjs # Checks live browser-control response headers
    |-- test-check-live-security-headers.mjs # Tests live security-header gate behavior
    |-- check-www-canonical-redirect-gate.mjs # Evaluates www redirect closure
    |-- test-www-canonical-redirect-gate.mjs # Tests www redirect gate logic
    |-- fetch-news.mjs                 # Deterministic Frontier Signal refresh
    |-- validate-site.mjs              # Static validation gate
    `-- verify-registry-repos.mjs      # Public registry source-boundary check
```

## Public Registry Contract

The homepage loads product rows from
`data/generated/homepage-product-registry.json` and non-product public lists
from `data/manual/public-surfaces.json`. `data/products.json` is the generated
legacy-compatible public projection so older consumers keep a stable URL while
the source of truth stays manifest/manual-owned. Neither file may disclose
private repository slugs, internal routes, credentials, deployment details, or
unfinished product claims.

Each public surface entry should represent a deployed, visitor-safe surface:

```json
{
  "name": "Mullusi Website",
  "href": "https://mullusi.com",
  "category": "Website",
  "status": "deployed",
  "sourceState": "private-source",
  "summary": "Short visitor-facing description.",
  "tags": ["website", "public-boundary", "private-source"]
}
```

Future products use `futureDomains` until the public contract, route, and proof
boundary are ready:

```json
{
  "name": "Mullusi Biology Engine",
  "slug": "biology",
  "status": "planned",
  "releaseBoundary": "private incubation",
  "summary": "Causal biological structure engine..."
}
```

Private repositories are intentionally excluded from `systems`. Add a surface
there only when it is deployed, safe for public exposure, reachable without
authentication, and supported by public-safe claims.

Use `futureDomains` for planned domain engines and `privateIncubation` for
public-safe descriptions of work that must remain private.

## Product Manifest Authority

New product families should start in `products/<product-id>/product.manifest.json`.
The manifest owns the product identity, routes, API contracts, data classes,
privacy boundary, proof boundary, runtime service, release gates, homepage
presentation fields, and generation flags. Generated files under
`data/generated/` are derived witnesses and must not be edited by hand.

Current manifest coverage:

```text
data/generated/migration-coverage.json records all current product-registry
entries as covered by product manifests. Mullu Browse is an additional
private-incubation manifest candidate.
```

The manifest generator emits:

```text
data/products.json
data/generated/products.json
data/generated/status.json
data/generated/proof-index.json
data/generated/api-registry.json
data/generated/homepage-cards.json
data/generated/homepage-product-registry.json
data/generated/docs-index.json
data/generated/release-checklists.json
data/generated/migration-coverage.json
data/generated/product-registry-parity.json
data/generated/public-surface-parity.json
data/generated/products-compat.json
data/generated/runtime-witness-index.json
data/generated/sitemap.xml
```

Private-incubation products may appear in generated blocked records, but they do
not enter generated public homepage cards or generated sitemap candidates until
their release state permits public exposure.
`search/index.html` and `browse/index.html` are noindex route shells for
manifest, API, privacy, proof, and release-gate visibility only. They do not
claim endpoint readiness, production quality, live browsing, or public product
availability, and they do not enter the sitemap while the manifests remain
private-incubation.
`data/generated/homepage-product-registry.json` is the product-card source for
the homepage. `data/generated/products-compat.json` preserves the previous
combined registry shape as generated internal compatibility output, but it is
not included in the Cloudflare Pages artifact.
`data/products.json` preserves the old public registry shape as generated
compatibility output. `data/generated/product-registry-parity.json` records
legacy-field parity for product rows, and
`data/generated/public-surface-parity.json` records parity between
`data/manual/public-surfaces.json` and the generated compatibility projection.
The homepage no longer reads the temporary combined compatibility wrapper.

## Runtime Witness Authority

Runtime witness state is now explicit:

```text
ops/runtime-witness/registry.json
schemas/runtime-witness.schema.json
data/generated/runtime-witness-index.json
```

Every product with `runtimeWitnessRequired: true` must have one witness row that
matches its manifest id, manifest path, and runtime service. The witness row
records control-plane requirement, service health evidence state, required
health endpoints, production preflight decision, public exposure decision,
rollback state, and lineage.

Promotion rule:

```text
No public-beta, production, endpoint-readiness, or runtime-quality claim unless:
proofState = SolvedVerified
health.evidenceState = pass
preflight.decision = allow
publicExposure.allowed = true
rollback.state = Ready
required endpoints = /health, /gateway/witness, /runtime/conformance
```

All current product witnesses are intentionally `AwaitingEvidence`, so the
generated runtime witness index keeps public exposure blocked until signed
service health observations are collected.

Commands:

```bash
node scripts/validate-manifests.mjs
node scripts/validate-runtime-witnesses.mjs
node scripts/generate-platform.mjs
node scripts/generate-platform.mjs --check
```

The CI drift gate runs `node scripts/generate-platform.mjs --check`. If a
manifest change modifies generated output, commit the regenerated artifacts in
the same change.

## Operating Gates

The `ops/` directory is the public-boundary control plane for this website
package:

- `ops/public-claim-gate.md` governs every public sentence and structured-data
  claim before publication.
- `ops/repo-release-gate.md` keeps repositories private by default and defines
  when a public release is intentional.
- `ops/product-release-gate.md` controls when staged products become public
  surfaces.
- `ops/ip-disclosure-gate.md` blocks implementation disclosure until release or
  protection posture is decided.
- `ops/MULLUSI_INFRASTRUCTURE_ROOT.md` records the public-safe root
  infrastructure inventory and recovery-hardening gate.
- `ops/api-runtime-host-path.md` selects the first provider-neutral
  `api.mullusi.com` runtime host path.
- `ops/api-production-readiness-gate.md` blocks `api.mullusi.com` DNS until
  recovery, host, database, preflight, and rollback evidence exist.
- `ops/website-origin-witness.md` records the current Cloudflare edge origin
  header witness for the public website without changing API readiness.
- `ops/public-visibility-witness.md` records public DNS resolver, HTTPS, TLS,
  `www` canonical route evidence, and optional external regional probes while
  keeping the universal all-user claim `AwaitingEvidence`.
- `ops/security-header-witness.md` records the live browser-control header
  witness for CSP, HSTS, cross-origin boundaries, frame blocking, nosniff,
  referrer policy, permissions policy, and legacy cross-domain policy blocking.
- `ops/search-indexing-witness.md` records the live robots, sitemap, route,
  canonical, and noindex crawl-surface witness without claiming search engine
  indexing state.
- `ops/www-canonical-redirect-gate.md` keeps the `www` canonical redirect
  open until live headers prove the host redirects to `https://mullusi.com/`
  with one permanent `301` hop and path/query preservation; it also defines
  the operator rule contract for Cloudflare enforcement.
- `ops/recovery-inventory-template.md` defines the private recovery inventory
  structure without storing recovery values in Git.
- `ops/recovery-completion-witness.md` records whether recovery hardening is
  complete enough to allow `api.mullusi.com` provisioning.

The static validator requires these files so deployment cannot silently drop the
boundary discipline.

## Service stack contract

`data/site.json` owns the public service ladder. Use `services` for hosted offers, developer packages, dashboards, inspection surfaces, validation endpoints, and enterprise deployment paths:

```json
{
  "name": "Mullusi Govern Cloud",
  "delivery": "hosted service",
  "status": "primary offer",
  "summary": "Hosted symbolic governance for constraint evaluation, causal verdicts, proof states, and append-only trace records.",
  "proofSurface": "api.mullusi.com"
}
```

The website renders these records into the Service Stack section. Keep npm packages as access tools and keep governed judgment, traces, proof stamps, and operational control on Mullusi service surfaces.

`serviceTiers` and `apiContracts` define the first Govern Cloud commercial/API boundary. Keep tiers public-facing and keep endpoint records concise:

```json
{
  "name": "Govern Evaluation",
  "route": "POST /v1/govern/evaluate",
  "host": "api.mullusi.com",
  "status": "core v1",
  "input": "project, action, symbols, constraints, context",
  "output": "verdict, proof state, violations, trace reference, repair actions, proof stamp eligibility",
  "summary": "Evaluates a proposed action or system state against Mullusi governance constraints and records a causal trace."
}
```

`evaluationExample` renders one illustrative governed evaluation (request,
verdict, violation, trace, repair, proof stamp) in the Govern Cloud section so
the abstract contract is tangible. It is **not** a live endpoint: the validator
requires its `disclaimer` to keep the `AwaitingEvidence` / "not a live
endpoint" boundary, and requires a parallel `am` translation (matching `steps`
length). Keep the example public-safe and illustrative only.

`statusBoard` and `useCases` in `data/site.json` render the system-status
panel and the use-case scenarios on the homepage (both `en`/`am`, gated by the
validator). `/playground/` is a self-contained route that simulates a govern
evaluation **entirely client-side** — it contacts no server and issues no
proof stamp. Keep it deterministic and clearly labelled "Simulated"; it must
not call or imply a live runtime while it stays AwaitingEvidence. `.nojekyll`
is retained so the GitHub Pages fallback serves `.well-known/security.txt`
as-is.

## Internationalization (i18n) contract

`data/i18n.json` is the public translation dictionary. The site ships English in
the static HTML (the no-JS and SEO default) and swaps to the selected language
at runtime, mirroring the theme system: the choice is stored in `localStorage`
under `mullusi-lang`, applied via `data-i18n` / `data-i18n-attr` hooks, and a
nav toggle flips it. A pre-paint script sets `<html lang>` early to avoid a
flash.

Contract:

- `meta.languages` must include `en` and `am`; `languageNames` must name both.
- Every entry in `strings` must provide a non-empty `en` **and** `am` value.
- Every `data-i18n` / `data-i18n-attr` key used in `index.html` must exist in
  `strings` (the validator fails the build otherwise — translation gaps are
  treated like any other silent gap).

Data-rendered sections (`data/site.json`, `data/manual/public-surfaces.json`, `data/generated/homepage-product-registry.json`) localize via an
optional `am` object on each record (and `amSteps` for the repository handoff).
When an `am` field is absent the renderer falls back to English, so partial
translation degrades gracefully rather than breaking the layout.

Add a language by extending `meta.languages`, `languageNames`, every `strings`
entry, and the `am`-style record fields, then wiring a toggle option. Keep
product names, code identifiers, routes, and state tokens (for example
`Mullu`, `Mfidel`, `AwaitingEvidence`, `/health`) untranslated.

## Deploy Public Site

1. Keep the source repository private unless Mullusi explicitly approves a
   public-source release.
2. Build the Cloudflare Pages artifact with `node scripts/build-cloudflare-pages.mjs`.
3. Configure Cloudflare Pages to use that command and publish `dist`.
4. Confirm DNS points `mullusi.com` and `www.mullusi.com` to the Cloudflare
   Pages project.
5. Keep this repository as a public governance mirror only; production source
   changes belong in `mullusi-company-site`.
6. Treat `CNAME` as a historical bridge marker unless GitHub Pages is
   explicitly re-enabled through a new release gate.

Commands:

```bash
node --check assets/app.js
node --check scripts/validate-site.mjs
node --check scripts/fetch-news.mjs
node --check scripts/build-cloudflare-pages.mjs
node --check scripts/generate-platform.mjs
node --check scripts/validate-manifests.mjs
node --check scripts/test-build-cloudflare-pages.mjs
node --check scripts/test-validate-site-doctrine-wording.mjs
node --check scripts/check-search-indexing-surface.mjs
node --check scripts/test-check-search-indexing-surface.mjs
node --check scripts/check-website-origin.mjs
node --check scripts/test-check-website-origin.mjs
node --check scripts/check-public-visibility.mjs
node --check scripts/test-check-public-visibility.mjs
node --check scripts/check-live-security-headers.mjs
node --check scripts/test-check-live-security-headers.mjs
node --check scripts/check-www-canonical-redirect-gate.mjs
node --check scripts/test-www-canonical-redirect-gate.mjs
node --check scripts/verify-registry-repos.mjs
node --check scripts/check-ops-gates.mjs
node --check scripts/test-ops-gates.mjs
node --check scripts/promote-recovery-witness.mjs
node --check scripts/test-promote-recovery-witness.mjs
node --check scripts/check-private-recovery-inventory.mjs
node --check scripts/test-private-recovery-inventory.mjs
node scripts/validate-site.mjs
node scripts/validate-manifests.mjs
node scripts/generate-platform.mjs --check
node scripts/test-build-cloudflare-pages.mjs
node scripts/test-validate-site-doctrine-wording.mjs
node scripts/test-check-search-indexing-surface.mjs
node scripts/test-check-website-origin.mjs
node scripts/test-check-public-visibility.mjs
node scripts/test-check-live-security-headers.mjs
node scripts/check-www-canonical-redirect-gate.mjs --allow-pending
node scripts/test-www-canonical-redirect-gate.mjs
node scripts/verify-registry-repos.mjs
node scripts/check-ops-gates.mjs
node scripts/test-ops-gates.mjs
node scripts/test-promote-recovery-witness.mjs
node scripts/check-private-recovery-inventory.mjs --allow-missing
node scripts/test-private-recovery-inventory.mjs
```

## Local preview

```bash
node scripts/build-cloudflare-pages.mjs
python3 -m http.server 8080 --directory dist
# open http://localhost:8080
```

## Validation

```bash
node --check assets/app.js
node --check scripts/validate-site.mjs
node --check scripts/build-cloudflare-pages.mjs
node --check scripts/generate-platform.mjs
node --check scripts/validate-manifests.mjs
node --check scripts/test-build-cloudflare-pages.mjs
node --check scripts/test-validate-site-doctrine-wording.mjs
node --check scripts/check-search-indexing-surface.mjs
node --check scripts/test-check-search-indexing-surface.mjs
node --check scripts/check-website-origin.mjs
node --check scripts/test-check-website-origin.mjs
node --check scripts/check-public-visibility.mjs
node --check scripts/test-check-public-visibility.mjs
node --check scripts/check-live-security-headers.mjs
node --check scripts/test-check-live-security-headers.mjs
node --check scripts/check-www-canonical-redirect-gate.mjs
node --check scripts/test-www-canonical-redirect-gate.mjs
node scripts/validate-site.mjs
node scripts/validate-manifests.mjs
node scripts/generate-platform.mjs --check
node scripts/test-build-cloudflare-pages.mjs
node scripts/test-validate-site-doctrine-wording.mjs
node scripts/test-check-search-indexing-surface.mjs
node scripts/test-check-website-origin.mjs
node scripts/test-check-public-visibility.mjs
node scripts/test-check-live-security-headers.mjs
node scripts/check-www-canonical-redirect-gate.mjs --allow-pending
node scripts/test-www-canonical-redirect-gate.mjs
node scripts/check-ops-gates.mjs
node scripts/test-ops-gates.mjs
node scripts/test-promote-recovery-witness.mjs
node scripts/check-private-recovery-inventory.mjs --allow-missing
node scripts/test-private-recovery-inventory.mjs
```

The validation scripts check required files, Cloudflare Pages `_headers` and
`_redirects`, local links, `CNAME`, `robots.txt`, sitemap targets, product
registry contracts, homepage hierarchy, doctrine publication contract, public visibility gate coverage, live security-header gate coverage, live search-surface gate coverage, repeated-caveat regressions,
product manifest authority, generated-artifact drift, symbol-font licensing and size budget, dynamic fallback behavior,
public-safe text, Mfidel-safe no-combining-mark text, mojibake,
secret-like patterns, recovery/API gate consistency, staged HSTS, and the
`dist` artifact source boundary when the generated artifact exists locally.

After Cloudflare Pages custom-domain activation, classify the live origin:

```bash
node scripts/check-website-origin.mjs
```

The origin checker accepts `https://mullusi.com/...` targets plus the governed
`https://www.mullusi.com/` and
`https://www.mullusi.com/proof/?gate=www-canonical` canonical-redirect witness
targets, and emits a sanitized witness record instead of raw response headers.

During migration, use `--allow-pending` so the command records GitHub fallback
evidence without blocking the shell:

```bash
node scripts/check-website-origin.mjs --allow-pending
```

To answer whether the website is publicly reachable at the edge, check public
DNS, HTTPS, TLS, and canonical routing:

```bash
node scripts/check-public-visibility.mjs
```

The visibility checker can close the bounded `public_edge_visibility` claim. It
keeps `global_all_users_claim=AwaitingEvidence` because finite probes cannot
prove every network path. To attach a public external regional sample without
making it mandatory in CI:

```bash
node scripts/check-public-visibility.mjs --external-check-host --check-host-max-nodes=6 --allow-pending
```

After security-header changes, verify that the live edge is serving the browser
control policy:

```bash
node scripts/check-live-security-headers.mjs
```

The checker validates the public root, `/security/`, and `security.txt` routes
for CSP, HSTS, frame blocking, cross-origin boundaries, nosniff, referrer
policy, permissions policy, and legacy cross-domain policy blocking without
recording raw header values.

After deploying sitemap or route changes, compare the local sitemap contract
against the live crawl surface:

```bash
node scripts/check-search-indexing-surface.mjs
```

Use `--allow-pending` only while recording a known propagation or cache gap. A
blocking result means the live edge is missing a local sitemap URL, serving a
non-2xx route, exposing a stale live sitemap entry, or returning a noindex
signal.

The public homepage must keep this product boundary explicit: Mullusi is the
company umbrella, Mullu is the flagship governed symbolic product, and live
runtime readiness stays AwaitingEvidence until witness endpoints are published
and validated.

When registry exposure changes, verify the public source-boundary contract:

```bash
node scripts/verify-registry-repos.mjs
```

## Asset cache busting

Cloudflare Pages `_headers` sets `assets/*` to `Cache-Control: max-age=600`,
so a returning visitor can otherwise get new `index.html` with a stale cached
`assets/app.js` (button visible, no handler). `index.html` references
`assets/app.js` and `assets/styles.css` with a `?v=` query; bump that token
whenever either asset changes so the new HTML forces a fresh fetch. The JSON
data files are fetched with `cache: "no-store"` and are also marked no-store
by `_headers`. Secondary routes currently use route-local inline CSS/JS, so
this cache token applies only to the main shared homepage assets.

## Update rule

When a new product surface is ready for public exposure, start with
`products/<product-id>/product.manifest.json`, add the required contract,
privacy, retention, and proof boundary files, then run
`node scripts/generate-platform.mjs`. During the compatibility phase, set
`presentation.compatibilityRegistry` in the manifest when it should appear in
the current homepage registry contract; do not edit `data/products.json` by
hand. Until then, keep it as a blocked manifest candidate or add public-safe
non-product roadmap language to `data/manual/public-surfaces.json`.

Internal naming candidates must stay out of public data until a public-source
release is intentionally approved.

## Licensing Boundary

This website source is proprietary unless a specific file says otherwise. The
root `LICENSE` is a source notice, not an open-source grant. Third-party font
licensing remains documented in `assets/fonts/OFL.txt`.

## Contact routing

Public website contact is currently `hello@mullusi.com`.

Use `social@mullusi.com` for social media platform ownership, verification messages, and platform notices. Keep it separate from public website contact unless the site intentionally exposes a social-team address.

Use `support@mullusi.com` for responsible security disclosure intake and
public-access issues. Use `research@mullusi.com` for research conversations and
`tamirat@mullusi.com` for named stewardship access.

## Governance boundary

The site presents public claims only. Keep launch claims separate from research claims, and keep private/internal repos out of `systems` until they are deliberately published.
