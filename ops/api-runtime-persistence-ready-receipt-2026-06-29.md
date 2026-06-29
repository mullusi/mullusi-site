<!--
Purpose: record a public-safe persistence validation receipt for api.mullusi.com.
Governance scope: pre-DNS API runtime persistence evidence, managed PostgreSQL schema readiness, private-value exclusion, and DNS denial.
Dependencies: Render private service shell, scripts/check_persistence.py, and ops/api-runtime-manual-evidence-checklist.md.
Invariants: no secret values, host addresses, database URLs, provider account identifiers, DNS targets, raw provider payloads, or private recovery material are recorded.
-->

# API Runtime Persistence Ready Receipt

Receipt ref:

```text
receipt://api-runtime/persistence-ready/2026-06-29
```

Evidence statement:

```text
surface_id=api.mullusi.com
evidence_item=persistence_check_ready
state=Pass
source=render_shell:scripts/check_persistence.py
persistence_check=ready
detail=postgres_schema_ready
tooling_hint=postgres_tooling_missing
secret_values_recorded=false
host_addresses_recorded=false
database_urls_recorded=false
provider_values_recorded=false
dns_targets_recorded=false
raw_payloads_recorded=false
dns_publication_allowed=false
```

The tooling hint means the container did not expose direct PostgreSQL client
tooling, so the deployed persistence checker used its schema-ready validation
path. The result was still `state=ready`.

This receipt does not close firewall, TLS, rollback, private runtime witness, or
DNS authority gates.

STATUS:
  Completeness: 100%
  Self-attested invariants: public-safe status only, no runtime values recorded, DNS remains blocked
  Open issues: firewall, TLS, rollback, private runtime witness, DNS authority
  Next action: collect host_firewall_configured evidence without recording private runtime values
