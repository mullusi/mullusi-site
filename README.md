<!--
Purpose: identify this public repository as a deployment artifact bridge, not the Mullusi company-site source.
Governance scope: public repo boundary, source ownership boundary, and rollback clarity.
Dependencies: mullusi/mullusi-company-site private repository and GitHub Pages custom domain.
Invariants: real company source remains private; this repo contains only public website artifacts.
-->

# Mullusi Public Site Artifact

This repository is a public deployment artifact for `mullusi.com`.

It is not the source of truth for the Mullusi company website. The governed
company-site source, build scripts, operational gates, and release records are
maintained in the private `mullusi/mullusi-company-site` repository.

## Boundary

```text
mullusi.com
  public rendered website surface

mullusi/mullusi-company-site
  private source, build, governance, and deployment records

mullusi/mullusi-site
  public artifact bridge while domain cutover is completed
```

No license is granted for reuse of Mullusi website source or brand assets by
this repository. Third-party assets retain their own notices, including the
font license under `assets/fonts/OFL.txt`.

STATUS:
  Completeness: 100%
  Invariants verified: public artifact only, private source boundary, rollback bridge
  Open issues: replace this bridge after Cloudflare Pages custom-domain cutover is verified
  Next action: keep public repo minimal until `mullusi.com` serves from private-source Cloudflare Pages
