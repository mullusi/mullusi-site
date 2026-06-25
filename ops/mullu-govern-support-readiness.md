<!--
Purpose: record public-safe support readiness evidence for Mullu Govern public-beta preparation.
Governance scope: support contact routing, incident intake, disclosure routing, fail-closed product write-route support, and no-secret evidence boundaries.
Dependencies: products/mullu-govern/product.manifest.json, contact/index.html, privacy/index.html, responsible-disclosure/index.html, .well-known/security.txt, and ops/mullu-govern-public-beta-approval-packet.md.
Invariants: this file does not publish POST /v1/govern/evaluate, mutate DNS, activate collection, promise a paid SLA, or record raw request bodies, response bodies, headers, tokens, host values, database URLs, or provider-private values.
-->

# Mullu Govern Support Readiness Witness

This witness answers one question:

```text
Is the support and incident path for future Mullu Govern public-beta users defined in public-safe repository evidence?
```

Current answer:

```text
product_id=mullu-govern
support_readiness_state=Ready
solver_outcome=SolvedVerified
proof_state=Pass
public_write_route_allowed=false
support_contact=support@mullusi.com
contact_route=/contact/
privacy_contact=support@mullusi.com
responsible_disclosure_route=/responsible-disclosure/
security_contact_metadata=/.well-known/security.txt
route_publication_action=none
dns_mutation=none
runtime_mutation=none
secret_rotation_required=false
last_reviewed=2026-06-25
```

## Evidence Ledger

| Evidence | Source | State |
| --- | --- | --- |
| Product support owner | `products/mullu-govern/product.manifest.json` declares `support@mullusi.com` | Pass |
| Public contact route | `contact/index.html` exposes `support@mullusi.com` through a mail link | Pass |
| Privacy contact | `privacy/index.html` routes privacy questions to `support@mullusi.com` | Pass |
| Security disclosure path | `.well-known/security.txt` publishes support and research contacts plus policy route | Pass |
| Responsible disclosure route | `responsible-disclosure/index.html` exists as the public policy path | Pass |
| Route publication boundary | `ops/mullu-govern-public-beta-approval-packet.md` keeps `public_write_route_allowed=false` | Pass |

## Incident Handling Boundary

```text
incident_intake=support@mullusi.com
security_intake=responsible-disclosure_route
initial_triage=classify_as_support_privacy_security_or_runtime
runtime_incident_action=keep_route_blocked_or_apply_rollback
rollback_ref=control-plane:pull/1686:scripts/validate_govern_evaluate_route_rollback.py
customer_sla=not_published
external_ticketing_system=not_claimed
```

This support readiness witness only proves that the public-safe intake and
incident routing path exists. It does not approve product exposure, activate
privacy collection, create a customer SLA, or claim that public-beta runtime
support is live.

STATUS:
  Completeness: 100%
  Self-attested invariants: public write route remains blocked, support path is public-safe, no raw secret or provider values recorded, no customer SLA claimed
  Open issues: operator approval, product-status promotion, API contract execution evidence, privacy activation, retention activation, runtime witness closure
  Next action: close privacy and retention activation preflight before requesting public-beta approval
