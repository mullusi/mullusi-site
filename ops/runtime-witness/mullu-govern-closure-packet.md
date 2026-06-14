<!--
Purpose: record the public-safe product runtime witness closure packet for Mullu Govern.
Governance scope: product runtime witness evidence, product-status promotion boundary, health observations, rollback readiness, privacy/contract evidence, and public claim blocking.
Dependencies: ops/runtime-witness/registry.json, products/mullu-govern/product.manifest.json, ops/api-exposure-witness.md, ops/api-production-readiness-gate.md, and public api.mullusi.com probes.
Invariants: no host address, provider account id, credential value, database URL, billing detail, raw header, raw response body, or token value is stored in this file.
-->

# Mullu Govern Runtime Witness Closure Packet

This packet answers one question:

```text
Can the Mullu Govern product runtime witness be closed now?
```

Current answer:

```text
product_id=mullu-govern
packet_state=AwaitingEvidence
candidate_state=SelectedNotPromoted
api_gateway_exposure_state=SolvedVerified
product_status=limited-preview
product_registry_status=awaiting-evidence
runtime_witness_registry_state=AwaitingEvidence
runtime_witness_closure_allowed=false
product_claims_allowed=false
write_route_decision=ops/mullu-govern-evaluate-write-route-decision.md
public_beta_approval_packet=ops/mullu-govern-public-beta-approval-packet.md
last_reviewed=2026-06-14
```

The shared API gateway is live and witnessed. The Mullu Govern product runtime
witness is not closed because closure would require a product-status promotion
decision plus product write-route exposure approval, privacy, dashboard, and
runtime witness evidence. The route-level rollback witness is now closed by
control-plane PR #1686 and mirrored in the public-beta approval packet.
Support readiness is closed by `ops/mullu-govern-support-readiness.md`.
Product-status preflight is ready in
`ops/mullu-govern-product-status-preflight.md`, but promotion remains blocked
until the public-beta approval packet supplies an explicit promotion approval
reference.
Privacy and retention preflight is ready in
`ops/mullu-govern-privacy-retention-preflight.md`, but activation remains
blocked until a later approval changes the policy and retention state.
API contract preflight is ready in
`ops/mullu-govern-evaluate-contract-preflight.md`, but live execution cases
remain blocked until the route is approved.

## Public-Safe Live Observations

Observed from public `https://api.mullusi.com` probes on 2026-06-14:

| Endpoint | HTTP state | Public-safe result |
| --- | --- | --- |
| `/health` | 200 | gateway healthy, persistent backing store available, responsibility debt clear |
| `/v1/health` | 200 | service health ok |
| `/gateway/witness` | 200 | runtime status healthy, gateway status healthy, open case count zero |
| `/runtime/conformance` | 200 | terminal status conformant, conformance class class_a, open conformance gaps empty |
| `/deployment/witness` | 200 | gateway, API, database, audit store, proof store checks pass |
| `/audit/verify` | 200 | governed audit verification valid |
| `/proof/verify` | 200 | runtime proof verification valid |
| `POST /v1/govern/evaluate` | 404 on safe product contract guard probe | product write route intentionally not published |

The observations above are evidence references, not raw evidence dumps. Raw
responses, signatures, provider host data, database URLs, headers, and secrets
are intentionally not stored here.

## Closure Gate

The registry closure rule requires all of the following:

| Gate | Required state | Current state |
| --- | --- | --- |
| Product manifest status | public-beta or production before public exposure | preflight Ready; current limited-preview |
| Runtime witness proofState | SolvedVerified | AwaitingEvidence |
| Runtime state | public-witness-ready or production-ready | private-only |
| Health evidence | pass with `/health`, `/gateway/witness`, `/runtime/conformance` observations | public gateway observations pass |
| Preflight decision | allow | block |
| Public exposure | allowed | blocked |
| Rollback | Ready | Ready via `ops/mullu-govern-public-beta-approval-packet.md` |
| Product API contract | verified or explicitly deferred | preflight Ready; live execution AwaitingEvidence |
| Privacy and retention boundary | verified for product runtime | preflight Ready; activation AwaitingEvidence |
| Dashboard operator readiness | verified | AwaitingEvidence |
| Support readiness | verified | Ready via `ops/mullu-govern-support-readiness.md` |
| Public write-route decision | approve or keep blocked with evidence | KeepBlocked in `ops/mullu-govern-evaluate-write-route-decision.md` |
| Public-beta approval packet | ReadyForApproval or stronger | AwaitingEvidence in `ops/mullu-govern-public-beta-approval-packet.md` |

## Blockers

```text
blocker=product_status_promotion_approval_missing
blocker=product_evaluate_write_route_approval_missing
blocker=product_api_contract_live_execution_not_published
blocker=product_privacy_boundary_not_verified
blocker=product_retention_boundary_not_verified
blocker=dashboard_operator_readiness_missing
blocker=runtime_witness_registry_not_closed
```

## Safe Next Action

1. Keep `mullu-govern` in `limited-preview`.
2. Keep the public `POST /v1/govern/evaluate` write route blocked unless
   `ops/mullu-govern-public-beta-approval-packet.md` is completed and approved
   in a separate PR.
3. Keep privacy and retention activation blocked until an explicit activation
   approval changes `privacy/govern.policy.json` and `privacy/govern.retention.json`.
4. Record explicit product-status promotion approval before moving
   `mullu-govern` from `limited-preview` to `public-beta`.
5. Only after those pass, update `ops/runtime-witness/registry.json` in a
   separate PR and rerun `node scripts/validate-runtime-witnesses.mjs`.

STATUS:
  Completeness: 100%
  Self-attested invariants: API gateway witness separated from product runtime witness, product status promotion not bypassed, public-safe evidence only, no raw secret or host values recorded
  Open issues: public-beta approval evidence, live API contract execution evidence, privacy activation approval, retention activation approval, dashboard operator readiness, product-status promotion approval
  Next action: keep the Mullu Govern public evaluate write route blocked unless the approval packet closes every gate
