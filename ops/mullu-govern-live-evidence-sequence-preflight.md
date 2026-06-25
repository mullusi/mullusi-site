<!--
Purpose: define the non-operative live evidence collection sequence for Mullu Govern public-beta readiness.
Governance scope: approval-bound sequencing for product status, privacy, retention, dashboard, API contract, public claim, runtime witness, route publication, and no-secret evidence handling.
Dependencies: ops/mullu-govern-public-beta-approval-packet.md, ops/mullu-govern-approval-readiness-preflight.md, ops/mullu-govern-live-evidence-operator-runbook.md, ops/runtime-witness/mullu-govern-closure-packet.md, and the Mullu Govern preflight validators.
Invariants: this preflight does not approve public-beta, publish routes, mutate DNS, activate privacy or retention, change dashboard auth, update runtime witnesses, or record provider-private values.
-->

# Mullu Govern Live Evidence Sequence Preflight

This preflight answers one question:

```text
Can live evidence collection for Mullu Govern public-beta exposure begin now?
```

Current answer:

```text
product_id=mullu-govern
live_evidence_sequence_preflight_state=Ready
solver_outcome=SolvedVerified
proof_state=Pass
packet_state=AwaitingEvidence
approval_state=NotApproved
ready_for_live_evidence=false
public_write_route_allowed=false
route_publication_action=none
dns_mutation=none
runtime_mutation=none
dashboard_auth_mutation=none
privacy_activation_allowed=false
retention_activation_allowed=false
product_status_promotion_allowed=false
public_claim_update_allowed=false
runtime_witness_update_allowed=false
provider_values_recorded=false
static_website_integrity=SolvedVerified
api_exposure_probe=2026-06-25:SolvedVerified
complete_mode_current_state=GovernanceBlocked
complete_mode_blocker_count=8
operator_runbook=ops/mullu-govern-live-evidence-operator-runbook.md
live_evidence_ref_intake=ops/mullu-govern-live-evidence-ref-intake-template.json
live_evidence_ref_intake_command=node scripts/validate-govern-live-evidence-ref-intake.mjs
last_reviewed=2026-06-25
```

The repository-local preflights are organized, but live evidence collection is
not approved. Live collection would cross product status, privacy, dashboard,
public route, public claim, and runtime witness boundaries. Those boundaries
must remain blocked until the public-beta approval packet contains public-safe
evidence refs for the approval-bound steps.

## Required Sequence

The allowed order is:

1. Keep `mullu-govern` in `limited-preview`.
2. Keep `POST /v1/govern/evaluate` unpublished.
3. Record an explicit operator approval ref for live evidence collection.
4. Record product-status promotion approval before changing the manifest.
5. Record privacy activation approval before changing active collection policy.
6. Record retention activation approval before changing retention days.
7. Record dashboard operator-readiness evidence before claiming dashboard closure.
8. Record API contract execution evidence after the public route has explicit approval.
9. Record bounded public claim update evidence after the product status and runtime evidence are approved.
10. Record runtime witness evidence after the prior evidence refs are present.
11. Update `ops/runtime-witness/registry.json` only in a separate closure PR.

## Sequenced Approval Inputs

The sequence remains blocked until all live/effect-bearing refs are public-safe
and validated:

```text
operator_approval_ref=missing
product_status_promotion_ref=missing
privacy_activation_ref=missing
retention_activation_ref=missing
dashboard_operator_readiness_ref=missing
api_contract_test_ref=missing
public_claim_update_ref=missing
runtime_witness_ref=missing
```

Complete-mode validation currently blocks on those same eight refs:

```text
command=node scripts/validate-govern-live-evidence-ref-intake.mjs --require-complete
govern_live_evidence_ref_intake=GovernanceBlocked
proof_state=Fail
ready_for_live_evidence=false
require_complete=true
missing_approval_input_count=8
finding=approval_ref_required:operator_approval_ref
finding=approval_ref_required:product_status_promotion_ref
finding=approval_ref_required:privacy_activation_ref
finding=approval_ref_required:retention_activation_ref
finding=approval_ref_required:dashboard_operator_readiness_ref
finding=approval_ref_required:api_contract_test_ref
finding=approval_ref_required:public_claim_update_ref
finding=approval_ref_required:runtime_witness_ref
secret_values=not_read
provider_values=not_read
raw_payloads=not_read
```

Rollback and support evidence are already present in the approval packet, but
they are not approval for live evidence collection.

Use `ops/mullu-govern-live-evidence-ref-intake-template.json` as the public-safe
intake file and validate it with
`node scripts/validate-govern-live-evidence-ref-intake.mjs` before replacing any
`missing` value with an evidence ref. Use
`ops/mullu-govern-live-evidence-operator-runbook.md` as the operator procedure.

## Denial Rules

```text
if operator_approval_ref == missing:
  deny_live_evidence(reason="operator_approval_missing")
if product_status_promotion_ref == missing:
  deny_product_status_promotion(reason="promotion_approval_missing")
if privacy_activation_ref == missing:
  deny_privacy_activation(reason="privacy_activation_approval_missing")
if retention_activation_ref == missing:
  deny_retention_activation(reason="retention_activation_approval_missing")
if dashboard_operator_readiness_ref == missing:
  deny_dashboard_claim(reason="dashboard_evidence_missing")
if api_contract_test_ref == missing:
  deny_write_route_contract_claim(reason="api_contract_execution_missing")
if public_claim_update_ref == missing:
  deny_public_claim_update(reason="public_claim_update_evidence_missing")
if runtime_witness_ref == missing:
  deny_runtime_witness_update(reason="runtime_witness_evidence_missing")
```

## Non-Operative Boundary

```text
ready_for_live_evidence=false
public_write_route_allowed=false
route_publication_action=none
dns_mutation=none
runtime_mutation=none
dashboard_auth_mutation=none
privacy_activation_allowed=false
retention_activation_allowed=false
product_status_promotion_allowed=false
public_claim_update_allowed=false
runtime_witness_update_allowed=false
secret_rotation_required=false
```

STATUS:
  Completeness: 100%
  Self-attested invariants: sequence is explicit, current live action remains denied, public write route remains blocked, privacy and retention remain inactive, product status remains limited-preview, no raw secret or provider values recorded
  Open issues: operator approval, product-status promotion approval, privacy activation approval, retention activation approval, dashboard operator-readiness evidence, live API contract execution evidence, public claim update evidence, runtime witness evidence
  Next action: keep live evidence collection blocked until the public-beta approval packet supplies every required public-safe evidence ref using the operator runbook contract
