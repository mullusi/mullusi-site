<!--
Purpose: provide a public-safe template for Mullusi root account recovery inventory.
Governance scope: account recovery paths, emergency authority, storage locations, verification cadence, and rollback readiness.
Dependencies: Cloudflare, Namecheap, GitHub, Google Workspace, password manager, and offline encrypted storage.
Invariants: this template stores no codes, credentials, private URLs, payment details, host addresses, API credentials, or session material.
-->

# Recovery Inventory Template

Use this template as the structure for the private recovery inventory. Do not
fill secret values into this committed file.

Recommended private location:

```text
ops/recovery-inventory.private.md
```

That private file is ignored by Git. A stronger option is an encrypted password
manager entry plus an offline encrypted backup.

## Root Identity

| Field | Public-Safe Entry |
| --- | --- |
| Primary infrastructure email | `tamirat@mullusi.com` |
| External recovery email | `mullusiofficial@gmail.com` as recovery only |
| Infrastructure operator | Tamirat |
| Emergency contact path | Store privately |
| Password manager location | Store privately |
| Offline backup location | Store privately |

## Account Recovery Checklist

| System | Required Witness | Private Record Should Contain | Status |
| --- | --- | --- | --- |
| Cloudflare | 2FA active and recovery codes saved | Storage location and last verified date only | Pending |
| Namecheap | 2FA active and transfer lock confirmed | Storage location, transfer lock state, renewal owner | Pending |
| GitHub | 2FA active and recovery codes saved | Storage location and owner/admin recovery path | Pending |
| Google Workspace | Admin login works and recovery path confirmed | Recovery path, admin account, DKIM status | Pending |
| Password manager | Emergency access path exists | Location and operator instructions | Pending |
| Billing | Renewal/payment owner known | Billing owner and renewal calendar location | Pending |

## Recovery Evidence Rules

Record only evidence location and verification date in the private inventory.
Never record raw recovery codes, passwords, secret keys, billing card numbers,
or active session material in Git.

Valid private evidence examples:

```text
Cloudflare recovery codes saved in password manager entry: Mullusi / Cloudflare
Namecheap transfer lock verified on: YYYY-MM-DD
Google Workspace admin login verified on: YYYY-MM-DD
GitHub recovery codes refreshed on: YYYY-MM-DD
```

Invalid evidence examples:

```text
raw recovery code values
runtime credential values
database connection strings
payment card numbers
browser session export
```

## Emergency Access Procedure

1. Confirm the incident scope:
   - Cloudflare account access issue
   - registrar/domain issue
   - Google Workspace email issue
   - GitHub source/deployment issue
   - billing/renewal issue

2. Use the private inventory to locate the right recovery path.

3. Recover the account with the least broad action:
   - do not rotate unrelated credentials
   - do not change DNS unless the incident requires it
   - do not disable DNSSEC unless DNSSEC itself is the cause

4. Record:
   - date
   - operator
   - system
   - action
   - reason
   - rollback state

5. Retest:
   - `https://mullusi.com`
   - `https://docs.mullusi.com`
   - email send and receive
   - Cloudflare DNSSEC status

## Rotation Cadence

| Item | Cadence | Rule |
| --- | --- | --- |
| Recovery inventory review | Monthly | Confirm locations and owner access |
| Cloudflare recovery codes | After any 2FA reset | Replace old saved set |
| GitHub recovery codes | After any 2FA reset | Replace old saved set |
| Google recovery path | Quarterly | Confirm login and recovery destination |
| Namecheap transfer lock | Quarterly | Confirm lock is still enabled |
| Billing renewal path | Quarterly | Confirm payment and renewal owner |

## Release Block

`api.mullusi.com` remains blocked until this private recovery inventory is
complete:

```text
cloudflare_recovery_saved=true
github_recovery_saved=true
google_workspace_recovery_confirmed=true
namecheap_recovery_confirmed=true
namecheap_transfer_lock_confirmed=true
billing_renewal_path_confirmed=true
```

STATUS:
  Completeness: 100%
  Invariants verified: no secret values, recovery before runtime, emergency procedure bounded, public foundation retest required after recovery action
  Open issues: private inventory must be filled by operator outside Git
  Next action: copy the structure into an ignored private file or encrypted password manager, then mark recovery witnesses complete
