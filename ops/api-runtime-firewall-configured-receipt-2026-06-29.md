<!--
Purpose: record a public-safe host firewall/exposure receipt for api.mullusi.com.
Governance scope: pre-DNS API runtime exposure boundary, Render private service posture, private-value exclusion, and DNS denial.
Dependencies: Render private service dashboard, ops/api-runtime-host-path.md, and ops/api-runtime-manual-evidence-checklist.md.
Invariants: no secret values, host addresses, database URLs, provider account identifiers, DNS targets, raw provider payloads, or private recovery material are recorded.
-->

# API Runtime Firewall Configured Receipt

Receipt ref:

```text
receipt://api-runtime/firewall-configured/2026-06-29
```

Evidence statement:

```text
surface_id=api.mullusi.com
evidence_item=host_firewall_configured
state=Pass
source=render_dashboard:private_service_shell
runtime_service_class=private_service
public_ingress_state=not_exposed
api_dns_publication_allowed=false
dns_record_published=false
secret_values_recorded=false
host_addresses_recorded=false
database_urls_recorded=false
provider_values_recorded=false
dns_targets_recorded=false
raw_payloads_recorded=false
```

Interpretation:

The runtime is currently hosted as a Render Private Service. Before public DNS
publication, this is stricter than a public host firewall rule because no public
service ingress is exposed. This receipt does not authorize public DNS or claim
TLS readiness.

Rollback:

If the runtime service is changed to a public web service before TLS and DNS
authority gates close, revert the `host_firewall_configured` row to
`state=AwaitingEvidence public_safe_ref=missing private_value_storage=outside_git`
and rerun the manual evidence validators.

STATUS:
  Completeness: 100%
  Self-attested invariants: private-service exposure only, no host values recorded, DNS remains blocked
  Open issues: TLS, rollback, private runtime witness, DNS authority
  Next action: collect tls_certificate_ready evidence without publishing API DNS prematurely
