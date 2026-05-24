<!--
Purpose: define the bounded execution runbook for Mullusi domain certificate and email-authentication hardening.
Governance scope: CAA, SPF, DKIM, DMARC, MTA-STS, TLS-RPT, staged rollout, validation commands, and rollback.
Dependencies: ops/domain-security-witness.md, scripts/check-domain-security.mjs, Cloudflare DNS, Cloudflare SSL/TLS certificate-authority documentation, Google Workspace Admin DKIM/SPF/DMARC documentation, and public DNS readback.
Invariants: no DNS mutation occurs from this file; no DKIM private keys, mailbox credentials, provider account IDs, report payloads, or raw secret values are stored here.
-->

# Domain Security Hardening Runbook

This runbook converts the domain-security witness gaps into a bounded execution
order. It must be executed from the Cloudflare and Google Workspace admin
surfaces, then verified from this repository with public DNS readback.

## Current Evidence

```text
witness=ops/domain-security-witness.md
checker=scripts/check-domain-security.mjs
current_domain_security_state=AwaitingEvidence
dnssec_ds=Pass
mx_google_workspace=Pass
spf_record=Pass
dmarc_record=Pass
caa_policy=AwaitingEvidence
spf_enforcement=AwaitingEvidence
dmarc_enforcement=AwaitingEvidence
known_google_dkim_selector=AwaitingEvidence
mta_sts=AwaitingEvidence
tls_rpt=AwaitingEvidence
```

## Execution Order

| Step | Control | Action | Precondition | Rollback |
| --- | --- | --- | --- | --- |
| 1 | Sender inventory | List all legitimate senders for `mullusi.com`: Google Workspace, website mail, support tooling, monitoring, and future API mail. | Every sender has an owner and expected envelope domain. | Keep SPF as soft-fail and DMARC as `p=none`. |
| 2 | DKIM | Generate a 2048-bit Google Workspace DKIM record and publish the selector shown in Google Admin. Start authentication only after public DNS resolves. | Google Admin DKIM selector and TXT value are visible in the admin console. | Remove the unpublished TXT record or stop authentication in Google Admin. |
| 3 | DMARC reports | Route aggregate reports to a monitored mailbox or group before enforcement. | Report mailbox/group exists and is reviewed. | Return `rua` to the prior monitored destination. |
| 4 | CAA | Confirm the active Cloudflare edge certificate authority set before adding CAA. If Cloudflare DNS auto-manages CAA for the active product, record that evidence instead of adding manual CAA. | Cloudflare SSL/TLS dashboard or API readback identifies the active certificate product and CA set. | Remove manual CAA records that block Cloudflare renewal. |
| 5 | SPF enforcement | After sender inventory and DKIM alignment pass, change SPF from soft-fail to hard-fail. | No legitimate sender is outside the SPF mechanism set. | Revert to soft-fail if legitimate mail fails SPF alignment. |
| 6 | DMARC staged enforcement | Move from `p=none` to `p=quarantine; pct=25`, then raise `pct`, then move to `p=reject` only after reports remain clean. | SPF or DKIM alignment is passing for legitimate mail. | Lower `pct` or return to `p=none` if legitimate mail is quarantined or rejected. |
| 7 | MTA-STS | Publish `_mta-sts` TXT and a valid HTTPS policy at `mta-sts.mullusi.com/.well-known/mta-sts.txt`; start with testing mode. | The `mta-sts` host serves HTTPS with a valid certificate. | Lower policy mode to testing or remove TXT if delivery errors appear. |
| 8 | TLS-RPT | Publish `_smtp._tls` TXT to a monitored report mailbox. | Report mailbox/group exists and is reviewed. | Remove or reroute the report destination if it is not monitored. |

## CAA Boundary

Cloudflare documentation states that Cloudflare controls Universal certificate
issuance and renewal, and that Cloudflare DNS may add required CAA records on
behalf of the zone. If manual CAA is required, the candidate CA contents must
come from the current Cloudflare certificate-authority documentation and the
active certificate product, not from memory.

```text
manual_caa_allowed=false until active_cloudflare_ca_set=confirmed
caa_candidate_set_source=Cloudflare SSL/TLS certificate-authorities documentation
caa_closure_requires=nonzero CAA DNS readback + certificate renewal not blocked
```

## Mail Authentication Boundary

Google Workspace documentation requires DKIM public-key generation through the
Admin console, DNS publication of the generated TXT record, and activation after
DNS is visible. DMARC enforcement must be staged after SPF or DKIM alignment is
observed, using report evidence to avoid breaking legitimate mail.

```text
no_spf_hardfail_without_sender_inventory
no_dmarc_enforcement_without_spf_or_dkim_alignment
no_dkim_claim_without_google_admin_selector_readback
no_mta_sts_enforce_without_https_policy_readback
no_unmonitored_report_destinations
```

## Validation Commands

Before any DNS change:

```bash
node scripts/check-domain-security.mjs --allow-hardening-gaps
```

After each DNS change:

```bash
node scripts/check-domain-security.mjs --allow-hardening-gaps
```

Only after every hardening item is expected to close:

```bash
node scripts/check-domain-security.mjs
```

## Closure Criteria

```text
domain_security_state=SolvedVerified
dnssec_ds=Pass
caa_policy=Pass
mx_google_workspace=Pass
spf_record=Pass
spf_enforcement=Pass
dmarc_record=Pass
dmarc_enforcement=Pass
known_google_dkim_selector=Pass
mta_sts=Pass
tls_rpt=Pass
finding=none
```

STATUS:
  Completeness: 100%
  Invariants verified: bounded execution order, CAA precondition, sender-inventory precondition, DMARC staged rollout, rollback defined
  Open issues: active Cloudflare CA set, Google Workspace DKIM selector, sender inventory, report mailbox ownership, MTA-STS host
  Next action: confirm Cloudflare active certificate authority set and Google Workspace DKIM selector before mutating DNS
