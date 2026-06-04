<!--
Purpose: define the Mullusi public-claim gate for website copy, structured data, and public routes.
Governance scope: Foundation Mode, published claims, evidence state, public route readiness, risk classification, and witness records.
Dependencies: docs/FOUNDATION_MODE.md, data/site.json, data/generated/products.json, proof route, deployment host, and validation scripts.
Invariants: no public claim ships without a status, evidence basis, exposure decision, and rollback path; Foundation Mode blocks access, deployment, endpoint-readiness, and customer-readiness claims.
-->

# Public Claim Gate

Every public sentence on `mullusi.com` must pass this gate before publication.
The gate protects the company boundary: public pages may describe visible
surfaces and staged intent, but must not expose private implementation,
unreleased architecture, internal repository names, deployment logic, or
patent-sensitive detail.

## Gate Record

```text
Claim:
  Exact public sentence or structured-data field.

Evidence:
  What already exists and where it can be witnessed.

Surface:
  Website route, docs route, public demo, proof route, or none.

Risk:
  Private source, IP disclosure, runtime overclaim, regulated-domain claim,
  security exposure, or none.

Status:
  Live | Staged | Private | AwaitingEvidence | Research | Archived

Decision:
  Publish | Reword | Hide | MovePrivate

Rollback:
  File or registry edit that removes the claim if evidence changes.
```

## Hard Blockers

- Foundation Mode blocks customer access, active pilot workflow, public runtime
  deployment, endpoint-readiness, and production service claims until explicit
  promotion evidence closes.
- Runtime availability claims are blocked until witness endpoints are reachable
  and published in the proof boundary.
- Product-readiness claims are blocked when the surface is only a roadmap,
  simulated demo, placeholder, or private incubation track.
- Regulated-domain claims are blocked unless reviewed and written as
  non-clinical, non-diagnostic, non-treatment, research-only language.
- Repository, deployment, secret, internal-route, and roadmap implementation
  details are blocked unless they are part of a deliberate public release.
- Patent-sensitive algorithms, kernels, datasets, benchmarks, or workflows are
  blocked until an IP decision is recorded.

## Allowed Public Posture

```text
Mullusi is preparing a governed foundation for high-risk symbolic work.
Local proof first.
Pilot access is not open yet.
Runtime claims remain AwaitingEvidence.
No customer access or deployment claim.
```

## Required Witness

Before publication, link each accepted claim to one of:

- A deployed public route under `mullusi.com`.
- A public docs route under a Mullusi domain.
- A proof-boundary entry with `AwaitingEvidence` or stronger status.
- A structured registry record in `data/site.json` or `data/generated/products.json`.
- A release record showing the claim is intentionally public.

STATUS:
  Completeness: 100%
  Self-attested invariants: claim status, evidence basis, risk decision, rollback path
  Open issues: none
  Next action: apply before each website copy or registry change
