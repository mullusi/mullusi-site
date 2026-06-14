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
last_reviewed=2026-06-14
```

The shared API gateway is live and witnessed. The Mullu Govern product runtime
witness is not closed because closure would require a product-status promotion
decision plus product-specific contract, privacy, rollback, dashboard, and
runtime witness evidence.

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
| `/v1/govern/evaluate` | 404 on safe GET probe | product contract route not verified |

The observations above are evidence references, not raw evidence dumps. Raw
responses, signatures, provider host data, database URLs, headers, and secrets
are intentionally not stored here.

## Closure Gate

The registry closure rule requires all of the following:

| Gate | Required state | Current state |
| --- | --- | --- |
| Product manifest status | public-beta or production before public exposure | limited-preview |
| Runtime witness proofState | SolvedVerified | AwaitingEvidence |
| Runtime state | public-witness-ready or production-ready | private-only |
| Health evidence | pass with `/health`, `/gateway/witness`, `/runtime/conformance` observations | public gateway observations pass |
| Preflight decision | allow | block |
| Public exposure | allowed | blocked |
| Rollback | Ready | AwaitingEvidence |
| Product API contract | verified | AwaitingEvidence |
| Privacy and retention boundary | verified for product runtime | AwaitingEvidence |
| Dashboard operator readiness | verified | AwaitingEvidence |

## Blockers

```text
blocker=product_status_promotion_decision_missing
blocker=product_api_contract_not_verified
blocker=product_privacy_boundary_not_verified
blocker=product_retention_boundary_not_verified
blocker=product_rollback_ready_missing
blocker=dashboard_operator_readiness_missing
blocker=runtime_witness_registry_not_closed
```

## Safe Next Action

1. Keep `mullu-govern` in `limited-preview`.
2. Define a safe contract probe for `POST /v1/govern/evaluate` that uses no
   private customer data and no secret values.
3. Verify the privacy and retention documents named by the manifest.
4. Create a product-specific rollback witness.
5. Decide whether `mullu-govern` may move from `limited-preview` to
   `public-beta`.
6. Only after those pass, update `ops/runtime-witness/registry.json` in a
   separate PR and rerun `node scripts/validate-runtime-witnesses.mjs`.

STATUS:
  Completeness: 100%
  Self-attested invariants: API gateway witness separated from product runtime witness, product status promotion not bypassed, public-safe evidence only, no raw secret or host values recorded
  Open issues: product contract probe, privacy boundary, retention boundary, rollback witness, dashboard operator readiness, product-status promotion decision
  Next action: define and run a safe product contract probe for Mullu Govern
