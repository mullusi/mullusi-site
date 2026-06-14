<!--
Purpose: record public-safe product-status promotion preflight evidence for Mullu Govern.
Governance scope: limited-preview preservation, public-beta promotion boundary, release-gate ordering, public write-route blocking, runtime closure blocking, approval-packet placeholders, and no-secret evidence.
Dependencies: products/mullu-govern/product.manifest.json, ops/mullu-govern-public-beta-approval-packet.md, ops/mullu-govern-evaluate-write-route-decision.md, ops/runtime-witness/mullu-govern-closure-packet.md, scripts/validate-govern-public-beta-approval-packet.mjs, scripts/validate-govern-evaluate-write-route-decision.mjs, and scripts/validate-govern-runtime-closure-packet.mjs.
Invariants: this file is non-operative; it does not promote product status, publish routes, mutate DNS, activate privacy or retention, rotate secrets, or record provider-private values.
-->

# Mullu Govern Product Status Preflight

This preflight answers one question:

```text
Is the product-status promotion boundary ready to be evaluated without changing
Mullu Govern from limited-preview to public-beta?
```

Current answer:

```text
product_id=mullu-govern
product_status_preflight_state=Ready
solver_outcome=SolvedVerified
proof_state=Pass
product_status_current=limited-preview
product_status_target=public-beta
product_status_promotion_allowed=false
product_status_promotion_ref=missing
public_write_route_allowed=false
route_publication_action=none
dns_mutation=none
runtime_mutation=none
secret_rotation_required=false
public_beta_claim_allowed=false
last_reviewed=2026-06-14
```

The manifest already contains the allowed promotion path:

```text
private-incubation -> internal-alpha -> limited-preview -> public-beta -> production
```

This preflight only proves the boundary is explicit and fail-closed. It does
not approve promotion, does not change `products/mullu-govern/product.manifest.json`,
and does not publish `POST /v1/govern/evaluate`.

## Gate Ledger

| Gate | Required for this preflight | Current evidence | State |
| --- | --- | --- | --- |
| Product identity | manifest id is `mullu-govern` | `products/mullu-govern/product.manifest.json` | Pass |
| Current status | manifest remains `limited-preview` during preflight | `status=limited-preview` | Pass |
| Target status | next promotion target is `public-beta` | promotion path contains `limited-preview -> public-beta` | Pass |
| Required release gates | route, docs, contract, privacy, runtime witness, rollback, support, and status are listed | `releaseGate.required` includes all required gates | Pass |
| Approval packet | public-beta packet remains non-operative | `product_status_promotion_ref=missing` | Pass |
| Public route | evaluate write route remains closed | `public_write_route_allowed=false` | Pass |
| Validator aggregate | approval packet, write-route decision, and runtime closure packet validators pass while blocking publication | aggregate validator results are `SolvedVerified` and `Pass`; public write route, runtime closure, and product claims remain false | Pass |
| Runtime/DNS mutation | no runtime or DNS mutation is performed | `runtime_mutation=none`, `dns_mutation=none` | Pass |
| Public claim | no public-beta claim is emitted | `public_beta_claim_allowed=false` | Pass |

## Future Promotion Envelope

Promotion from `limited-preview` to `public-beta` must remain blocked until a
later approval packet supplies public-safe evidence for every open gate:

1. Operator approval for public `POST /v1/govern/evaluate`.
2. Product-status promotion approval reference.
3. Live API contract execution evidence for accepted, rejected, malformed,
   unauthorized, and rate-limited cases.
4. Privacy activation approval for named data classes.
5. Retention activation approval for every collected data class.
6. Runtime witness closure as `SolvedVerified`.
7. Public claim update that stays bounded to verified evidence.

## Non-Approval Rule

```text
if product_status_preflight_state == Ready:
  allow_next_action("request_or_record_promotion_approval")
  deny_publication(reason="preflight_is_not_promotion")
if product_status_promotion_ref == missing:
  deny_status_change(reason="promotion_approval_missing")
if public_write_route_allowed == false:
  deny_route_publication(reason="write_route_still_blocked")
```

No secret value, raw request body, raw response body, database URL, provider
host value, account id, token, or private header may be used as product-status
promotion evidence.

STATUS:
  Completeness: 100%
  Self-attested invariants: product status remains limited-preview, public write route remains blocked, no DNS/runtime mutation, no public-beta claim emitted, no raw secret or provider values recorded
  Open issues: operator approval, product-status promotion approval, live API contract execution evidence, privacy activation approval, retention activation approval, runtime witness closure
  Next action: keep Mullu Govern limited-preview unless a later approval packet closes every public-beta gate
