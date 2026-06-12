<!--
Purpose: record public DNS, certificate-authority, and mail-authentication safety evidence for mullusi.com.
Governance scope: DNSSEC DS, CAA, Google Workspace MX, SPF, DMARC, known Google DKIM selector, MTA-STS, TLS-RPT, and bounded DNS hardening actions.
Dependencies: scripts/check-domain-security.mjs, Cloudflare public DNS-over-HTTPS, Cloudflare SSL/TLS CA documentation, and Google Workspace mail-authentication documentation.
Invariants: no Cloudflare account IDs, DNS target dashboard values, DKIM private keys, mailbox credentials, report payloads, or raw DNS record values are stored here.
-->

# Domain Security Witness

Observed on 2026-06-12:

```text
command=node scripts/check-domain-security.mjs
verdict=SolvedVerified
proof_state=Pass
domain_security_state=SolvedVerified
dnssec_ds=Pass
caa_policy=Pass
mx_google_workspace=Pass
spf_record=Pass
spf_enforcement=Pass
dmarc_record=Pass
dmarc_policy=quarantine
dmarc_enforcement=Pass
known_google_dkim_selector=Pass
mta_sts=Pass
tls_rpt=Pass
ds_record_count=1
caa_record_count=12
mx_record_count=1
finding=none
raw_dns_values=not_recorded
```

## Meaning

The public DNS readback now has DNSSEC delegation evidence, CAA policy,
Google Workspace mail routing, SPF enforcement, DMARC enforcement at
`p=quarantine`, the known Google DKIM selector, MTA-STS, and TLS-RPT.

This closes the public DNS/mail-authentication readback witness. It does not
close future DNS mutation authority. `ops/domain-security-preflight.md` remains
the separate admin-side mutation gate and must stay `GovernanceBlocked` until
Cloudflare, Google Workspace, sender inventory, and report-mailbox authority are
confirmed without recording private values.

## Bounded Actions

| Control | Current state | Required action | Closure evidence |
| --- | --- | --- | --- |
| CAA | Pass | Preserve current Cloudflare-compatible CAA policy unless the active CA set changes. | `caa_policy=Pass` and nonzero CAA record count. |
| DKIM | Pass | Preserve the active Google Workspace DKIM selector and rotate only through admin-confirmed procedure. | DKIM selector TXT resolves. |
| SPF | Pass | Preserve hard-fail only while sender inventory remains accurate. | `spf_enforcement=Pass`. |
| DMARC | Pass | Keep monitoring aggregate reports before any later `p=reject` ratchet. | `dmarc_enforcement=Pass` and no legitimate delivery breakage. |
| MTA-STS | Pass | Preserve `_mta-sts` TXT and HTTPS policy readback. | `mta_sts=Pass`. |
| TLS-RPT | Pass | Preserve `_smtp._tls` TXT and monitored report mailbox ownership. | `tls_rpt=Pass`. |

## Guardrails

```text
no_caa_without_cloudflare_ca_confirmation
no_spf_hardfail_without_sender_inventory
no_dmarc_enforcement_without_dkim_or_spf_alignment
no_mta_sts_enforce_without_https_policy_readback
no_raw_dns_secret_or_report_payload_storage
```

## Closure Command

```bash
node scripts/check-domain-security.mjs
```

Use `--allow-hardening-gaps` only while recording the current evidence without
blocking the operator shell:

```bash
node scripts/check-domain-security.mjs --allow-hardening-gaps
```

STATUS:
  Completeness: 100%
  Self-attested invariants: DNSSEC DS present, CAA present, Google Workspace MX present, SPF enforcement present, DMARC quarantine present, DKIM selector present, MTA-STS present, TLS-RPT present, raw DNS values not recorded
  Open issues: future DNS mutation authority remains gated by ops/domain-security-preflight.md
  Next action: keep domain mutation authority blocked until admin-side preflight evidence is explicitly confirmed
