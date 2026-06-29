<!--
Purpose: select the first production host path for api.mullusi.com without binding Mullusi to a vendor.
Governance scope: runtime hosting boundary, database separation, DNS exposure, TLS/HSTS posture, secret placement, and release gate.
Dependencies: backend deploy package, Cloudflare DNS, managed PostgreSQL, container registry, and production release checklist.
Invariants: no provider account, host IP, password, token, API key, database URL, or billing detail is stored in this file.
-->

# API Runtime Host Path

Selected initial path:

```text
Cloudflare proxied DNS
  -> api.mullusi.com
    -> Linux container host
      -> Nginx TLS reverse proxy
        -> 127.0.0.1:8000
          -> Mullusi Govern Cloud API container
            -> external managed PostgreSQL
```

This is a provider-neutral host decision. It does not require creating a new
public subdomain before the runtime is ready, and it matches the existing
backend deployment package.

## Boundary Decision

| Boundary | Decision | Reason |
| --- | --- | --- |
| Public hostname | `api.mullusi.com` only | Avoid mass subdomain creation |
| DNS exposure | Cloudflare proxied record after host readiness | Hide origin and keep Cloudflare controls |
| Compute | One Linux container host | Smallest deployable production boundary |
| Reverse proxy | Nginx on host | Explicit TLS, timeouts, body limits, and local proxying |
| API process | Docker image from GHCR | Immutable release artifact |
| Database | External managed PostgreSQL | Persistence survives API host rebuilds |
| Secrets | Host secret file or secret manager; never Git | Keeps runtime credentials outside source |
| HSTS | `max-age=86400`, no `includeSubDomains`, no preload | Staged security while surfaces evolve |
| Metrics | Private first | Avoid exposing topology and runtime behavior |

## Release Preconditions

Do not create or route the public DNS record until these are true:

```text
production_image_published=Pass
runtime_host_ready=AwaitingEvidence
runtime_host_evidence_ref=render:event/host-ready-2026-06-29
managed_postgres_ready=Pass
managed_postgres_evidence_ref=control-plane:receipt/docs/GOVERN_CLOUD_PRIVATE_STAGING_WITNESS_2026-06-11.md
schema_applied=AwaitingEvidence
schema_applied_evidence_ref=control-plane:receipt/docs/GOVERN_CLOUD_PRIVATE_STAGING_WITNESS_2026-06-11.md
production_secrets_stored=AwaitingEvidence
deploy_env_check=AwaitingEvidence
release_preflight=AwaitingEvidence
persistence_check=AwaitingEvidence
host_firewall_configured=AwaitingEvidence
tls_certificate_ready=AwaitingEvidence
rollback_path_defined=AwaitingEvidence
private_runtime_witness_ready=AwaitingEvidence
dns_authority_ready=AwaitingEvidence
```

## Host Layout

The backend deployment package already defines this layout:

```text
/opt/mullusi/govern-cloud/docker-compose.production.yaml
/etc/mullusi/govern.env
/etc/nginx/sites-available/api.mullusi.com.conf
/etc/nginx/sites-enabled/api.mullusi.com.conf
/etc/systemd/system/mullusi-govern.service
```

`/etc/mullusi/govern.env` must be created on the host from a secret source. It
must not be copied back into this repository.

## DNS Rule

Cloudflare DNS should be added only after host readiness:

```text
Type: A or CNAME, depending on host provider
Name: api
Target: production host address or provider hostname
Proxy: Proxied
TTL: Auto
```

If the host is not ready, keep `api.mullusi.com` absent rather than publishing a
broken placeholder.

## First Public Verification

After deployment and DNS routing:

```bash
curl https://api.mullusi.com/health
curl https://api.mullusi.com/gateway/witness
curl https://api.mullusi.com/runtime/conformance
curl -I https://api.mullusi.com/health
```

Required witness:

```text
health.status=ok
gateway_witness.runtime_state=SolvedVerified
runtime_conformance.release_gate=ready
Strict-Transport-Security: max-age=86400
```

## Rollback

Rollback must preserve the existing public website and email foundation:

```text
1. Disable or remove only the `api` DNS record.
2. Stop `mullusi-govern.service` on the host.
3. Keep Cloudflare zone, apex website, docs, email, and DNSSEC untouched.
4. Preserve database snapshots and release logs.
5. Record the rollback cause before retrying deployment.
```

STATUS:
  Completeness: 100%
  Self-attested invariants: provider-neutral host path, external persistence, staged HSTS, no secret storage, no placeholder subdomain
  Open issues: production secret store, deploy environment validation, DNS target
  Next action: collect the production_secrets_stored public-safe ref before any DNS publication
