<!--
Purpose: define the Mullusi IP disclosure gate before publishing algorithms, kernels, datasets, research workflows, or implementation detail.
Governance scope: trade-secret exposure, patent-sensitive disclosure, public research snapshots, license posture, and high-level public descriptions.
Dependencies: repository release gate, product release gate, public claim gate, legal review when needed, and source-control lineage.
Invariants: implementation detail stays private until an IP decision is recorded and release scope is explicit.
-->

# IP Disclosure Gate

Before any technical detail becomes public, determine whether it reveals
implementation rather than purpose. Public pages may explain what Mullusi is
building and which boundary is active. Private repositories hold the construction
system, algorithms, kernels, datasets, and unreleased product structure.

## Disclosure Questions

```text
Does this reveal an algorithm?
Does this reveal a novel symbolic kernel?
Does this reveal execution routing, memory routing, or proof construction?
Does this reveal a dataset, benchmark, or trade-secret workflow?
Does this disclose implementation rather than purpose?
Does this reveal product architecture that may warrant formal protection?
Has patent, trademark, copyright, or trade-secret posture been decided?
```

If any answer is `yes` and no release decision exists, do not publish.

## Public-Safe Form

```text
Mullusi is developing governed symbolic evaluation systems for traceable
decision control.
```

## Private-Only Form

```text
Exact execution algorithms, symbolic memory graphs, inference routing rules,
kernel internals, datasets, benchmarks, deployment logic, and unreleased
product architecture remain private unless approved for a separate release.
```

## Release Decision Record

```text
Artifact:
  File, route, repository, dataset, or paper.

Disclosure class:
  Purpose | Interface | Demonstration | Implementation | Dataset | Benchmark

Protection decision:
  KeepPrivate | PublishHighLevel | PublishSnapshot | OpenRelease | SeekReview

License:
  Proprietary | PublicDocs | PublicDemo | OpenSourceSpecific

Evidence:
  Reviewer, commit, issue, release record, or legal note.

Rollback:
  Removal or replacement path if exposure is later rejected.
```

STATUS:
  Completeness: 100%
  Self-attested invariants: implementation privacy, release decision, license intent, rollback path
  Open issues: formal legal review is outside this repository
  Next action: run before publishing technical internals or research artifacts
