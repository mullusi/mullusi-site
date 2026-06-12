<!--
Purpose: summarize Mullusi website, API, runtime, recovery, and domain-hardening release readiness without promoting blocked surfaces.
Governance scope: public static website witness, API DNS gate, product runtime witnesses, recovery prerequisite, domain hardening preflight, and next-action ordering.
Dependencies: ops/live-deployment-integrity-witness.md, ops/api-exposure-witness.md, ops/api-production-readiness-gate.md, ops/recovery-completion-witness.md, ops/domain-security-witness.md, ops/domain-security-preflight.md, and ops/runtime-witness/registry.json.
Invariants: no host IP, DNS target, provider account id, recovery code, credential, database URL, billing detail, or private inventory path is stored here.
-->

# Release Readiness Summary

This file is the public-safe go/no-go map for the Mullusi website and product
release boundary. It prevents a closed static website witness from being
misread as a product/runtime release witness.

Observed on 2026-06-12:

```text
website_static_deployment_integrity=AwaitingEvidence
live_status_manifest=Pass
local_status_manifest_match=AwaitingEvidence
api_exposure_state=GovernanceBlocked
api_dns_publication_allowed=false
api_production_readiness_state=Blocked
product_runtime_release_witness=AwaitingEvidence
recovery_witness_state=AwaitingEvidence
api_provisioning_allowed=false
domain_security_state=SolvedVerified
domain_hardening_preflight=GovernanceBlocked
raw_secret_values=not_recorded
private_recovery_values=not_read
```

## Readiness Table

| Surface | Current state | Evidence file | Release decision |
| --- | --- | --- | --- |
| Static website parity | AwaitingEvidence | `ops/live-deployment-integrity-witness.md` | Keep public; rerun after deployment propagation or status-manifest alignment |
| Public visibility | SolvedVerified | `ops/public-visibility-witness.md` | Keep public and monitor regional visibility |
| Security headers | SolvedVerified | `ops/security-header-witness.md` | Keep current Cloudflare header policy |
| API DNS exposure | GovernanceBlocked | `ops/api-exposure-witness.md` | Do not publish `api` DNS |
| API production readiness | AwaitingEvidence | `ops/api-production-readiness-gate.md` | Continue private setup only |
| Product runtime witnesses | AwaitingEvidence | `ops/runtime-witness/registry.json` | Do not claim product runtime release |
| Recovery prerequisite | AwaitingEvidence | `ops/recovery-completion-witness.md` | Complete private recovery inventory outside Git |
| Domain security readback | SolvedVerified | `ops/domain-security-witness.md` | Keep current DNS/mail controls and monitor |
| Domain mutation authority | GovernanceBlocked | `ops/domain-security-preflight.md` | No CAA, SPF, DKIM, DMARC, MTA-STS, or TLS-RPT mutation yet |

## Go/No-Go Rule

```text
static_website_public=true
product_runtime_release=false
api_dns_publication_allowed=false
runtime_claims_allowed=false
domain_hardening_mutation_allowed=false
```

The static website may remain public because live manifest readback, live
content hashes, route sentinels, visibility, security headers, and
domain-security readback pass. Current local/live status-manifest parity remains
`AwaitingEvidence`, so the current repository state must not be described as
fully deployed until parity closes. Product/runtime release remains blocked
because recovery, host, persistence, TLS, DNS authority, rollback, and runtime
witness evidence are still open.

## Next-Action Order

1. Complete private recovery inventory outside Git.
2. Promote `ops/recovery-completion-witness.md` only after all public-safe rows
   are confirmed.
3. Collect API pre-DNS evidence: host, managed persistence, production secrets,
   release preflight, schema, TLS, firewall, rollback, and private runtime
   witness.
4. Publish `api` DNS only after `api_dns_publication_allowed=true`.
5. Collect post-DNS public runtime evidence before any `SolvedVerified` product
   release claim.
6. Harden domain security only after `ops/domain-security-preflight.md` changes
   from `GovernanceBlocked` to `SolvedVerified`.

## Edge Cases

| Edge case | Required response |
| --- | --- |
| Static website passes but runtime witnesses remain open | Report website as `SolvedVerified`; report product/runtime release as `AwaitingEvidence` |
| `api` DNS appears while `api_dns_publication_allowed=false` | Enter `SafeHalt`; remove only `api` DNS and preserve apex/www/email |
| Domain hardening evidence is incomplete | Keep all mutation flags false |
| Private recovery inventory is missing from Git | Treat as expected blocker; do not commit private locations or codes |
| Product page copy implies runtime availability | Reword or remove until runtime witness closes |

STATUS:
  Completeness: 100%
  Self-attested invariants: static website and product runtime boundaries separated, API DNS remains blocked, domain mutation remains blocked, no private values recorded
  Open issues: recovery inventory, API runtime, product runtime witnesses, DNS authority, domain hardening evidence
  Next action: complete private recovery inventory outside Git before API or product release promotion
