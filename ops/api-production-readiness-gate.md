<!--
Purpose: define the go/no-go gate before api.mullusi.com receives public DNS.
Governance scope: recovery readiness, provider-neutral host provisioning, managed PostgreSQL, production credential placement, release preflight, DNS activation, and rollback.
Dependencies: ops/MULLUSI_INFRASTRUCTURE_ROOT.md, ops/api-runtime-host-path.md, backend deploy package, Cloudflare DNS, container registry, and managed PostgreSQL.
Invariants: no provider account id, host IP, credential value, database URL, recovery code, billing detail, or token value is stored in this file.
-->

# API Production Readiness Gate

This gate controls when `api.mullusi.com` may become public. The rule is:

```text
no_runtime_witness -> no_api_dns
```

The public website, docs, email, DNSSEC, and Cloudflare baseline must remain
untouched while this gate is executed.

## Decision States

```text
Blocked
  Required evidence is missing or unsafe.

AwaitingEvidence
  Private host work exists, but at least one witness is still unverified.

ReadyForDns
  Host, database, credentials, TLS, preflight, and rollback evidence pass.

Live
  DNS is published and public witness checks pass.

RolledBack
  API exposure was removed while preserving root website and email stability.
```

## Pre-Provision Requirements

| Requirement | Pass Condition | Block Condition |
| --- | --- | --- |
| Recovery inventory | Cloudflare, GitHub, Google, Namecheap recovery paths saved offline | Any root account has no recovery path |
| Recovery witness | `ops/recovery-completion-witness.md` promoted to `ReadyForProvisioning` | `api_provisioning_allowed=false` |
| Domain transfer lock | Namecheap transfer lock confirmed | Transfer lock unknown or disabled |
| Host path | `ops/api-runtime-host-path.md` accepted | Host path undefined |
| Runtime owner | Operator responsible for host and database named in private inventory | No owner |
| Cost boundary | Monthly spend ceiling recorded outside this repo | No spend ceiling |
| Rollback owner | Operator who can remove `api` DNS identified | No rollback authority |

## Provisioning Requirements

| Requirement | Pass Condition | Block Condition |
| --- | --- | --- |
| Container host | Linux host reachable by operator over SSH | Host missing |
| Firewall | Only SSH, HTTP, and HTTPS exposed as required | Broad inbound ports |
| Managed PostgreSQL | External database reachable from host | Local-only or missing database |
| Backups | Database backup policy enabled | No backup path |
| Secret placement | Runtime values stored on host or secret manager only | Runtime values copied into Git |
| Image | Versioned GHCR image selected | `latest` image tag |
| TLS | Certificate issued for `api.mullusi.com` | No certificate |
| HSTS | `max-age=86400`, no `includeSubDomains`, no preload | Strong HSTS applied early |

## Pre-DNS Evidence

Before Cloudflare DNS receives an `api` record, run from the host or release
workstation:

```bash
python scripts/check_deploy_env.py /etc/mullusi/govern.env
python scripts/preflight_release.py
python scripts/apply_schema.py
python scripts/check_persistence.py
```

Required result:

```text
deploy_env_check state=ready
release_preflight state=ready
persistence_check state=ready detail=postgres_schema_ready
```

If any command blocks, do not create the DNS record.

The public-safe aggregate reporter for this gate is:

```bash
node scripts/check-api-production-readiness.mjs --require-ready \
  --production-image-published \
  --runtime-host-ready \
  --managed-postgres-ready \
  --schema-applied \
  --production-secrets-stored \
  --deploy-env-ready \
  --release-preflight-ready \
  --persistence-ready \
  --host-firewall-configured \
  --tls-certificate-ready \
  --rollback-path-defined \
  --private-runtime-witness-ready \
  --dns-authority-ready
```

The reporter records only boolean evidence presence and public-safe blocker
names. It must not print host addresses, DNS target values, database URLs,
secret values, provider account IDs, or private recovery details.

## DNS Activation Rule

Only after pre-DNS evidence passes:

```text
Cloudflare DNS:
  type=A or CNAME
  name=api
  target=production host address or provider hostname
  proxy=proxied
  ttl=auto
```

No other future subdomain should be created as part of this step.

## Post-DNS Evidence

After DNS is live:

```bash
curl https://api.mullusi.com/health
curl https://api.mullusi.com/gateway/witness
curl https://api.mullusi.com/runtime/conformance
curl -I https://api.mullusi.com/health
python scripts/probe_persistence.py
python scripts/probe_trace.py
```

Required result:

```text
health.status=ok
gateway_witness.runtime_state=SolvedVerified
runtime_conformance.release_gate=ready
Strict-Transport-Security: max-age=86400
probe_passed storage=stored
trace_probe_passed
```

## Rollback Rule

If post-DNS evidence fails:

```text
1. Remove or disable only the Cloudflare `api` DNS record.
2. Stop the API host service.
3. Preserve database snapshots and host logs.
4. Leave apex, www, docs, email, DNSSEC, and Cloudflare account settings unchanged.
5. Record failure cause before retry.
```

## Go/No-Go Judgment

| Judgment | Condition | Action |
| --- | --- | --- |
| GovernanceBlocked | Recovery, credential, host, database, or HSTS gate fails | Do not publish DNS |
| AwaitingEvidence | Host exists but preflight or persistence is incomplete | Continue private setup |
| ReadyForDns | All pre-DNS evidence passes | Publish only `api` DNS |
| SolvedVerified | Public witness and probes pass | Keep live and monitor |
| SafeHalt | Runtime writes fail closed | Remove `api` DNS and preserve evidence |

STATUS:
  Completeness: 100%
  Self-attested invariants: no placeholder DNS, recovery before exposure, external persistence, staged HSTS, rollback preserves root foundation
  Open issues: concrete host provider, managed PostgreSQL endpoint, production credential store, recovery checklist confirmation
  Next action: satisfy pre-provision requirements before any public `api` DNS record is created
