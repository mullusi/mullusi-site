<!--
Purpose: record public-safe dashboard operator readiness preflight evidence for Mullu Govern.
Governance scope: dashboard route reservation, operator-readiness claim blocking, public write-route blocking, approval-packet placeholder, and no-secret evidence.
Dependencies: products/mullu-govern/product.manifest.json, ops/mullu-govern-public-beta-approval-packet.md, and ops/runtime-witness/mullu-govern-closure-packet.md.
Invariants: this file is non-operative; it does not publish dashboard access, mutate auth, mutate DNS, publish routes, activate collection, or record provider-private values.
-->

# Mullu Govern Dashboard Operator Readiness Preflight

This preflight answers one question:

```text
Is the dashboard operator-readiness boundary explicit before Mullu Govern
public-beta exposure is approved?
```

Current answer:

```text
product_id=mullu-govern
dashboard_operator_readiness_preflight_state=Ready
solver_outcome=SolvedVerified
proof_state=Pass
dashboard_route=https://dashboard.mullusi.com/govern
dashboard_route_reserved=true
dashboard_live_claim_allowed=false
dashboard_operator_readiness_ref=missing
public_write_route_allowed=false
route_publication_action=none
dns_mutation=none
runtime_mutation=none
dashboard_auth_mutation=none
secret_rotation_required=false
provider_dashboard_values_recorded=false
last_reviewed=2026-07-02
```

The product manifest reserves the operator dashboard route, and the proof
boundary blocks dashboard operator-readiness claims until verified. This
preflight only proves the boundary exists and remains fail-closed.

## 2026-07-02 Public Probe Update

Public-safe status-only probes show the dashboard host is reachable while the
reserved Govern operator path is not currently exposed:

```text
command=curl status-only probes for https://dashboard.mullusi.com
dashboard_root_status=200
dashboard_govern_route_status=404
dashboard_operator_readiness_ref=missing
dashboard_live_claim_allowed=false
public_write_route_allowed=false
raw_response_bodies=not_recorded
raw_response_headers=not_recorded
secret_values=not_read
```

This update does not close dashboard operator readiness. It records that the
public host exists, but the reserved product operator path still lacks
authenticated readiness evidence.

## Gate Ledger

| Gate | Required for this preflight | Current evidence | State |
| --- | --- | --- | --- |
| Dashboard route | manifest route is the reserved Govern dashboard URL | `https://dashboard.mullusi.com/govern` | Pass |
| Claim boundary | dashboard operator readiness remains a blocked claim | `claimsBlockedUntilVerified` includes `dashboard operator readiness` | Pass |
| Approval packet | public-beta packet requires later dashboard readiness evidence | `dashboard_operator_readiness_ref=missing` | Pass |
| Public write route | evaluate route remains closed | `public_write_route_allowed=false` | Pass |
| Dashboard access | no live dashboard access claim is emitted | `dashboard_live_claim_allowed=false` | Pass |
| Auth/runtime/DNS | no auth, runtime, or DNS mutation is performed | mutation fields are `none` | Pass |

## Future Activation Envelope

Dashboard operator readiness may be used as public-beta evidence only after a
later approval packet supplies public-safe evidence that:

1. The dashboard route is reachable through the intended authenticated surface.
2. Operator access is scoped to approved Mullusi users.
3. Govern evaluation traces and proof records are visible without exposing raw
   secrets, provider-private values, or unapproved user data.
4. Failure and incident states route to the support path.
5. The public write route remains governed by the same approval packet.

## Non-Approval Rule

```text
if dashboard_operator_readiness_preflight_state == Ready:
  allow_next_action("collect_or_request_dashboard_readiness_evidence")
  deny_publication(reason="preflight_is_not_dashboard_readiness")
if dashboard_operator_readiness_ref == missing:
  deny_runtime_witness_closure(reason="dashboard_readiness_evidence_missing")
if dashboard_live_claim_allowed == false:
  deny_public_claim(reason="dashboard_live_claim_not_verified")
```

No secret value, raw dashboard screenshot text, account id, provider value,
token, database URL, private header, or raw user data may be used as dashboard
operator-readiness evidence in this public packet.

STATUS:
  Completeness: 100%
  Self-attested invariants: dashboard route remains reserved, live dashboard claim remains blocked, public write route remains blocked, no auth/DNS/runtime mutation, no raw secret or provider values recorded
  Open issues: dashboard operator-readiness evidence, operator approval, product-status promotion approval, live API contract execution evidence, privacy activation approval, retention activation approval, runtime witness closure
  Next action: keep dashboard operator readiness as AwaitingEvidence until a later approval packet supplies public-safe evidence
