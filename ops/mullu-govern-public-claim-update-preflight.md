<!--
Purpose: record public-safe public-claim update preflight evidence for Mullu Govern.
Governance scope: product page/status wording boundary, proof claim blocking, generated claim registry blocking, public-beta claim denial, product-status blocking, approval-packet placeholder, runtime closure blocking, and no-secret evidence.
Dependencies: products/mullu-govern/product.manifest.json, proof/govern.proof.json, data/generated/products.json, data/generated/claim-registry.json, ops/public-claim-gate.md, ops/mullu-govern-public-beta-approval-packet.md, scripts/validate-govern-product-status-preflight.mjs, scripts/validate-govern-public-beta-approval-packet.mjs, scripts/validate-govern-evaluate-write-route-decision.mjs, and scripts/validate-govern-runtime-closure-packet.mjs.
Invariants: this file is non-operative; it does not promote product status, render public-beta claims, publish routes, mutate DNS, activate collection, or record provider-private values.
-->

# Mullu Govern Public Claim Update Preflight

This preflight answers one question:

```text
Is the public claim boundary explicit and fail-closed before any Mullu Govern
public-beta claim update is approved?
```

Current answer:

```text
product_id=mullu-govern
public_claim_update_preflight_state=Ready
solver_outcome=SolvedVerified
proof_state=Pass
product_status_current=limited-preview
public_claim_update_allowed=false
public_claim_update_ref=missing
public_beta_claim_allowed=false
renderable_claim_count=0
govern_blocked_claim_count=3
public_write_route_allowed=false
route_publication_action=none
dns_mutation=none
runtime_mutation=none
secret_rotation_required=false
provider_values_recorded=false
last_reviewed=2026-06-25
```

The public claim registry is generated from product manifests, proof records,
and runtime witness state. Current generated evidence keeps Mullu Govern
claims blocked and keeps all renderable public claims at zero.

## Gate Ledger

| Gate | Required for this preflight | Current evidence | State |
| --- | --- | --- | --- |
| Product status | manifest remains `limited-preview` | `products/mullu-govern/product.manifest.json` | Pass |
| Public exposure | generated product record remains blocked | `publicExposureAllowed=false` | Pass |
| Claim source | Govern proof boundary has no allowed claims | `claimsAllowed=[]` | Pass |
| Blocked claims | Govern proof boundary blocks runtime, proof stamp, and dashboard claims | 3 blocked claim bindings | Pass |
| Generated claims | no renderable public claim exists | `renderableClaims=[]` | Pass |
| Approval packet | public claim update evidence remains missing | `public_claim_update_ref=missing` | Pass |
| Public write route | evaluate route remains closed | `public_write_route_allowed=false` | Pass |
| Validator aggregate | product-status, approval packet, write-route decision, and runtime closure validators pass while blocking public claims and route publication | aggregate validator results are `SolvedVerified` and `Pass`; public write route, runtime closure, and product claims remain false | Pass |

## Future Claim Update Envelope

A later public-beta claim update may become evidence only after the approval
packet supplies public-safe refs for:

1. Product-status promotion approval.
2. Public evaluate write-route approval.
3. Live API contract execution evidence.
4. Privacy and retention activation approval.
5. Dashboard operator-readiness evidence.
6. Runtime witness closure evidence.
7. A bounded public copy update that does not overclaim beyond those witnesses.

## Non-Approval Rule

```text
if public_claim_update_preflight_state == Ready:
  allow_next_action("draft_public_claim_update_for_later_approval")
  deny_public_claim_update(reason="preflight_is_not_public_claim_update")
if public_claim_update_ref == missing:
  deny_public_beta_claim(reason="claim_update_evidence_missing")
if renderable_claim_count != 0:
  deny_preflight(reason="unexpected_renderable_claim")
```

No raw response body, account id, provider value, token, database URL, private
header, raw user data, or dashboard screenshot contents may be used as public
claim evidence in this preflight.

STATUS:
  Completeness: 100%
  Self-attested invariants: public-beta claim remains blocked, renderable claim count remains zero, product status remains limited-preview, public write route remains blocked, no DNS/runtime mutation, no raw secret or provider values recorded
  Open issues: public claim update evidence, operator approval, product-status promotion approval, live API contract execution evidence, privacy activation approval, retention activation approval, dashboard operator-readiness evidence, runtime witness closure
  Next action: keep public claim update as AwaitingEvidence until a later approval packet supplies bounded public copy evidence
