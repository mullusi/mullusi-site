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

Observed on 2026-06-25 after public mirror PR #239, private deploy-source PR
#117, and Cloudflare Pages workflow run `28187685917`:

```text
website_static_deployment_integrity=SolvedVerified
live_status_manifest=Pass
local_status_manifest_match=Pass
api_exposure_state=SolvedVerified
api_dns_publication_allowed=true
api_production_readiness_state=ReadyForDns
product_runtime_release_witness=AwaitingEvidence
product_runtime_claims_allowed=false
public_product_release_allowed=false
recovery_witness_state=ReadyForProvisioning
api_provisioning_allowed=true
domain_security_state=SolvedVerified
domain_hardening_preflight=SolvedVerified
raw_secret_values=not_recorded
private_recovery_values=not_read
```

## Readiness Table

| Surface | Current state | Evidence file | Release decision |
| --- | --- | --- | --- |
| Static website publication | SolvedVerified | `ops/live-deployment-integrity-witness.md` | Keep public and monitor strict parity |
| Public visibility | SolvedVerified | `ops/public-visibility-witness.md` | Keep public and monitor regional visibility |
| Security headers | SolvedVerified | `ops/security-header-witness.md` | Keep current Cloudflare header policy |
| API DNS exposure | SolvedVerified | `ops/api-exposure-witness.md` | Keep live and monitor |
| API production readiness | ReadyForDns | `ops/api-production-readiness-gate.md` | Retain pre-DNS evidence packet |
| Product runtime witnesses | AwaitingEvidence | `ops/runtime-witness/registry.json` | Do not claim product runtime release |
| Recovery prerequisite | ReadyForProvisioning | `ops/recovery-completion-witness.md` | Continue private runtime provisioning |
| Domain security readback | SolvedVerified | `ops/domain-security-witness.md` | Keep current DNS/mail controls and monitor |
| Domain mutation authority | SolvedVerified | `ops/domain-security-preflight.md` | Mutation authority is available only through the bounded hardening runbook |

## Go/No-Go Rule

```text
static_website_public=true
static_website_integrity=SolvedVerified
product_runtime_release=false
api_dns_publication_allowed=true
api_gateway_public=true
runtime_claims_allowed=false
product_runtime_claims_allowed=false
public_product_release_allowed=false
domain_hardening_mutation_allowed=true
```

The static website may remain public because live manifest readback, live
content hashes, route sentinels, visibility, security headers, and
domain-security readback pass. Product/runtime release remains blocked because
product-specific service health, privacy, contract, rollback, SDK, and runtime
witness evidence are still open.

## Next-Action Order

1. Keep strict static deployment integrity in scheduled probes.
2. Keep the API gateway live witness monitored through the exposure gate and
   control-plane deployment witness.
3. Select one product runtime witness candidate and prepare the product-status
   promotion decision plus service health, rollback, privacy, and contract
   evidence.
4. Collect post-DNS public runtime evidence before any `SolvedVerified` product
   release claim.
5. Keep future domain-security changes inside the bounded runbook and rerun
   public DNS readback after every mutation.

## Edge Cases

| Edge case | Required response |
| --- | --- |
| Static website passes but runtime witnesses remain open | Report website as `SolvedVerified`; report product/runtime release as `AwaitingEvidence` |
| `api` DNS appears while `api_dns_publication_allowed=false` | Enter `SafeHalt`; remove only `api` DNS and preserve apex/www/email |
| Domain hardening evidence regresses | Return mutation permissions to false and rerun the preflight |
| Private recovery inventory is missing from Git | Treat as expected blocker; do not commit private locations or codes |
| Product page copy implies runtime availability | Reword or remove until runtime witness closes |

STATUS:
  Completeness: 100%
  Self-attested invariants: static website, API gateway, public mirror, private deploy source, and product runtime boundaries separated; static parity closed; domain mutation remains bounded; no private values recorded
  Open issues: product runtime witnesses, dashboard, sandbox, metrics, SDK, and proof-stamp witnesses
  Next action: keep static parity monitored, then prepare one product runtime witness closure packet when runtime evidence is available
