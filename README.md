# Mullusi Website

Static public website package for `mullusi.com`.

This package is designed for the current `mullusi/mullusi-site` GitHub Pages flow. It does not require a build step, package manager, framework, database, or server runtime.

## What is included

```text
.
├── index.html              # Public landing page
├── CNAME                   # mullusi.com custom domain
├── robots.txt              # Crawl policy
├── sitemap.xml             # Search sitemap
├── data/products.json      # Product/repository registry
├── assets/
    ├── app.js              # Repo search/filter renderer
    ├── styles.css          # Full visual system
    └── mullusi-mark.svg    # Site icon / mark
└── scripts/
    └── validate-site.mjs   # Static validation gate
```

## Product registry contract

`data/products.json` is the public source of truth for website product cards.

Each public product entry should use:

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

Private repositories are intentionally excluded from the public registry. Add them only when they are safe for public exposure.

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

## Update rule

When a new product repository is created, update only `data/products.json` first. The page will render the new card automatically.

Recommended public domain repo names:

- `mullusi-math-engine`
- `mullusi-biology-engine`
- `mullusi-chemistry-engine`
- `mullusi-music-engine`
- `mullusi-unified-science-lab`

## Governance boundary

The site presents public claims only. Keep launch claims separate from research claims, and keep private/internal repos out of the public registry until they are deliberately published.
