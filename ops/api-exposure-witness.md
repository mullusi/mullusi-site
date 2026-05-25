<!--
Purpose: record the public-safe exposure state for api.mullusi.com before any DNS publication.
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
api_exposure_state=GovernanceBlocked
api_dns_publication_allowed=false
api_runtime_public_state=AwaitingEvidence
recovery_witness_state=AwaitingEvidence
api_provisioning_allowed=false
last_reviewed=2026-05-25
```

The exposure state remains blocked while root recovery evidence is incomplete.
This file does not replace the private recovery inventory; it only records the
public-safe decision boundary.

## Exposure States

| State | Meaning | Public DNS Rule |
| --- | --- | --- |
| GovernanceBlocked | Recovery, host, credential, database, or rollback evidence is missing | Do not publish `api` DNS |
| ReadyForDns | Pre-DNS evidence has passed and rollback authority is confirmed | Publish only `api` DNS |
| SolvedVerified | Public runtime witnesses pass after DNS activation | Keep live and monitor |
| SafeHalt | Public exposure or runtime witness failed | Remove only `api` DNS and preserve evidence |

## Current Gate Table

| Witness | Required State Before DNS | Current State |
| --- | --- | --- |
| Recovery witness | ReadyForProvisioning | AwaitingEvidence |
| API provisioning flag | true | false |
| Host path | accepted | accepted |
| Pre-DNS runtime evidence | Pass | AwaitingEvidence |
| DNS publication | allowed | false |
| Public runtime witness | SolvedVerified after DNS | AwaitingEvidence |

## Executable Check

Run the deterministic repository gate:

```bash
node scripts/check-api-exposure-gate.mjs --expect-blocked
```

Run the optional live public probe during audits:

```bash
node scripts/check-api-exposure-gate.mjs --expect-blocked --live
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
  Invariants verified: no public API DNS before recovery, no raw host values, recovery dependency explicit, live probe public-safe
  Open issues: recovery witness, host provider, managed PostgreSQL, production credentials, release preflight, rollback confirmation
  Next action: keep API exposure blocked until recovery and pre-DNS runtime evidence pass
