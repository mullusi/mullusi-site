<!--
Purpose: define the approval packet required before Mullu Govern public-beta evaluate-route exposure.
Governance scope: product-status promotion, public write-route publication, API contract execution, privacy activation, retention activation, rollback readiness, support readiness, runtime witness closure, and operator approval.
Dependencies: products/mullu-govern/product.manifest.json, ops/mullu-govern-evaluate-write-route-decision.md, ops/runtime-witness/mullu-govern-closure-packet.md, privacy/govern.policy.json, privacy/govern.retention.json, and public-safe api.mullusi.com guard probes.
Invariants: this file is a non-operative approval packet; it does not publish a route, mutate DNS, reveal secrets, store raw request/response bodies, or record provider-private values.
-->

# Mullu Govern Public-Beta Approval Packet

This packet answers one question:

```text
Can Mullu Govern public-beta exposure for POST /v1/govern/evaluate be approved now?
```

Current answer:

```text
product_id=mullu-govern
route=POST /v1/govern/evaluate
packet_state=AwaitingEvidence
approval_state=NotApproved
solver_outcome=AwaitingEvidence
proof_state=Unknown
public_write_route_allowed=false
product_status_current=limited-preview
product_status_target=public-beta
current_decision=KeepBlocked
decision_record=ops/mullu-govern-evaluate-write-route-decision.md
runtime_witness_packet=ops/runtime-witness/mullu-govern-closure-packet.md
last_reviewed=2026-06-14
```

The public API gateway is verified, but this packet does not approve the
product write route. Public-beta exposure remains blocked because the route
would accept user-supplied evaluation inputs and may create traces, proof
stamps, and audit events.

## Approval Gate Ledger

| Gate | Required approval evidence | Current evidence | State |
| --- | --- | --- | --- |
| Operator approval | Explicit approval ref for public `POST /v1/govern/evaluate` | readiness preflight in `ops/mullu-govern-approval-readiness-preflight.md`; `operator_approval_ref=missing` | AwaitingEvidence |
| Product status | Manifest promotion from `limited-preview` to `public-beta` | preflight ready in `ops/mullu-govern-product-status-preflight.md`; `products/mullu-govern/product.manifest.json` remains `limited-preview` | AwaitingEvidence |
| Route guard | Public route closed until approval | public-safe guard probe returns 404 | Pass |
| API contract | Request, response, malformed, unauthorized, rejected, and rate-limited cases verified | preflight ready in `ops/mullu-govern-evaluate-contract-preflight.md`; live execution cases remain `AwaitingEvidence` because public route is intentionally not published | AwaitingEvidence |
| Privacy activation | Active policy permits collection for named data classes | preflight ready in `ops/mullu-govern-privacy-retention-preflight.md`; `privacy/govern.policy.json` remains `not-active` | AwaitingEvidence |
| Retention activation | Active bounded retention days for every collected class | preflight ready in `ops/mullu-govern-privacy-retention-preflight.md`; all `privacy/govern.retention.json` classes remain `not-active` with `maximumDays=0` | AwaitingEvidence |
| Dashboard operator readiness | Authenticated operator dashboard path verified without exposing private data | preflight ready in `ops/mullu-govern-dashboard-operator-readiness-preflight.md`; live dashboard readiness evidence remains `AwaitingEvidence` | AwaitingEvidence |
| Runtime witness | product runtime witness closes as `SolvedVerified` | runtime witness registry remains `AwaitingEvidence` | AwaitingEvidence |
| Rollback witness | rollback test disables only the evaluate route and preserves public health routes | control-plane PR #1686 merged `scripts/validate_govern_evaluate_route_rollback.py`; witness reports `SolvedVerified`, preserves `/v1/health` and `/v1/version`, and keeps `POST /v1/govern/evaluate` blocked with no outbound transport | Pass |
| Support readiness | support and incident path for route users verified | `ops/mullu-govern-support-readiness.md` verifies support contact, privacy contact, responsible disclosure, security contact metadata, and fail-closed incident routing | Pass |
| Public claim update | product page/status copy remains bounded to evidence | preflight ready in `ops/mullu-govern-public-claim-update-preflight.md`; no public-beta claim emitted | AwaitingEvidence |

## Required Approval Inputs

The approval packet may become `ReadyForApproval` only when every placeholder
below has a public-safe evidence ref:

```text
operator_approval_ref=missing
product_status_promotion_ref=missing
api_contract_test_ref=missing
privacy_activation_ref=missing
retention_activation_ref=missing
dashboard_operator_readiness_ref=missing
runtime_witness_ref=missing
rollback_witness_ref=control-plane:pull/1686:scripts/validate_govern_evaluate_route_rollback.py
support_readiness_ref=ops/mullu-govern-support-readiness.md
public_claim_update_ref=missing
```

No secret value, raw request body, raw response body, database URL, provider
host value, account id, token, or private header may be used as an evidence ref.

## Publication Rule

Publication remains denied unless all approval inputs are present and validated
in a later PR:

```text
if packet_state != ReadyForApproval:
  deny_publication(reason="approval_packet_incomplete")
if approval_state != Approved:
  deny_publication(reason="operator_approval_missing")
if runtime_witness_state != SolvedVerified:
  deny_publication(reason="runtime_witness_not_closed")
```

## Rollback Requirement

Before approval, rollback must be tested against a route-level exposure change:

```text
rollback_action=remove /v1/govern/evaluate from public gateway allowlist
must_preserve=/v1/health,/v1/version,api.mullusi.com DNS
must_record=incident_or_superseding_decision
must_verify=POST /v1/govern/evaluate returns 404 after rollback
```

## Current Decision

```text
approval_state=NotApproved
route_publication_action=none
dns_mutation=none
runtime_mutation=none
secret_rotation_required=false
next_action=close_missing_public_beta_gate_evidence_before_requesting_approval
```

STATUS:
  Completeness: 100%
  Self-attested invariants: packet is non-operative, public route remains blocked, API gateway witness remains separate from product write-route exposure, privacy and retention remain not-active, no raw secret or provider values recorded
  Open issues: operator approval, product-status promotion approval, live API contract execution evidence, privacy activation approval, retention activation approval, dashboard operator-readiness evidence, public claim update evidence, runtime witness closure
  Next action: close runtime witness closure or request explicit approval before collecting live API contract execution evidence
