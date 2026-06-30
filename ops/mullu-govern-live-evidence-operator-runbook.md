<!--
Purpose: define the operator-safe intake contract for Mullu Govern live evidence refs.
Governance scope: public-safe evidence ref format, approval-bound live collection inputs, secret exclusion, rollback boundary, release-claim denial, intake gating, and route-publication denial.
Dependencies: ops/mullu-govern-live-evidence-sequence-preflight.md, ops/mullu-govern-live-evidence-ref-intake-template.json, ops/mullu-govern-public-beta-approval-packet.md, ops/release-readiness-summary.md, ops/runtime-witness/mullu-govern-closure-packet.md, and Mullu Govern preflight validators.
Invariants: this runbook does not approve public-beta, publish routes, mutate DNS, activate privacy or retention, change dashboard auth, update runtime witnesses, record raw payloads, or store private provider values.
-->

# Mullu Govern Live Evidence Operator Runbook

This runbook answers one question:

```text
What public-safe evidence refs must exist before Mullu Govern public-beta live evidence collection can begin?
```

Current answer:

```text
product_id=mullu-govern
operator_runbook_state=Ready
solver_outcome=SolvedVerified
proof_state=Pass
ready_for_live_evidence=false
public_write_route_allowed=false
approval_packet=ops/mullu-govern-public-beta-approval-packet.md
approval_readiness_preflight=ops/mullu-govern-approval-readiness-preflight.md
live_evidence_ref_intake=ops/mullu-govern-live-evidence-ref-intake-template.json
local_live_evidence_ref_intake=ops/mullu-govern-live-evidence-ref-intake.local.json
live_evidence_operator_request_command=node scripts/emit-govern-live-evidence-operator-request.mjs
live_evidence_ref_status_command=node scripts/report-govern-live-evidence-ref-status.mjs
live_evidence_ref_intake_command=node scripts/validate-govern-live-evidence-ref-intake.mjs
live_evidence_ref_collection_checklist=ops/mullu-govern-live-evidence-ref-collection-checklist.md
sequence_preflight=ops/mullu-govern-live-evidence-sequence-preflight.md
runtime_witness_packet=ops/runtime-witness/mullu-govern-closure-packet.md
safe_local_command=node scripts/validate-govern-live-evidence-sequence-preflight.mjs
static_website_integrity=SolvedVerified
api_exposure_probe=2026-06-29:SolvedVerified
complete_mode_current_state=GovernanceBlocked
complete_mode_blocker_count=8
secret_values_allowed=false
raw_request_bodies_allowed=false
raw_response_bodies_allowed=false
provider_values_allowed=false
last_reviewed=2026-06-30
```

## 2026-06-30 Status Refresh

The live evidence ref status reporter still returns `AwaitingEvidence` and
does not find invalid public-safe refs:

```text
command=node scripts/report-govern-live-evidence-ref-status.mjs
govern_live_evidence_ref_status=AwaitingEvidence
proof_state=Unknown
missing_ref_count=8
local_guard_missing_count=8
invalid_ref_count=0
finding_count=0
secret_values=not_read
provider_values=not_read
raw_payloads=not_read
```

The operator request emitter still asks for the same eight public-safe refs and
keeps the write route blocked. It prints concrete `accepted_example` values so
the operator can distinguish ref grammar from real evidence:

```text
command=node scripts/emit-govern-live-evidence-operator-request.mjs
govern_live_evidence_operator_request=AwaitingEvidence
proof_state=Unknown
missing_ref_count=8
invalid_ref_count=0
public_write_route_allowed=false
next_action=supply_public_safe_refs_in_ignored_local_intake
request=operator_approval_ref status=missing accepted_shape=approval://mullu-govern/live-evidence/YYYY-MM-DD/operator-approved accepted_example=approval://mullu-govern/live-evidence/2026-06-30/operator-approved requested_action=collect_explicit_operator_approval_ref
request=api_contract_test_ref status=missing accepted_shape=github:actions/runs/NNN:govern-evaluate-contract-live accepted_example=github:actions/runs/123:govern-evaluate-contract-live requested_action=collect_live_contract_test_ref_after_approval
secret_values=not_read
provider_values=not_read
raw_payloads=not_read
```

## Evidence Ref Contract

Use evidence refs, not evidence dumps. A valid public-safe ref is a pointer to a
reviewed repository artifact, merged pull request, governed receipt id, or
operator approval id. It must not contain a secret value, database URL, provider
host value, raw request body, raw response body, private header, token, billing
detail, or account id.

Accepted ref families:

```text
approval://mullu-govern/live-evidence/YYYY-MM-DD/operator-approved
receipt://dashboard/govern/operator-readiness/YYYY-MM-DD
github:pull/NNN:bounded-description
github:actions/runs/NNN:bounded-description
site:ops/path/to-public-safe-witness.md
control-plane:pull/NNN:path/to-validator-or-receipt
control-plane:receipt/path/to-public-safe-receipt
render:event/public-event-id
cloudflare:audit/public-audit-id
google-workspace:audit/public-audit-id
```

