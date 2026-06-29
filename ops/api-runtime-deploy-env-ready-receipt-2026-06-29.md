<!--
Purpose: record a public-safe deploy environment validation receipt for api.mullusi.com.
Governance scope: pre-DNS API runtime evidence, Render shell validation, private-value exclusion, and DNS denial.
Dependencies: Render private service shell, scripts/check_deploy_env.py, and ops/api-runtime-manual-evidence-checklist.md.
Invariants: no secret values, host addresses, database URLs, provider account identifiers, DNS targets, raw provider payloads, or private recovery material are recorded.
-->

# API Runtime Deploy Environment Ready Receipt

Receipt ref:

```text
receipt://api-runtime/deploy-env-ready/2026-06-29
```

Evidence statement:

```text
surface_id=api.mullusi.com
evidence_item=deploy_env_check_ready
state=Pass
source=render_shell:scripts/check_deploy_env.py
deploy_env_check=ready
required_environment=pass
image=pass
image_detail=tag:v2026.06.11-govern-cloud.1
runtime_key_presence=pass
database_url_shape=pass:remote_postgresql_configured
persistence_policy=pass:required
allowed_origins=pass:count_4
secret_values_recorded=false
host_addresses_recorded=false
database_urls_recorded=false
provider_values_recorded=false
dns_targets_recorded=false
raw_payloads_recorded=false
dns_publication_allowed=false
```

Validation notes:

The deployed Render shell initially showed that `/etc/mullusi/govern.env` was
not present. Render injects runtime configuration through process environment,
so the validator was rerun through a temporary environment file created inside
the container from the required process variables. The temporary file was
deleted immediately after the check. No values were printed or recorded.

This receipt does not close release preflight, persistence, firewall, TLS,
rollback, private runtime witness, or DNS authority gates.

Rollback:

If the deployed runtime configuration changes before release preflight, revert
the `deploy_env_check_ready` row to
`state=AwaitingEvidence public_safe_ref=missing private_value_storage=outside_git`
and rerun the manual evidence validators.

STATUS:
  Completeness: 100%
  Self-attested invariants: public-safe status only, no runtime values recorded, DNS remains blocked, later pre-DNS gates remain separate
  Open issues: release preflight, persistence, firewall, TLS, rollback, private runtime witness, DNS authority
  Next action: collect release_preflight_ready evidence without recording private runtime values
