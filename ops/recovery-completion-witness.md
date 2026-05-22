<!--
Purpose: record the public-safe completion state for Mullusi root recovery hardening.
Governance scope: recovery completion witness, API provisioning block, manual confirmation boundary, and public-safe audit state.
Dependencies: ops/recovery-inventory-template.md, ops/MULLUSI_INFRASTRUCTURE_ROOT.md, Cloudflare, Namecheap, GitHub, Google Workspace, billing, and private recovery storage.
Invariants: no recovery code, password, token value, API credential, database URL, billing detail, host address, or private storage path is stored in this file.
-->

# Recovery Completion Witness

This file answers one question:

```text
Is Mullusi recovery hardening complete enough to provision api.mullusi.com?
```

Current answer:

```text
recovery_witness_state=AwaitingEvidence
api_provisioning_allowed=false
last_reviewed=2026-05-22
```

This state is intentionally blocked until the private recovery inventory is
filled outside Git and the operator confirms each root recovery path.

## Public-Safe Witness Table

| Witness | Required Confirmation | State |
| --- | --- | --- |
| Cloudflare recovery | 2FA active and recovery codes saved outside Git | AwaitingEvidence |
| GitHub recovery | 2FA active and recovery codes saved outside Git | AwaitingEvidence |
| Google Workspace recovery | Admin login and recovery path confirmed | AwaitingEvidence |
| Namecheap recovery | Account recovery path confirmed | AwaitingEvidence |
| Namecheap transfer lock | Domain transfer lock confirmed enabled | AwaitingEvidence |
| Billing renewal | Payment and renewal owner confirmed | AwaitingEvidence |
| Private inventory | Non-secret locations recorded outside Git | AwaitingEvidence |

## Promotion Rule

Promote only when all witness rows are confirmed:

```text
recovery_witness_state=ReadyForProvisioning
api_provisioning_allowed=true
```

Do not promote this file based on memory or assumption. Promotion requires the
private recovery inventory to exist outside Git and each root account recovery
path to be checked manually.

## Forbidden Content

Never write these into this file:

```text
raw recovery code values
password values
runtime credential values
database connection strings
billing card data
host addresses
private storage paths
browser session material
```

## API Provisioning Block

While `api_provisioning_allowed=false`, the next actions are limited to:

```text
complete_private_recovery_inventory
confirm_namecheap_transfer_lock
confirm_google_workspace_recovery
confirm_github_recovery_codes
confirm_cloudflare_recovery_codes
confirm_billing_renewal_path
```

Do not provision production host/database and do not create `api` DNS until this
witness is promoted.

STATUS:
  Completeness: 100%
  Invariants verified: no secret values, explicit provisioning block, manual confirmation required, API DNS remains blocked
  Open issues: all recovery witnesses remain AwaitingEvidence
  Next action: complete private recovery inventory outside Git, then promote this witness only after manual confirmation
