<!--
Purpose: record public-safe privacy and retention preflight evidence for Mullu Govern public-beta preparation.
Governance scope: privacy activation prerequisites, retention activation prerequisites, data-class alignment, fail-closed public write-route boundary, and no-secret evidence boundaries.
Dependencies: products/mullu-govern/product.manifest.json, privacy/govern.policy.json, privacy/govern.retention.json, and ops/mullu-govern-public-beta-approval-packet.md.
Invariants: this witness is non-operative; it does not activate collection, set retention, publish a route, mutate DNS, read private systems, or record raw user data.
-->

# Mullu Govern Privacy And Retention Preflight

This witness answers one question:

```text
Are the privacy and retention files structurally ready for a future activation decision while remaining inactive now?
```

Current answer:

```text
product_id=mullu-govern
privacy_retention_preflight_state=Ready
solver_outcome=SolvedVerified
proof_state=Pass
public_write_route_allowed=false
collection_state_current=not-active
retention_state_current=not-active
privacy_activation_allowed=false
retention_activation_allowed=false
route_publication_action=none
dns_mutation=none
runtime_mutation=none
secret_rotation_required=false
raw_user_data_recorded=false
```

## Data-Class Alignment

| Source | Expected classes | State |
| --- | --- | --- |
| `products/mullu-govern/product.manifest.json` | `policy_records`, `evaluations`, `traces`, `proof_stamps`, `audit_events` | Pass |
| `privacy/govern.policy.json` | same ordered set as manifest | Pass |
| `privacy/govern.retention.json` | one row per policy class | Pass |

## Inactive Boundary

| Gate | Required current state | Current evidence | State |
| --- | --- | --- | --- |
| Privacy policy | `collectionState=not-active` until explicit activation approval | `privacy/govern.policy.json` remains `not-active` | Pass |
| Retention rows | every row `state=not-active` and `maximumDays=0` until activation approval | `privacy/govern.retention.json` remains zero-retention inactive | Pass |
| Approval packet | activation refs remain missing until a later approval PR | `privacy_activation_ref=missing`, `retention_activation_ref=missing` | Pass |
| Public write route | route remains closed while privacy and retention are inactive | `public_write_route_allowed=false` | Pass |

## Future Activation Envelope

A later activation PR may replace this preflight only if it provides all of the
following public-safe evidence:

```text
required_policy_state=limited-preview_or_stronger
required_retention_state=limited-preview_or_stronger
required_data_classes=policy_records,evaluations,traces,proof_stamps,audit_events
required_user_notice=published_before_collection
required_deletion_path=defined_before_collection
required_operator_approval=explicit_ref
required_runtime_witness=SolvedVerified
```

Recommended upper bounds for a later `limited-preview` activation decision:

```text
policy_records_maximum_days=365
evaluations_maximum_days=180
traces_maximum_days=90
proof_stamps_maximum_days=365
audit_events_maximum_days=365
```

These are planning bounds only. They are not active retention settings.

## Current Non-Activation Decision

```text
approval_state=NotApproved
privacy_activation_ref=missing
retention_activation_ref=missing
collection_activation_action=none
retention_activation_action=none
next_action=close_api_contract_execution_or_runtime_witness_before_requesting_public_beta_approval
```

STATUS:
  Completeness: 100%
  Self-attested invariants: privacy and retention remain not-active, public write route remains blocked, activation refs remain missing, no raw user data or private provider values recorded
  Open issues: privacy activation approval, retention activation approval, product-status promotion, API contract execution evidence, runtime witness closure, operator approval
  Next action: keep privacy and retention inactive until explicit activation approval and runtime witness closure exist
