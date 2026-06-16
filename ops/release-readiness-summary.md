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

Observed on 2026-06-16 after private deploy-source PR #96:

```text
website_static_deployment_integrity=AwaitingEvidence
live_status_manifest=Pass
local_status_manifest_match=AwaitingEvidence
publicMirrorMode=governance-boundary
byteParityWithPrivateDeploySource=false
privateDeploySourceAuthoritative=true
publicReleaseArtifactApproved=false
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
| Static website publication | SolvedVerified | private deploy-source PR #96, Cloudflare deploy workflow, live safety workflow | Keep public; live site is deployed from controlled private source |
| Public mirror byte parity | Intentional non-parity | `ops/live-deployment-integrity-witness.md` | Do not copy private deployed source into the public mirror unless a governed public release artifact is approved |
| Public visibility | SolvedVerified | `ops/public-visibility-witness.md` | Keep public and monitor regional visibility |
| Security headers | SolvedVerified | `ops/security-header-witness.md` | Keep current Cloudflare header policy |
| API DNS exposure | SolvedVerified | `ops/api-exposure-witness.md` | Keep live and monitor |
| API production readiness | ReadyForDns | `ops/api-production-readiness-gate.md` | Keep the pre-DNS evidence packet retained |
| Product runtime witnesses | AwaitingEvidence | `ops/runtime-witness/registry.json` | Do not claim product runtime release |
| Recovery prerequisite | ReadyForProvisioning | `ops/recovery-completion-witness.md` | Continue private runtime provisioning |
| Domain security readback | SolvedVerified | `ops/domain-security-witness.md` | Keep current DNS/mail controls and monitor |
| Domain mutation authority | SolvedVerified | `ops/domain-security-preflight.md` | Mutation authority is available only through the bounded hardening runbook |

## Go/No-Go Rule

```text
static_website_public=true
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
domain-security readback pass through the controlled private deploy source.
Current public-mirror/live status-manifest parity remains `AwaitingEvidence`,
and that non-parity is intentional: this repository is a public governance
mirror, not the authoritative live deploy source. The mirror must not receive a
private-source byte copy unless Mullusi approves and publishes a separate public
release artifact. Product/runtime release remains blocked because
product-specific service health, privacy, contract, rollback, SDK, and runtime
witness evidence are still open.

## Next-Action Order

1. Preserve the public mirror as a governance-boundary mirror. Do not force
   byte parity with the private deploy source without an approved public release
   artifact.
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
| Public mirror does not match private deployed source | Report `byteParityWithPrivateDeploySource=false` by design; do not copy private source into the mirror |
| `api` DNS appears while `api_dns_publication_allowed=false` | Enter `SafeHalt`; remove only `api` DNS and preserve apex/www/email |
| Domain hardening evidence regresses | Return mutation permissions to false and rerun the preflight |
| Private recovery inventory is missing from Git | Treat as expected blocker; do not commit private locations or codes |
| Product page copy implies runtime availability | Reword or remove until runtime witness closes |

STATUS:
  Completeness: 100%
  Self-attested invariants: static website, API gateway, public mirror, private deploy source, and product runtime boundaries separated; domain mutation remains bounded; no private values recorded
  Open issues: product runtime witnesses, runtime API closure, dashboard, sandbox, metrics, SDK, and proof-stamp witnesses
  Next action: keep public mirror non-parity documented, then prepare one product runtime witness closure packet when runtime evidence is available
