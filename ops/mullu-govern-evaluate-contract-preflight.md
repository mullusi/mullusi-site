<!--
Purpose: record public-safe API contract preflight evidence for Mullu Govern evaluate-route public-beta preparation.
Governance scope: request contract specificity, fail-closed route boundary, trace requirement, privacy acknowledgement, bounded input shape, and no-secret evidence.
Dependencies: contracts/govern/evaluate.schema.json, products/mullu-govern/product.manifest.json, and ops/mullu-govern-public-beta-approval-packet.md.
Invariants: this witness is non-operative; it does not publish POST /v1/govern/evaluate, execute requests, activate collection, mutate DNS, or record raw request/response bodies.
-->

# Mullu Govern Evaluate Contract Preflight

This witness answers one question:

```text
Is the Mullu Govern evaluate request contract structurally ready while live contract execution remains blocked?
```

Current answer:

```text
product_id=mullu-govern
route=POST /v1/govern/evaluate
contract_preflight_state=Ready
solver_outcome=SolvedVerified
proof_state=Pass
public_write_route_allowed=false
contract_execution_allowed=false
api_contract_test_ref=missing
route_publication_action=none
dns_mutation=none
runtime_mutation=none
secret_rotation_required=false
raw_request_body_recorded=false
raw_response_body_recorded=false
```

## Contract Bounds

| Contract surface | Required property | State |
| --- | --- | --- |
| Object boundary | `additionalProperties=false` at request and `action` object levels | Pass |
| Traceability | `trace_required=true` is mandatory | Pass |
| Privacy acknowledgement | `privacy_acknowledgement=no_raw_secret_or_unapproved_user_data` is mandatory | Pass |
| Action classification | `policy_evaluation`, `deployment_decision`, `runtime_promotion`, `governance_review` | Pass |
| Constraint bounds | 1 to 20 constraints, each <= 500 chars | Pass |
| Evidence refs | public-safe repo/control-plane ref pattern only | Pass |
| Requested outputs | bounded to decision, proof summary, repair actions, and audit trace | Pass |

## Non-Execution Boundary

```text
accepted_case_execution=AwaitingEvidence
rejected_case_execution=AwaitingEvidence
malformed_case_execution=AwaitingEvidence
unauthorized_case_execution=AwaitingEvidence
rate_limited_case_execution=AwaitingEvidence
execution_blocker=public_route_not_published
```

This preflight does not satisfy `api_contract_test_ref`. A later execution
evidence PR must prove accepted, rejected, malformed, unauthorized, and
rate-limited behavior against an approved runtime route without recording raw
request or response bodies.

STATUS:
  Completeness: 100%
  Self-attested invariants: request contract is bounded, trace required, privacy acknowledgement required, public route remains blocked, execution evidence remains missing, no raw request/response bodies or private provider values recorded
  Open issues: live API contract execution evidence, operator approval, product-status promotion, privacy activation approval, retention activation approval, runtime witness closure
  Next action: keep api_contract_test_ref missing until the route is approved and execution evidence is collected
