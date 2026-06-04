# Mullusi Website Foundation Mode

Purpose: define the public website boundary while Mullusi is still in solo-founder preparation.
Governance scope: public copy, pilot boundary, contact wording, proof-state claims, deployment restraint, and assistant handoff.
Dependencies: `index.html`, `mullu/index.html`, `pilot/index.html`, `contact/index.html`, `status/index.html`, `docs/FOUNDATION_PREREQUISITES.md`, `ops/solo-developer-assistant-handoff.md`, and `scripts/validate-site.mjs`.
Invariants: local proof first, no customer-access claim, no deployment claim, no active pilot invitation, and runtime claims stay `AwaitingEvidence` until signed evidence closes.

## Current State

The external witness blockers belong to product/runtime release claims. They do not block the current static `mullusi.com` website, public routes, proof boundary, status route, or foundation copy from being published.

| Surface | Allowed public state | Blocked claim |
| --- | --- | --- |
| `mullusi.com` | Published static website and foundation route | Live governed runtime |
| `/mullu/` | Foundation-stage product direction | Customer-ready product |
| `/pilot/` | Pilot boundary only | Open pilot access |
| `/contact/` | Foundation, research, support questions | Sales, access, or pilot workflow |
| `api.mullusi.com` | Reserved and `AwaitingEvidence` | Public endpoint readiness |
| `dashboard.mullusi.com` | Reserved | Live operator dashboard |
| `sandbox.mullusi.com` | Reserved | Public sandbox availability |

## Allowed Public Copy

Use wording like:

- "Foundation before launch."
- "Local proof first."
- "Static website published; product runtime release witnesses AwaitingEvidence."
- "Runtime claims AwaitingEvidence."
- "No customer access or deployment claim."
- "Pilot access is not open yet."
- "Review proof boundary."
- "Contact for foundation-stage questions."

## Blocked Public Copy

Do not use wording that implies readiness, access, or external operation before the evidence exists:

- "Request access"
- "Start pilot email"
- "Request pilot access"
- "private beta"
- "customer access is open"
- "production-ready"
- "live endpoint"
- "deployed runtime"
- "public sandbox is available"

If a future change needs one of these meanings, the route must first have a closed witness, written scope, rollback path, and explicit public-claim update.

## Prerequisite Ladder

See [Foundation Prerequisites](FOUNDATION_PREREQUISITES.md) for the public-safe
wording boundary that keeps preparation visible without exposing private
account, credential, DNS, provider, or legal-detail evidence.

1. Stabilize account recovery, domain recovery, and source-control recovery.
2. Keep legal, trademark, company, and support boundaries explicit.
3. Pick one narrow local proof thread.
4. Produce repeatable local verdict, trace, repair, and rollback evidence.
5. Close runtime health, gateway, conformance, rollback, and security witnesses.
6. Update proof and status routes before expanding product copy.
7. Decide separately whether a pilot is open, scoped, written, reversible, and supportable.

## Assistant Protocol

Before claiming closure on public website work:

1. Keep `/pilot/` as a boundary route unless the user explicitly asks to open a governed pilot and the evidence gates pass.
2. Keep `/contact/` as a question route, not a sales or access route.
3. Keep generated files generated; do not edit `data/generated/*` by hand.
4. Run `node scripts/build-cloudflare-pages.mjs` when public static files change.
5. Run `npm.cmd run validate:site` and `npm.cmd test` on Windows PowerShell.
6. State clearly whether changes are local only, committed, pushed, or deployed.

STATUS:
  Completeness: 100%
  Invariants verified: local proof first, no active pilot access, no runtime deployment claim, AwaitingEvidence boundary
  Open issues: external evidence remains uncollected until the user intentionally prepares deployment prerequisites
  Next action: keep this document synchronized with public copy and validation gates
