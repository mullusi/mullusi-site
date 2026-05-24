<!--
Purpose: define when a Mullusi repository may become public or remain private.
Governance scope: repository visibility, license posture, release intent, history exposure, and public-source safety.
Dependencies: GitHub organization settings, repository metadata, LICENSE, README, tests, examples, and secret scanning.
Invariants: repositories are private by default and become public only by deliberate release approval.
-->

# Repository Release Gate

Mullusi repositories are private by default. A repository may become public only
when its role is intentionally open, its history is reviewed, and its license is
aligned with the release intent.

## Classification

```text
A. KeepPublic
   Intentional public docs, demos, SDKs, specs, research snapshots, or
   governed public evidence mirrors that are not production source.

B. ArchivePublic
   Historical public material that should no longer receive strategic work.

C. MakePrivate
   Website source, runtime code, control planes, product kernels, deployment
   logic, roadmap internals, drafts, datasets, or unreleased systems.

D. DeleteIfSafe
   Demo or obsolete repositories that carry no useful history, dependency, or
   legal record.
```

## Public Release Requirements

A repository may be public only when all checks pass:

```text
release_intent=explicit
license=intentional
readme=public_safe
examples=public_safe
tests=passing_or_not_applicable
history_review=complete
secret_scan=pass
internal_names=none
deployment_logic=none_or_public_safe
patent_sensitive_detail=none_or_cleared
support_boundary=documented
rollback_path=documented
```

## Private-by-Default Categories

- Company website source.
- Governance runtime and control plane.
- Symbolic kernels and product engines.
- Dashboard, billing, authorization, trace storage, and deployment logic.
- Science, health-adjacent, biology, chemistry, fold, and experiment-planning
  internals.
- Draft product names, roadmap registries, unreleased APIs, and internal demos.

## License Rule

Use a permissive public license only when reuse is intentional. The company
website source and private product factory use an all-rights-reserved source
notice unless a specific file states otherwise.

STATUS:
  Completeness: 100%
  Invariants verified: private by default, deliberate release, license intent, rollback path, public governance mirror exception bounded
  Open issues: external repository visibility changes still require account-level action
  Next action: keep public mirrors evidence-only and classify each new public repository before adding strategic work
