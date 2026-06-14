<!--
Purpose: record the public-safe exposure state for api.mullusi.com before and after DNS publication.
Governance scope: API DNS publication, runtime public reachability, recovery dependency, and witness boundary.
Dependencies: ops/recovery-completion-witness.md, ops/api-production-readiness-gate.md, ops/api-runtime-host-path.md, and scripts/check-api-exposure-gate.mjs.
Invariants: no host IP, provider account id, credential value, database URL, billing detail, or private inventory path is stored in this file.
-->

# API Exposure Witness

This witness answers one question:

```text
Can api.mullusi.com be publicly exposed now?
```

Current answer:

```text
api_exposure_state=SolvedVerified
api_dns_publication_allowed=true
api_runtime_public_state=SolvedVerified
recovery_witness_state=ReadyForProvisioning
api_provisioning_allowed=true
last_reviewed=2026-06-14
```

The exposure state is `SolvedVerified` for the API gateway after pre-DNS
evidence passed, DNS was present, and the public HTTPS health probe was
reachable. This file does not promote product runtime witnesses; it only records
the public-safe API gateway exposure boundary.

Observed on 2026-06-14:

```text
command=node scripts/check-api-exposure-gate.mjs --live --require-ready
verdict=SolvedVerified
proof_state=Pass
api_dns_publication_allowed=true
recovery_witness_state=ReadyForProvisioning
api_provisioning_allowed=true
api_runtime_public_state=SolvedVerified
dns_probe_state=Present
https_probe_state=Reachable
blocker=none
raw_host_values=not_recorded
secret_values=not_read
private_recovery_values=not_read
```

`ReadyForDns` is a pre-DNS state. It means publication is allowed after all
private evidence passes, even if the public `api` record is still absent.
`SolvedVerified` is a post-DNS state. It requires the public runtime witness to
be reachable and recorded after DNS activation.

## Exposure States

| State | Meaning | Public DNS Rule |
| --- | --- | --- |
| GovernanceBlocked | Recovery, host, credential, database, or rollback evidence is missing | Do not publish `api` DNS |
| AwaitingEvidence | Recovery is complete, but private runtime evidence is still incomplete | Do not publish `api` DNS |
| ReadyForDns | Pre-DNS evidence has passed and rollback authority is confirmed | Publish only `api` DNS |
| SolvedVerified | Public runtime witnesses pass after DNS activation | Keep live and monitor |
| SafeHalt | Public exposure or runtime witness failed | Remove only `api` DNS and preserve evidence |

## Current Gate Table

| Witness | Required State Before DNS | Current State |
| --- | --- | --- |
| Recovery witness | ReadyForProvisioning | ReadyForProvisioning |
| API provisioning flag | true | true |
| Host path | accepted | accepted |
| Pre-DNS runtime evidence | Pass | Pass |
| DNS publication | allowed | true |
| Public runtime witness | SolvedVerified after DNS | SolvedVerified |

## Executable Check

Run the live repository gate:

```bash
node scripts/check-api-exposure-gate.mjs --live --require-ready
```

Run the optional live public probe during audits:

```bash
node scripts/check-api-exposure-gate.mjs --live
```

The live probe reports only public-safe state names and record counts. It does
not store or print host addresses.

## Promotion Rule

Promote only after `ops/recovery-completion-witness.md` says:

```text
recovery_witness_state=ReadyForProvisioning
api_provisioning_allowed=true
```

Then record:

```text
api_exposure_state=ReadyForDns
api_dns_publication_allowed=true
```

Do not promote from memory or assumption. Promotion requires private recovery
evidence, release preflight evidence, persistence evidence, and rollback
authority to be checked first.

## Safe Halt Rule

If public DNS or public runtime reachability appears while this witness says
`api_dns_publication_allowed=false`, the state is:

```text
api_exposure_state=SafeHalt
action=remove_only_api_dns
```

Leave apex, www, docs, email, DNSSEC, and Cloudflare account settings
unchanged.

STATUS:
  Completeness: 100%
  Self-attested invariants: recovery dependency explicit, public API DNS witnessed, live probe public-safe, no raw host values, product runtime witnesses remain separate
  Open issues: product runtime witnesses remain AwaitingEvidence
  Next action: keep API gateway monitored and prepare product-specific runtime witness closure packets one at a time
