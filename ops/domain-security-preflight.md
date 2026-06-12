<!--
Purpose: record DNS/email hardening preflight authority before any CAA, SPF, DKIM, DMARC, MTA-STS, or TLS-RPT mutation.
Governance scope: Cloudflare certificate authority confirmation, DNS write authority, sender inventory, Google Workspace DKIM selector, report mailboxes, MTA-STS host readiness, and mutation permissions.
Dependencies: ops/domain-security-witness.md, ops/domain-security-hardening-runbook.md, Cloudflare SSL/TLS dashboard, Google Workspace Admin, and public DNS readback.
Invariants: no provider account IDs, DKIM private keys, DNS target dashboard values, mailbox credentials, report payloads, or raw secret values are stored here.
-->

# Domain Security Preflight

This file is the mutation gate. It must remain `GovernanceBlocked` until the
external admin evidence required by `ops/domain-security-hardening-runbook.md`
is confirmed.

## Evidence State

```text
domain_hardening_preflight=GovernanceBlocked
active_cloudflare_ca_set=AwaitingEvidence
cloudflare_ca_source=AwaitingEvidence
dns_write_authority=AwaitingEvidence
sender_inventory=AwaitingEvidence
google_workspace_dkim_selector=AwaitingEvidence
dmarc_report_mailbox=AwaitingEvidence
mta_sts_https_policy_host=AwaitingEvidence
tls_rpt_report_mailbox=AwaitingEvidence
manual_caa_allowed=false
dkim_publication_allowed=false
spf_hardfail_allowed=false
dmarc_enforcement_allowed=false
mta_sts_enforce_allowed=false
tls_rpt_publication_allowed=false
raw_secret_values=not_recorded
last_promoted=AwaitingEvidence
last_reviewed=2026-06-12
```

Observed on 2026-06-12:

```text
command=node scripts/check-domain-hardening-preflight.mjs
verdict=GovernanceBlocked
proof_state=Unknown
domain_hardening_preflight=GovernanceBlocked
active_cloudflare_ca_set=AwaitingEvidence
cloudflare_ca_source=AwaitingEvidence
dns_write_authority=AwaitingEvidence
sender_inventory=AwaitingEvidence
google_workspace_dkim_selector=AwaitingEvidence
dmarc_report_mailbox=AwaitingEvidence
mta_sts_https_policy_host=AwaitingEvidence
tls_rpt_report_mailbox=AwaitingEvidence
manual_caa_allowed=false
dkim_publication_allowed=false
spf_hardfail_allowed=false
dmarc_enforcement_allowed=false
mta_sts_enforce_allowed=false
tls_rpt_publication_allowed=false
finding=preflight_waiting_for_external_evidence
raw_secret_values=not_recorded
```

## Permission Rule

```text
manual_caa_allowed=true only when active_cloudflare_ca_set=Pass and cloudflare_ca_source=Pass and dns_write_authority=Pass
dkim_publication_allowed=true only when google_workspace_dkim_selector=Pass and dns_write_authority=Pass
spf_hardfail_allowed=true only when sender_inventory=Pass and dns_write_authority=Pass
dmarc_enforcement_allowed=true only when sender_inventory=Pass and dmarc_report_mailbox=Pass and dns_write_authority=Pass
mta_sts_enforce_allowed=true only when mta_sts_https_policy_host=Pass and dns_write_authority=Pass
tls_rpt_publication_allowed=true only when tls_rpt_report_mailbox=Pass and dns_write_authority=Pass
```

## Closure Criteria

```text
domain_hardening_preflight=SolvedVerified
active_cloudflare_ca_set=Pass
cloudflare_ca_source=Pass
dns_write_authority=Pass
sender_inventory=Pass
google_workspace_dkim_selector=Pass
dmarc_report_mailbox=Pass
mta_sts_https_policy_host=Pass
tls_rpt_report_mailbox=Pass
manual_caa_allowed=true
dkim_publication_allowed=true
spf_hardfail_allowed=true
dmarc_enforcement_allowed=true
mta_sts_enforce_allowed=true
tls_rpt_publication_allowed=true
```

STATUS:
  Completeness: 100%
  Self-attested invariants: mutation permissions are false, raw secrets not recorded, external evidence requirements explicit
  Open issues: Cloudflare CA set, DNS write authority, sender inventory, Google DKIM selector, report mailboxes, MTA-STS host
  Next action: fill only public-safe Pass/AwaitingEvidence states after admin-console confirmation, then run scripts/check-domain-hardening-preflight.mjs --require-ready
