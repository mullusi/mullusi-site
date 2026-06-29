<!--
Purpose: guide public-safe collection of api.mullusi.com pre-DNS runtime evidence references.
Governance scope: manual evidence sequencing, evidence ref shapes, private-value boundary, DNS denial, rollback readiness, and operator handoff.
Dependencies: ops/api-runtime-manual-evidence-checklist.md, ops/api-production-readiness-gate.md, scripts/validate-api-runtime-manual-evidence-checklist.mjs, and scripts/check-api-production-readiness.mjs.
Invariants: no secret value, host address, database URL, provider account ID, DNS target, token, recovery code, raw header, raw provider payload, or private mailbox content is recorded.
-->

# API Runtime Manual Evidence Runbook

This runbook explains how to close the 13 checklist rows in
`ops/api-runtime-manual-evidence-checklist.md` without storing private runtime
values in Git.

Prepare proposed refs first in
`ops/api-runtime-manual-evidence-intake-template.json`, then validate the JSON
before touching the Markdown checklist.
Use `node scripts/report-api-runtime-manual-evidence-next.mjs` to identify the
next missing evidence item and accepted public-safe reference shapes.

The current state remains:

```text
api_runtime_manual_evidence_checklist=AwaitingEvidence
manual_evidence_item_count=13
manual_evidence_missing_count=9
next_evidence_key=production_secrets_stored
api_dns_publication_allowed=false
secret_values=not_recorded
host_addresses=not_recorded
database_urls=not_recorded
provider_values=not_recorded
raw_headers=not_recorded
raw_payloads=not_recorded
```

## Rule

Each checklist row may move from `state=AwaitingEvidence` to `state=Pass` only
when the operator has a public-safe reference proving the private action was
completed.

Allowed public-safe references:

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

Do not record the real host address, provider hostname, database URL, secret
value, token, password, private recovery value, raw email header, raw provider
payload, or DNS target.

## Evidence Sequence

| Evidence item | Private action that must happen | Public-safe ref to record |
| --- | --- | --- |
| `production_image_published` | Publish an immutable versioned API image | `github:actions/runs/...` or `receipt://api-runtime/image-published/YYYY-MM-DD` |
| `runtime_host_ready` | Provision the private Linux runtime host | `render:event/...` or `receipt://api-runtime/host-ready/YYYY-MM-DD` |
| `managed_postgres_ready` | Provision managed PostgreSQL with backups | `render:event/...` or `receipt://api-runtime/postgres-ready/YYYY-MM-DD` |
| `schema_applied` | Apply the production schema to managed PostgreSQL | `github:actions/runs/...` or `receipt://api-runtime/schema-applied/YYYY-MM-DD` |
| `production_secrets_stored` | Store runtime secrets outside Git | `receipt://api-runtime/secrets-stored/YYYY-MM-DD` |
| `deploy_env_check_ready` | Run deploy environment validation | `github:actions/runs/...` or `receipt://api-runtime/deploy-env-ready/YYYY-MM-DD` |
| `release_preflight_ready` | Run release preflight validation | `github:actions/runs/...` or `receipt://api-runtime/release-preflight-ready/YYYY-MM-DD` |
| `persistence_check_ready` | Verify persistence against managed PostgreSQL | `github:actions/runs/...` or `receipt://api-runtime/persistence-ready/YYYY-MM-DD` |
| `host_firewall_configured` | Limit inbound host exposure to required ports | `receipt://api-runtime/firewall-configured/YYYY-MM-DD` |
| `tls_certificate_ready` | Issue TLS for `api.mullusi.com` without publishing DNS prematurely | `cloudflare:audit/...` or `receipt://api-runtime/tls-ready/YYYY-MM-DD` |
| `rollback_path_defined` | Confirm rollback can disable only API runtime/DNS | `site:ops/api-production-readiness-gate.md` or `approval://api-runtime/rollback/YYYY-MM-DD/operator-approved` |
| `private_runtime_witness_ready` | Collect private runtime health and witness evidence | `github:actions/runs/...` or `control-plane:receipt/...` |
| `dns_authority_ready` | Confirm operator can publish only the API DNS record | `cloudflare:audit/...` or `approval://api-runtime/dns-authority/YYYY-MM-DD/operator-approved` |

## Update Procedure

1. Complete the private action outside this repository.
2. Create or identify one public-safe reference from the accepted families.
3. Edit only the matching checklist row:

```text
evidence_item=<key> state=Pass public_safe_ref=<public-safe-ref> private_value_storage=outside_git
```

4. Run:

```bash
node scripts/report-api-runtime-manual-evidence-next.mjs
node scripts/validate-api-runtime-manual-evidence-intake.mjs
node scripts/validate-api-runtime-manual-evidence-checklist.mjs
node scripts/check-api-production-readiness.mjs
node scripts/report-ops-next-action.mjs
```

5. Do not publish DNS until both checklist and production readiness gates allow
it and the operator gives explicit DNS-publication approval.

## Rollback Boundary

If a private action fails after a row was marked `Pass`, revert that row to:

```text
state=AwaitingEvidence public_safe_ref=missing private_value_storage=outside_git
```

Then rerun the validators. Do not keep a stale `Pass` row.

STATUS:
  Completeness: 100%
  Self-attested invariants: public-safe refs only, no raw private runtime values, no DNS publication, no provider-private payloads, rollback returns stale rows to AwaitingEvidence
  Open issues: 9 checklist rows still require real evidence refs
  Next action: collect the production_secrets_stored public-safe ref, then rerun the checklist validator
