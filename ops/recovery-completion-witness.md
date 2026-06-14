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
recovery_witness_state=ReadyForProvisioning
api_provisioning_allowed=true
last_reviewed=2026-06-14
```

This state means the ignored private recovery inventory has all required
confirmation flags set to `true` after the operator confirmed each root
recovery path outside Git.

Observed on 2026-06-14:

```text
command=node scripts/check-private-recovery-inventory.mjs --require-ready --json
inventoryPathState=present
recoveryInventoryState=ReadyForProvisioning
proofState=Pass
solverOutcome=SolvedVerified
privateValueScan=Pass
missingFlags=none
```

The ready state is a public-safe provisioning allowance. The public witness
records only aggregate flag names and never replaces the private inventory.

## Public-Safe Witness Table

| Witness | Required Confirmation | State |
| --- | --- | --- |
| Cloudflare recovery | 2FA active and recovery codes saved outside Git | Confirmed |
| GitHub recovery | 2FA active and recovery codes saved outside Git | Confirmed |
| Google Workspace recovery | Admin login and recovery path confirmed | Confirmed |
| Namecheap recovery | Account recovery path confirmed | Confirmed |
| Namecheap transfer lock | Domain transfer lock confirmed enabled | Confirmed |
| Billing renewal | Payment and renewal owner confirmed | Confirmed |
| Private inventory | Non-secret locations recorded outside Git | Confirmed |

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

When `api_provisioning_allowed=true`, the next actions are limited to:

```text
provision_private_runtime_host
provision_managed_postgresql
create_production_secret_store
run_api_production_readiness_gate
keep_api_dns_absent_until_pre_dns_evidence_passes
```

Do not create `api` DNS until host, database, secret, TLS, and pre-DNS
evidence pass.

STATUS:
  Completeness: 100%
  Self-attested invariants: no secret values, explicit provisioning block, manual confirmation required, API DNS remains blocked
  Open issues: host/database provisioning still pending
  Next action: provision private host and managed PostgreSQL, then run the API production readiness gate
