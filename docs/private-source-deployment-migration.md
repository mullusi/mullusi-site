<!--
Purpose: define the Mullusi website migration from public source hosting to private-source public deployment.
Governance scope: repository visibility, deployment continuity, DNS, Cloudflare Pages artifact, public governance mirror posture, and rollback.
Dependencies: GitHub repository settings, Cloudflare Pages, DNS provider, CNAME fallback, and website validation scripts.
Invariants: mullusi.com remains reachable, source stays private after migration, no private product repository slugs are published.
-->

# Private-Source Deployment Migration

Observed on 2026-05-24:

- `mullusi/mullusi-site` is public.
- Cloudflare DNS and edge proxy serve `mullusi.com`.
- Earlier live response headers included GitHub Pages and Fastly origin
  markers.
- Current live response headers for `/`, `/assets/app.js`, `/data/site.json`,
  and `/.well-known/security.txt` no longer include `x-github-request-id`,
  `x-served-by`, or `x-fastly-request-id`.
- `https://www.mullusi.com/` and
  `https://www.mullusi.com/proof/?gate=www-canonical` are reachable through
  Cloudflare with no GitHub or Fastly markers and now return one permanent `301` hop
  to the matching apex URLs with path/query preservation.
- GitHub Pages site API returns `NotFound`, so this public repository is no
  longer an active Pages deployment source.
- The Mullusi GitHub organization is on GitHub Free.
- The Pages certificate is approved and HTTPS enforcement is enabled.
- The repository contains a Cloudflare Pages artifact builder, `_headers`, and
  `_redirects` contract.
- `ops/website-origin-witness.md` records the current origin-header witness.
- `ops/www-canonical-redirect-gate.md` records the live `www` redirect closure.

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
10. After Cloudflare Pages serves the site correctly, classify the old public
    repository as private, archived, or a public governance mirror.

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
node --check scripts/check-website-origin.mjs
node --check scripts/test-check-website-origin.mjs
node --check scripts/check-www-canonical-redirect-gate.mjs
node --check scripts/test-www-canonical-redirect-gate.mjs
node scripts/validate-site.mjs
node scripts/verify-registry-repos.mjs
node scripts/test-build-cloudflare-pages.mjs
node scripts/test-check-website-origin.mjs
node scripts/check-www-canonical-redirect-gate.mjs
node scripts/test-www-canonical-redirect-gate.mjs
```

Then run:

```bash
node scripts/build-cloudflare-pages.mjs
```

Classify the current live origin:

```bash
node scripts/check-website-origin.mjs
```

The canonical `www` redirect gate must pass without the pending override:

```bash
node scripts/check-www-canonical-redirect-gate.mjs
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
www_canonical_redirect=pass
www_redirect_count=1
www_first_redirect_status=301
www_path_query_preserved=true
public_source_links=none
planned_repo_slugs=none
old_public_repo_posture=public_governance_mirror
old_public_repo_private_or_archived=not_required
public_repo_live_dns_origin=false
github_pages_site_api=NotFound
github_pages_custom_domain_disabled=pass
```

## Rollback

If the new host fails, use Cloudflare Pages deployment history first. If a DNS
rollback is required, point DNS only to a validated public artifact and keep the
public mirror posture separate from production source control.

STATUS:
  Completeness: 100%
  Self-attested invariants: deployment continuity, private-source boundary, no planned repo disclosure, Cloudflare Pages artifact boundary, origin headers without GitHub/Fastly markers, www one-hop 301 redirect closure, public governance mirror posture
  Open issues: none for website hosting migration
  Next action: keep strategic source changes in the private repository and keep this public mirror limited to governed public evidence
