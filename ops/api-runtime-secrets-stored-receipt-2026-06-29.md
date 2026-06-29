<!--
Purpose: record a public-safe presence-only receipt for api.mullusi.com runtime secret storage.
Governance scope: pre-DNS API runtime evidence, repository value boundary, operator-attested external storage, and DNS denial.
Dependencies: ops/api-runtime-manual-evidence-checklist.md, ops/api-runtime-manual-evidence-runbook.md, and Render-hosted runtime configuration.
Invariants: no secret values, host addresses, database URLs, provider account identifiers, DNS targets, raw provider payloads, or private recovery material are recorded.
-->

# API Runtime Secrets Stored Receipt

Receipt ref:

```text
receipt://api-runtime/secrets-stored/2026-06-29
```

Evidence statement:

```text
surface_id=api.mullusi.com
evidence_item=production_secrets_stored
state=Pass
storage_boundary=outside_git
source=operator-attested_render_runtime_configuration
secret_values_recorded=false
host_addresses_recorded=false
database_urls_recorded=false
provider_values_recorded=false
dns_targets_recorded=false
raw_payloads_recorded=false
dns_publication_allowed=false
```

Scope:

This receipt records only that the runtime configuration material was placed
outside the repository for the Render-hosted API runtime. It does not disclose
names, values, connection strings, provider account details, raw dashboard
payloads, or DNS targets.

This receipt does not prove the deployed process can read the runtime
configuration. That proof remains the separate `deploy_env_check_ready` gate.

Rollback:

If the external runtime configuration is removed or rotated before deployment
validation, revert the `production_secrets_stored` row to
`state=AwaitingEvidence public_safe_ref=missing private_value_storage=outside_git`
and rerun the manual evidence validators.

STATUS:
  Completeness: 100%
  Self-attested invariants: presence-only receipt, values outside Git, DNS remains blocked, deployment environment check remains separate
  Open issues: deploy environment validation, release preflight, persistence, firewall, TLS, rollback, private runtime witness, DNS authority
  Next action: collect deploy_env_check_ready evidence without recording private runtime values
