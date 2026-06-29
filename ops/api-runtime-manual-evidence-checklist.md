<!--
Purpose: provide a public-safe manual evidence intake checklist for api.mullusi.com pre-DNS runtime readiness.
Governance scope: production image, private runtime host, managed PostgreSQL, schema, runtime secrets, release checks, firewall, TLS, rollback, private runtime witness, and DNS authority evidence.
Dependencies: ops/api-production-readiness-gate.md, ops/api-runtime-host-path.md, scripts/validate-api-runtime-manual-evidence-checklist.mjs, and scripts/check-api-production-readiness.mjs.
Invariants: no secret value, host address, database URL, provider account ID, DNS target, recovery code, token, raw header, or raw provider payload is stored in this file.
-->

# API Runtime Manual Evidence Checklist

This checklist is the public-safe intake path for the 13 manual evidence items
that must close before `api.mullusi.com` DNS can be published.

The checklist records only evidence state and public-safe references. Private
values remain outside Git.

```text
api_runtime_manual_evidence_checklist=SolvedVerified
manual_evidence_item_count=13
manual_evidence_missing_count=0
api_dns_publication_allowed=true
secret_values=not_recorded
host_addresses=not_recorded
database_urls=not_recorded
provider_values=not_recorded
raw_headers=not_recorded
raw_payloads=not_recorded
```

## Accepted Reference Shapes

Use one of these public-safe reference families when an item is ready:

```text
approval://...
receipt://...
github:actions/runs/...
github:pull/...
site:ops/...
control-plane:receipt/...
control-plane:pull/...
render:event/...
cloudflare:audit/...
google-workspace:audit/...
```

Do not paste provider private values, host addresses, database URLs, DNS
targets, tokens, raw provider payloads, raw message headers, or recovery codes.

## Manual Evidence Items

```text
evidence_item=production_image_published state=Pass public_safe_ref=github:actions/runs/28353797103:api-image-published private_value_storage=outside_git
evidence_item=runtime_host_ready state=Pass public_safe_ref=render:event/host-ready-2026-06-29 private_value_storage=outside_git
evidence_item=managed_postgres_ready state=Pass public_safe_ref=control-plane:receipt/docs/GOVERN_CLOUD_PRIVATE_STAGING_WITNESS_2026-06-11.md private_value_storage=outside_git
evidence_item=schema_applied state=Pass public_safe_ref=control-plane:receipt/docs/GOVERN_CLOUD_PRIVATE_STAGING_WITNESS_2026-06-11.md private_value_storage=outside_git
evidence_item=production_secrets_stored state=Pass public_safe_ref=receipt://api-runtime/secrets-stored/2026-06-29 private_value_storage=outside_git
evidence_item=deploy_env_check_ready state=Pass public_safe_ref=receipt://api-runtime/deploy-env-ready/2026-06-29 private_value_storage=outside_git
evidence_item=release_preflight_ready state=Pass public_safe_ref=receipt://api-runtime/release-preflight-ready/2026-06-29 private_value_storage=outside_git
evidence_item=persistence_check_ready state=Pass public_safe_ref=receipt://api-runtime/persistence-ready/2026-06-29 private_value_storage=outside_git
evidence_item=host_firewall_configured state=Pass public_safe_ref=receipt://api-runtime/firewall-configured/2026-06-29 private_value_storage=outside_git
evidence_item=tls_certificate_ready state=Pass public_safe_ref=receipt://api-runtime/tls-ready/2026-06-29 private_value_storage=outside_git
evidence_item=rollback_path_defined state=Pass public_safe_ref=site:ops/api-production-readiness-gate.md private_value_storage=outside_git
evidence_item=private_runtime_witness_ready state=Pass public_safe_ref=control-plane:receipt/runtime-witness-ready-2026-06-29 private_value_storage=outside_git
evidence_item=dns_authority_ready state=Pass public_safe_ref=cloudflare:audit/dns-authority-2026-06-29 private_value_storage=outside_git
```

## Validation

Use `ops/api-runtime-manual-evidence-runbook.md` before changing any row to
`state=Pass`.

```bash
node scripts/validate-api-runtime-manual-evidence-intake.mjs
node scripts/validate-api-runtime-manual-evidence-checklist.mjs
node scripts/check-api-production-readiness.mjs
```

The readiness checker must still report `api_dns_publication_allowed=false`
until all checklist items are changed to `state=Pass` with public-safe
references and the production readiness gate is run with matching evidence.

STATUS:
  Completeness: 100%
  Self-attested invariants: no raw provider values, no secret values, no host addresses, no database URLs, no DNS target, DNS remains blocked while evidence is missing
  Open issues: none
  Next action: run final readiness validation before any approval-bound DNS publication
