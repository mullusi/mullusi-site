# Mullusi Website

Static public website package for `mullusi.com`.

This package is designed for the current `mullusi/mullusi-site` GitHub Pages flow. It does not require a build step, package manager, framework, database, or server runtime.

## What is included

```text
.
|-- index.html                         # Public landing page
|-- CNAME                              # mullusi.com custom domain
|-- favicon.ico                        # Legacy browser favicon
|-- robots.txt                         # Crawl policy
|-- sitemap.xml                        # Search sitemap
|-- site.webmanifest                   # Browser/app icon manifest
|-- data/products.json                 # Product/repository registry
|-- data/site.json                     # Structured public site content
|-- assets/
|   |-- app.js                         # Repo search/filter renderer
|   |-- styles.css                     # Full visual system
|   |-- mullusi-icon.svg                # Square favicon/header icon
|   |-- mullusi-icon-32.png             # Browser PNG favicon fallback
|   |-- mullusi-icon-180.png            # Apple touch icon
|   |-- mullusi-icon-192.png            # Web app manifest icon
|   |-- mullusi-icon-512.png            # Web app manifest icon
|   |-- mullusi-icon-transparent.svg    # Transparent icon variant
|   |-- mullusi-logo.svg                # Horizontal public logo
|   `-- mullusi-mark.svg                # Legacy compact mark reference
`-- scripts/
    |-- validate-site.mjs              # Static validation gate
    `-- verify-registry-repos.mjs      # Public GitHub repo visibility check
```

## Public registry contract

`data/products.json` is the public source of truth for proof-safe repository cards and staged roadmap records.

Each public repository entry should use:

```json
{
  "name": "Mullusi Core",
  "repo": "mullusi/mullusi-core",
  "href": "https://github.com/mullusi/mullusi-core",
  "category": "Core",
  "status": "public",
  "summary": "Short visitor-facing description.",
  "tags": ["engine", "symbolic"]
}
```

Future products use `futureDomains` until the repository exists:

```json
{
  "name": "Mullusi Biology Engine",
  "slug": "biology",
  "plannedRepo": "mullusi-biology-engine",
  "status": "planned",
  "summary": "Causal biological structure engine..."
}
```

Private repositories are intentionally excluded from `systems`. Add a repository there only when it is safe for public exposure, reachable without authentication, and supported by public-safe claims.

Use `futureDomains` for planned domain engines and `privateIncubation` for public-safe descriptions of work that must remain private. Do not list private repository slugs, internal routes, credentials, deployment details, or unfinished product claims in the public registry.

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

## Deploy to GitHub Pages

1. Copy this package into the root of `mullusi/mullusi-site`.
2. Commit the files.
3. Push to `main`.
4. Confirm GitHub Pages is serving from the repository root.
5. Confirm DNS points `mullusi.com` to GitHub Pages and that the `CNAME` file remains present.

Commands:

```bash
git clone https://github.com/mullusi/mullusi-site.git
cd mullusi-site
cp -R /path/to/mullusi_website/* .
git add .
git commit -m "Create Mullusi public product website"
git push origin main
```

## Local preview

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

## Validation

```bash
node --check assets/app.js
node scripts/validate-site.mjs
```

The validation script checks required files, local links, `CNAME`, `robots.txt`, sitemap targets, product registry contracts, public-safe text, and secret-like patterns.

When product registry exposure changes, also verify that listed GitHub repositories are public and reachable:

```bash
node scripts/verify-registry-repos.mjs
```

## Update rule

When a new product repository is ready for public exposure, update only `data/products.json` first. The page will render the new card automatically.

Recommended public domain repo names:

- `mullusi-math-engine`
- `mullusi-biology-engine`
- `mullusi-chemistry-engine`
- `mullusi-music-engine`
- `mullusi-unified-science-lab`

## Contact routing

Public website contact is currently `mullusiofficial@gmail.com`.

Use `social@mullusi.com` for social media platform ownership, verification messages, and platform notices. Keep it separate from public website contact unless the site intentionally exposes a social-team address.

Use `research@mullusi.com` for research conversations and `tamirat@mullusi.com` for named stewardship access.

## Governance boundary

The site presents public claims only. Keep launch claims separate from research claims, and keep private/internal repos out of `systems` until they are deliberately published.
