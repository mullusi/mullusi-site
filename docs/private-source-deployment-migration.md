<!--
Purpose: define the Mullusi website migration from public source hosting to private-source public deployment.
Governance scope: repository visibility, deployment continuity, DNS, Cloudflare Pages artifact, public-source disclosure, and rollback.
Dependencies: GitHub repository settings, Cloudflare Pages, DNS provider, CNAME fallback, and website validation scripts.
Invariants: mullusi.com remains reachable, source stays private after migration, no private product repository slugs are published.
-->

# Private-Source Deployment Migration

Observed on 2026-05-22:

- `mullusi/mullusi-site` is public.
- Cloudflare DNS and edge proxy serve `mullusi.com`.
- Live response headers still include GitHub Pages and Fastly origin markers.
- GitHub Pages still serves `mullusi.com` from `main` and `/`.
- The Mullusi GitHub organization is on GitHub Free.
- The Pages certificate is approved and HTTPS enforcement is enabled.
- The repository contains a Cloudflare Pages artifact builder, `_headers`, and
  `_redirects` contract.

## Constraint

Making the active GitHub Pages repository private before replacing the hosting
path can unpublish the current public website. Do not change repository
visibility until one of the migration paths below is verified.

## Migration Paths

### Path A: Cloudflare Pages Private Source Host

Use Cloudflare Pages to deploy the public static artifact from controlled
source.

1. Create or select a private Mullusi source repository.
2. Push the validated website source to that private repository.
3. Connect the private repository to Cloudflare Pages.
4. Set the build command to `node scripts/build-cloudflare-pages.mjs`.
5. Set the publish directory to `dist`.
6. Configure `mullusi.com` and `www.mullusi.com`.
7. Verify HTTPS, redirects, `404.html`, `sitemap.xml`, `robots.txt`, and `.well-known/security.txt`.
8. Verify public responses no longer include `x-github-request-id`,
   `x-served-by`, or `x-fastly-request-id`.
9. Keep GitHub Pages active only as rollback until Cloudflare Pages is
   verified.
10. After Cloudflare Pages serves the site correctly, make the old public
    repository private or archive it and disable the GitHub Pages custom domain.

### Path B: GitHub Plan Upgrade

Use GitHub Pages from a private repository after the organization plan supports
that deployment mode.

1. Upgrade the Mullusi GitHub organization plan.
2. Confirm private-repository Pages support is active.
3. Make the website source repository private.
4. Confirm `mullusi.com` still serves the site.
5. Confirm Pages still uses the custom domain and HTTPS enforcement.

## Local Verification

Run:

```bash
node --check assets/app.js
node --check scripts/validate-site.mjs
node --check scripts/verify-registry-repos.mjs
node --check scripts/build-cloudflare-pages.mjs
node --check scripts/test-build-cloudflare-pages.mjs
node scripts/validate-site.mjs
node scripts/verify-registry-repos.mjs
node scripts/test-build-cloudflare-pages.mjs
```

Then run:

```bash
node scripts/build-cloudflare-pages.mjs
```

The `dist` directory must contain website routes and Cloudflare Pages controls
only. It must not contain `backend`, `docs`, `ops`, `scripts`, `.github`,
`README.md`, `LICENSE`, or `CNAME`.

## Release Gate

Do not close this migration until all checks pass:

```text
site_local_validation=pass
registry_boundary_validation=pass
cloudflare_pages_artifact_validation=pass
https_enforced=true
domain_verified=true
cloudflare_pages_custom_domain=active
origin_headers_no_github=true
public_source_links=none
planned_repo_slugs=none
old_public_repo_private_or_archived=true
github_pages_custom_domain_disabled=true
```

## Rollback

If the new host fails, restore DNS to the prior GitHub Pages target while the
public repository remains available. If the public repository has already been
made private, revert DNS only after confirming the prior Pages deployment is
still published.

STATUS:
  Completeness: 90%
  Invariants verified: deployment continuity, private-source boundary, no planned repo disclosure, Cloudflare Pages artifact boundary
  Open issues: Cloudflare Pages custom-domain activation evidence, GitHub Pages origin disablement evidence
  Next action: activate Path A in Cloudflare Pages, verify headers, then disable GitHub Pages fallback
