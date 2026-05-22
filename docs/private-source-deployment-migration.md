<!--
Purpose: define the Mullusi website migration from public source hosting to private-source public deployment.
Governance scope: repository visibility, deployment continuity, DNS, public-source disclosure, and rollback.
Dependencies: GitHub repository settings, hosting provider, DNS provider, CNAME, and website validation scripts.
Invariants: mullusi.com remains reachable, source stays private after migration, no private product repository slugs are published.
-->

# Private-Source Deployment Migration

Observed on 2026-05-20:

- `mullusi/mullusi-site` is public.
- GitHub Pages serves `mullusi.com` from `main` and `/`.
- The Mullusi GitHub organization is on GitHub Free.
- The Pages certificate is approved and HTTPS enforcement is enabled.

## Constraint

Making the active GitHub Pages repository private before replacing the hosting
path can unpublish the current public website. Do not change repository
visibility until one of the migration paths below is ready.

## Migration Paths

### Path A: Private Source Host

Use a host that deploys public static sites from private repositories.

1. Create or select a private Mullusi source repository.
2. Push the validated website source to that private repository.
3. Connect the private repository to the host.
4. Configure `mullusi.com` and `www.mullusi.com`.
5. Verify HTTPS, redirects, `404.html`, `sitemap.xml`, `robots.txt`, and `.well-known/security.txt`.
6. Run:

```bash
node --check assets/app.js
node --check scripts/validate-site.mjs
node --check scripts/verify-registry-repos.mjs
node scripts/validate-site.mjs
node scripts/verify-registry-repos.mjs
```

7. After the new host serves the site correctly, make the old public repository
   private or archive it.

### Path B: GitHub Plan Upgrade

Use GitHub Pages from a private repository after the organization plan supports
that deployment mode.

1. Upgrade the Mullusi GitHub organization plan.
2. Confirm private-repository Pages support is active.
3. Make the website source repository private.
4. Confirm `mullusi.com` still serves the site.
5. Confirm Pages still uses the custom domain and HTTPS enforcement.

## Release Gate

Do not close this migration until all checks pass:

```text
site_local_validation=pass
registry_boundary_validation=pass
https_enforced=true
domain_verified=true
public_source_links=none
planned_repo_slugs=none
old_public_repo_private_or_archived=true
```

## Rollback

If the new host fails, restore DNS to the prior GitHub Pages target while the
public repository remains available. If the public repository has already been
made private, revert DNS only after confirming the prior Pages deployment is
still published.

STATUS:
  Completeness: 100%
  Invariants verified: deployment continuity, private-source boundary, no planned repo disclosure
  Open issues: choose host or upgrade plan
  Next action: select Path A or Path B before changing repository visibility
