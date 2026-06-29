<!--
Purpose: record a public-safe TLS readiness receipt for api.mullusi.com.
Governance scope: API TLS evidence, public certificate boundary, DNS-denial boundary, and private-value exclusion.
Dependencies: public HTTPS certificate observation for api.mullusi.com and ops/api-runtime-manual-evidence-checklist.md.
Invariants: no secret values, host addresses, database URLs, DNS targets, provider account identifiers, raw headers, raw payloads, or private recovery material are recorded.
-->

# API Runtime TLS Ready Receipt

Receipt ref:

```text
receipt://api-runtime/tls-ready/2026-06-29
```

Evidence statement:

```text
surface_id=api.mullusi.com
evidence_item=tls_certificate_ready
state=Pass
observed_at=2026-06-29
probe_kind=public_https_certificate
tls_connection=Pass
certificate_subject=api.mullusi.com
certificate_san_api_mullusi_com=Pass
certificate_issuer_family=Google Trust Services
certificate_not_before=2026-06-08
certificate_not_after=2026-09-06
secret_values_recorded=false
host_addresses_recorded=false
database_urls_recorded=false
dns_targets_recorded=false
provider_values_recorded=false
raw_headers_recorded=false
raw_payloads_recorded=false
```

Interpretation:

`api.mullusi.com` presents a valid public certificate whose subject alternative
name covers `api.mullusi.com`. This receipt closes only TLS readiness. It does
not prove DNS publication authority and does not promote product runtime
witnesses.

Rollback:

If the certificate no longer covers `api.mullusi.com`, revert the
`tls_certificate_ready` row to
`state=AwaitingEvidence public_safe_ref=missing private_value_storage=outside_git`
and rerun the manual evidence validators.

STATUS:
  Completeness: 100%
  Self-attested invariants: certificate evidence only, no raw host values, no DNS target values, no provider-private values
  Open issues: DNS authority
  Next action: collect dns_authority_ready approval or audit ref before declaring DNS authority closed