Raw values are never valid refs.

## Required Live Evidence Refs

| Approval input | What it must prove | Public-safe ref example shape | Current state |
| --- | --- | --- | --- |
| `operator_approval_ref` | Operator approved collecting live evidence for this route and product boundary | `approval://mullu-govern/live-evidence/YYYY-MM-DD/operator-approved` | `missing` |
| `product_status_promotion_ref` | Product status promotion from `limited-preview` toward `public-beta` was explicitly approved | `github:pull/NNN:product-status-public-beta-approval` | `missing` |
| `privacy_activation_ref` | Active privacy policy was approved before collecting user-supplied evaluate inputs | `github:pull/NNN:privacy-govern-policy-activation` | `missing` |
| `retention_activation_ref` | Active retention windows were approved before storing traces, proof stamps, or audit events | `github:pull/NNN:govern-retention-activation` | `missing` |
| `dashboard_operator_readiness_ref` | Authenticated dashboard operator path was verified without exposing private values | `receipt://dashboard/govern/operator-readiness/YYYY-MM-DD` | `missing` |
| `api_contract_test_ref` | Live accepted, rejected, malformed, unauthorized, and rate-limited API cases were verified after approval | `github:actions/runs/NNN:govern-evaluate-contract-live` | `missing` |
| `public_claim_update_ref` | Public copy/status update stayed bounded to verified evidence | `github:pull/NNN:govern-public-claim-update` | `missing` |
| `runtime_witness_ref` | Runtime witness registry closure was validated after all prior refs existed | `github:pull/NNN:runtime-witness-govern-closure` | `missing` |

## Validator Bindings

This runbook is valid only while these read-only validators pass and still
deny live evidence collection or public product release:

```text
approval_packet_validator=Pass
approval_readiness_validator=Pass
live_evidence_sequence_validator=Pass
live_evidence_ref_intake_validator=Pass
release_readiness_summary_validator=Pass
ready_for_live_evidence=false
product_runtime_claims_allowed=false
public_product_release_allowed=false
```

## Current Complete-Mode Intake Block

Observed on 2026-06-30:

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

Static website integrity and API gateway exposure are no longer blockers for
preparing the ref intake. They are not product runtime evidence and do not
authorize route publication.

## Operator Steps

1. Run `node scripts/report-ops-next-action.mjs`.
2. Run `node scripts/validate-govern-approval-readiness-preflight.mjs`.
3. Run `node scripts/validate-govern-live-evidence-sequence-preflight.mjs`.
4. Confirm every current live evidence ref is still `missing`.
5. Copy the committed template into the ignored local working intake:

```powershell
Copy-Item ops/mullu-govern-live-evidence-ref-intake-template.json ops/mullu-govern-live-evidence-ref-intake.local.json
```

6. Validate the ignored local working intake before and after editing:

```powershell
node scripts/validate-govern-live-evidence-ref-intake.mjs --path=ops/mullu-govern-live-evidence-ref-intake.local.json
node scripts/validate-govern-live-evidence-ref-intake.mjs --path=ops/mullu-govern-live-evidence-ref-intake.local.json --require-complete
```

The first command may pass while refs remain `missing`. The second command must
block until all eight public-safe refs are present. Do not copy local refs back
into the committed template or approval packet until `--require-complete`
passes.

7. Emit the public-safe operator request packet while refs are missing:

```powershell
node scripts/emit-govern-live-evidence-operator-request.mjs --path=ops/mullu-govern-live-evidence-ref-intake.local.json
```

8. Use `ops/mullu-govern-live-evidence-ref-collection-checklist.md` to
   collect only public-safe ref identifiers for the required inputs.
9. Do not paste secrets, database URLs, raw headers, raw request bodies, raw
   response bodies, provider host values, billing details, or account ids.
10. Update the approval packet only in a separate PR that validates the exact
   refs supplied.
11. Keep `POST /v1/govern/evaluate` blocked until the approval packet changes
   to `ReadyForApproval` or stronger and then receives explicit operator
   approval.
12. Update `ops/runtime-witness/registry.json` only after product status,
   privacy, retention, dashboard, API contract, public claim, and runtime
   evidence refs are closed.

## Stop Conditions

```text
if evidence_ref_contains_secret_shape:
  stop(reason="secret_value_must_not_enter_public_evidence")
if evidence_ref_contains_raw_payload:
  stop(reason="raw_payload_must_not_enter_public_evidence")
if approval_packet_state != ReadyForApproval:
  stop(reason="approval_packet_incomplete")
if approval_state != Approved:
  stop(reason="operator_approval_missing")
if public_write_route_allowed != true:
  keep_route_blocked(reason="route_publication_not_approved")
```

STATUS:
  Completeness: 100%
  Self-attested invariants: operator steps are explicit, refs remain public-safe pointers only, local intake is ignored, route remains blocked, no raw secret/provider/payload values recorded
  Open issues: eight live evidence refs remain missing
  Next action: use this runbook when the operator is ready to supply public-safe evidence refs in a separate approval PR
