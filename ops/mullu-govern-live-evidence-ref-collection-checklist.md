<!--
Purpose: provide the operator-facing public-safe collection checklist for Mullu Govern live evidence refs.
Governance scope: approval-bound evidence ref collection only; no secrets, raw payloads, provider values, account ids, host addresses, database URLs, billing values, or route publication.
Dependencies: ops/mullu-govern-live-evidence-operator-runbook.md, ops/mullu-govern-live-evidence-ref-intake-template.json, scripts/validate-govern-live-evidence-ref-intake.mjs, and scripts/govern-live-evidence-ref-contract.mjs.
Invariants: this checklist is non-operative; it does not approve live evidence collection, publish routes, promote product status, activate privacy or retention, mutate DNS/runtime/auth, or update runtime witnesses.
-->

# Mullu Govern Live Evidence Ref Collection Checklist

This checklist answers one question:

```text
Which public-safe refs must the operator collect before any approval-packet edit can be proposed?
```

Current answer:

```text
product_id=mullu-govern
collection_checklist_state=Ready
solver_outcome=SolvedVerified
proof_state=Pass
ready_for_live_evidence=false
public_write_route_allowed=false
intake_template=ops/mullu-govern-live-evidence-ref-intake-template.json
local_intake_working_file=ops/mullu-govern-live-evidence-ref-intake.local.json
intake_validator=node scripts/validate-govern-live-evidence-ref-intake.mjs --require-complete
static_website_integrity=SolvedVerified
api_exposure_probe=2026-06-25:SolvedVerified
complete_mode_current_state=GovernanceBlocked
complete_mode_blocker_count=8
secret_values_allowed=false
raw_payloads_allowed=false
provider_values_allowed=false
last_reviewed=2026-06-25
```

## Ref Checklist

| Approval ref | Accepted shape | Evidence source | Must not include | Current state |
| --- | --- | --- | --- | --- |
| `operator_approval_ref` | `approval://mullu-govern/live-evidence/YYYY-MM-DD/operator-approved` | operator approval record for this product and route boundary | private notes, tokens, account ids | `missing` |
| `product_status_promotion_ref` | `github:pull/NNN:product-status-public-beta-approval` | merged PR or approval PR that keeps promotion bounded | raw provider state, secrets, unreviewed status claims | `missing` |
| `privacy_activation_ref` | `github:pull/NNN:privacy-govern-policy-activation` | reviewed privacy activation PR before collection | raw user data, mailbox contents, private screenshots | `missing` |
| `retention_activation_ref` | `github:pull/NNN:govern-retention-activation` | reviewed retention activation PR for every data class | database URLs, storage credentials, private hostnames | `missing` |
| `dashboard_operator_readiness_ref` | `receipt://dashboard/govern/operator-readiness/YYYY-MM-DD` | public-safe dashboard readiness receipt | cookies, session ids, account ids, screenshots with private values | `missing` |
| `api_contract_test_ref` | `github:actions/runs/NNN:govern-evaluate-contract-live` | live contract test run after approval | raw request bodies, raw response bodies, authorization headers | `missing` |
| `public_claim_update_ref` | `github:pull/NNN:govern-public-claim-update` | bounded public copy/status PR | overclaims, unsupported product runtime claims | `missing` |
| `runtime_witness_ref` | `github:pull/NNN:runtime-witness-govern-closure` | runtime witness closure after all prior refs exist | provider host values, database URLs, tokens, raw logs | `missing` |

## Complete-Mode Blocker Snapshot

Observed on 2026-06-25:

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

Do not replace `missing` values in the committed template. Use only the ignored
local working intake until complete-mode validation passes.

## Fill Order

1. Keep every value in `ops/mullu-govern-live-evidence-ref-intake-template.json` as `missing` until the corresponding public-safe ref exists.
2. Copy the template into `ops/mullu-govern-live-evidence-ref-intake.local.json`.
   This local working file is ignored by Git and may be used while refs are
   incomplete.
3. Replace only the exact `approval_refs` value for the ref being supplied in
   the ignored local working file.
4. Leave these flags unchanged:

```text
ready_for_live_evidence=false
public_write_route_allowed=false
secret_values_allowed=false
raw_payloads_allowed=false
provider_values_allowed=false
```

5. Validate the local working intake before any approval-packet edit:

```powershell
node scripts\validate-govern-live-evidence-ref-intake.mjs --path=ops/mullu-govern-live-evidence-ref-intake.local.json --require-complete
```

6. If validation fails, do not edit the committed template or approval packet.

## Stop Conditions

```text
if ref_contains_secret_or_token_shape:
  stop(reason="private_value_must_not_enter_public_ref")
if ref_contains_raw_payload_or_header:
  stop(reason="raw_payload_must_not_enter_public_ref")
if ref_shape_is_not_accepted:
  stop(reason="ref_grammar_invalid")
if any_required_ref == missing:
  stop(reason="approval_packet_not_ready")
```

STATUS:
  Completeness: 100%
  Self-attested invariants: checklist is non-operative, local intake remains ignored until complete, all refs remain missing until public-safe evidence exists, route remains blocked, no raw secret/provider/payload values recorded
  Open issues: eight live evidence refs remain missing
  Next action: fill the ignored local working intake only with public-safe refs, then validate with --require-complete before any approval-packet PR
