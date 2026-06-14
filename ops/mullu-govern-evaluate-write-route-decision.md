<!--
Purpose: record the public-safe decision boundary for the Mullu Govern evaluate write route.
Governance scope: product-status promotion, public write-route exposure, privacy boundary, retention boundary, rollback readiness, runtime witness closure, and operator approval.
Dependencies: products/mullu-govern/product.manifest.json, privacy/govern.policy.json, privacy/govern.retention.json, ops/runtime-witness/mullu-govern-closure-packet.md, ops/runtime-witness/registry.json, and api.mullusi.com public-safe route probes.
Invariants: no raw request body, response body, header, token, host address, database URL, account id, or provider value is recorded in this file.
-->

# Mullu Govern Evaluate Write Route Decision

This record answers one question:

```text
Should public POST access to /v1/govern/evaluate be enabled now?
```

Current answer:

```text
product_id=mullu-govern
route=POST /v1/govern/evaluate
decision_state=KeepBlocked
solver_outcome=AwaitingEvidence
proof_state=Unknown
public_write_route_allowed=false
product_status=limited-preview
api_gateway_exposure_state=SolvedVerified
runtime_witness_closure_allowed=false
approval_packet=ops/mullu-govern-public-beta-approval-packet.md
last_reviewed=2026-06-14
```

The API gateway is public and witnessed. The product write route is a separate
boundary because it can accept evaluation requests, create traces, and produce
proof or audit records. That boundary remains blocked until product-specific
privacy, retention, contract, and runtime witness evidence
close.

## Decision Matrix

| Gate | Required before exposure | Current state | Decision |
| --- | --- | --- | --- |
| Product status | `public-beta` or `production` | `limited-preview` | block |
| Public route guard | route remains closed before approval | `POST /v1/govern/evaluate` returns 404 | pass |
| Privacy boundary | collection allowed and user-facing policy active | preflight ready in `ops/mullu-govern-privacy-retention-preflight.md`; policy remains `collectionState=not-active` | block |
| Retention boundary | nonzero retention policy approved for each active data class | preflight ready in `ops/mullu-govern-privacy-retention-preflight.md`; all classes remain `not-active`, `maximumDays=0` | block |
| Runtime witness | `SolvedVerified` for product runtime | `AwaitingEvidence` | block |
| Rollback witness | route rollback documented and tested | control-plane PR #1686 witness merged and mirrored in `ops/mullu-govern-public-beta-approval-packet.md` | pass |
| Contract execution | request and response contract verified against public route | route intentionally not published | block |
| Support readiness | support path validated for route users | `ops/mullu-govern-support-readiness.md` | pass |
| Operator approval | explicit public write-route approval ref | missing | block |

## Non-Approval

This record is not an approval to publish the route. It is the opposite: a
bounded decision to keep the route closed until the missing evidence is supplied
in a later PR.

```text
approval_ref=none
route_publication_action=none
dns_mutation=none
secret_rotation_required=false
rollback_triggered=false
```

## Required Future Approval Packet

A later request to expose the route must supersede
`ops/mullu-govern-public-beta-approval-packet.md` from `AwaitingEvidence` to
`ReadyForApproval` or stronger, with all of the following:

1. Operator approval reference for public `POST /v1/govern/evaluate`.
2. Product status promotion decision from `limited-preview` to `public-beta` or stronger.
3. Active privacy policy for policy records, evaluations, traces, proof stamps, and audit events.
4. Active retention policy with bounded retention days for every collected data class.
5. Contract test evidence for accepted, rejected, malformed, unauthorized, and rate-limited requests.
6. Runtime witness evidence for health, gateway witness, runtime conformance, deployment witness, audit verification, and proof verification.
7. Rollback procedure that disables only the evaluate write route while preserving public gateway health routes; current witness ref is `control-plane:pull/1686:scripts/validate_govern_evaluate_route_rollback.py`.
8. Support and incident path for user-visible failures; current witness ref is `ops/mullu-govern-support-readiness.md`.

## Rollback Boundary

If a future approval accidentally publishes the route without the gates above,
the rollback action is:

```text
rollback_action=remove /v1/govern/evaluate from the public gateway allowlist
preserve_routes=/v1/health,/v1/version
preserve_dns=api.mullusi.com
record_incident=true
```

STATUS:
  Completeness: 100%
  Self-attested invariants: public API gateway remains separate from product write-route exposure, route publication remains blocked, privacy and retention not-active states are preserved, no raw secret or host values recorded
  Open issues: operator approval, product-status promotion, active privacy policy approval, active retention policy approval, contract execution evidence
  Next action: keep POST /v1/govern/evaluate blocked unless the public-beta approval packet closes every listed gate
