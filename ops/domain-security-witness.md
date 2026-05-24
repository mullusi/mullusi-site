<!--
Purpose: record public DNS, certificate-authority, and mail-authentication safety evidence for mullusi.com.
Governance scope: DNSSEC DS, CAA, Google Workspace MX, SPF, DMARC, known Google DKIM selector, MTA-STS, TLS-RPT, and bounded DNS hardening actions.
Dependencies: scripts/check-domain-security.mjs, Cloudflare public DNS-over-HTTPS, Cloudflare SSL/TLS CA documentation, and Google Workspace mail-authentication documentation.
Invariants: no Cloudflare account IDs, DNS target dashboard values, DKIM private keys, mailbox credentials, report payloads, or raw DNS record values are stored here.
-->

# Domain Security Witness

Observed on 2026-05-24:

```text
command=node scripts/check-domain-security.mjs --allow-hardening-gaps
verdict=AwaitingEvidence
proof_state=Unknown
domain_security_state=AwaitingEvidence
dnssec_ds=Pass
caa_policy=AwaitingEvidence
mx_google_workspace=Pass
spf_record=Pass
spf_enforcement=AwaitingEvidence
dmarc_record=Pass
dmarc_policy=none
dmarc_enforcement=AwaitingEvidence
known_google_dkim_selector=AwaitingEvidence
mta_sts=AwaitingEvidence
tls_rpt=AwaitingEvidence
ds_record_count=1
caa_record_count=0
mx_record_count=1
finding=spf_not_hardfail
finding=dmarc_policy_monitoring_only
finding=caa_record_missing
finding=known_google_dkim_selector_missing
finding=mta_sts_policy_missing
finding=tls_rpt_record_missing
raw_dns_values=not_recorded
```

## Meaning

The domain has DNSSEC delegation evidence, Google Workspace mail routing, SPF,
and a DMARC record. The current state is not a delivery outage, but it is not a
closed hardening state. Certificate-authority authorization is absent, SPF is
not hard-fail, DMARC is monitoring-only, the common Google DKIM selector is not
published, and MTA-STS/TLS-RPT evidence is absent.

`AwaitingEvidence` is intentional here: DNS changes can affect certificate
renewal and mail delivery, so the gate records the gaps and blocks a false
`SolvedVerified` claim until admin-console and DNS changes are confirmed.

## Bounded Actions

| Control | Current state | Required action | Closure evidence |
| --- | --- | --- | --- |
| CAA | AwaitingEvidence | Add Cloudflare-compatible CAA records only after confirming the active Cloudflare certificate product and CA set. | `caa_policy=Pass` and nonzero CAA record count. |
| DKIM | AwaitingEvidence | Generate and publish the Google Workspace DKIM TXT record for the active selector, then start authentication in Google Admin. | DKIM selector TXT resolves and a live sent message passes DKIM alignment. |
| SPF | AwaitingEvidence | Inventory every legitimate sender, then move from soft-fail to hard-fail only after no sender gaps remain. | `spf_enforcement=Pass` plus sent-message SPF alignment. |
| DMARC | AwaitingEvidence | Review aggregate reports, then ratchet from `p=none` to `p=quarantine` and later `p=reject` with bounded `pct` rollout. | `dmarc_enforcement=Pass` and no legitimate delivery breakage. |
| MTA-STS | AwaitingEvidence | Publish `_mta-sts` TXT and a valid HTTPS policy at `mta-sts.mullusi.com/.well-known/mta-sts.txt`. | `mta_sts=Pass` and HTTPS policy readback. |
| TLS-RPT | AwaitingEvidence | Publish `_smtp._tls` TXT with a monitored report mailbox. | `tls_rpt=Pass` and report mailbox ownership confirmed. |

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
  Completeness: 70%
  Invariants verified: DNSSEC DS present, Google Workspace MX present, SPF present, DMARC present, raw DNS values not recorded
  Open issues: CAA missing, SPF soft-fail, DMARC monitoring-only, known Google DKIM selector missing, MTA-STS missing, TLS-RPT missing
  Next action: update Cloudflare and Google Workspace DNS controls in the bounded order above, then rerun without --allow-hardening-gaps
