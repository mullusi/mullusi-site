<!--
Purpose: record the Mullusi governance doctrine as a versioned, evidence-bound, reversible artifact.
Governance scope: doctrine invariants, declared evidence state, public philosophy, service-tier language, release-surface schema, and rollback lineage.
Dependencies: ops/public-claim-gate.md, ops/product-release-gate.md, ops/MULLUSI_INFRASTRUCTURE_ROOT.md, data/site.json, proof route, and validation scripts.
Invariants: the doctrine carries its own evidence boundary; no clause is published as Verified beyond what runtime witnesses support.
-->

# Mullusi Doctrine v1.2

## Evidence State

```text
Verified against Mullusi architecture and public philosophy.
AwaitingEvidence against full runtime conformance until signed witness endpoints close.
```

The doctrine is itself a claim and carries its own evidence boundary. It is
Verified against the architecture and the published philosophy, and
AwaitingEvidence against runtime conformance until `/health`,
`/gateway/witness`, and `/runtime/conformance` publish signed witness evidence.

## Invariants

```text
1.  No claim without declared evidence state.
2.  No action without governance.
3.  No consequence without re-governance.
4.  No verdict without trace.
5.  No user-visible simplification that cannot be reversed to its full trace.
6.  No proof without boundary.
7.  No boundary transition without governance, witness, and lineage.
8.  No release without reversible judgment, snapshot reference, and superseded-by lineage.
9.  No speed, deadline, demo, sales pressure, or investor pressure may mutate evidence state.
10. No complexity exposed unless it increases user value.
11. No protected internal surface may be made public without governed promotion.
12. The governance layer is itself a hardened, threat-modeled surface.
13. This doctrine is itself versioned, evidence-bound, and reversible.
```

## Public Philosophy

### North Star

```text
Mullusi builds governed intelligence for consequential action.
Every proposed action is checked against authority, constraints, evidence,
and causal trace before it executes - and every consequence can be re-checked
as conditions change.
```

### Internal Invariant

```text
No claim without evidence.
No action without governance.
No consequence without re-governance.
No proof without trace.
No trace without boundary.
```

### Public Motto

```text
Evidence before action.
```

### Operational Expansion

```text
Every action checked. Every consequence re-checked. Every verdict traced.
```

The operational expansion handles autonomous loops, partial actions, and
condition drift. A single pre-execution check is not sufficient for
long-running agents: later consequences require re-governance, not just one
atomic check.

## Old Way vs Mullusi Way

| Old way                                      | Mullusi way                                    |
| -------------------------------------------- | ---------------------------------------------- |
| Model output drives action directly          | Model output becomes a proposal                |
| Prompt confidence is treated as readiness    | Action requires governed verdict               |
| Logs appear after execution                  | Trace exists before execution                  |
| One approval covers a whole agent run        | Consequences are re-checked as context changes |
| UI summarizes without proof linkage          | Every surface field is reversible to trace     |
| Rollback means hiding or replacing old state | Rollback creates superseded lineage            |
| Deadlines pressure evidence claims           | Evidence state cannot be mutated by pressure   |

Mullusi does not replace model output. It governs whether output-derived
actions execute, and re-governs their consequences as conditions change.

## Service-Tier Language

```text
Free demonstrates the verdict-trace loop.
Pro operationalizes governance into developer workflows.
Enterprise governs high-consequence actions with full audit lineage.
Governed Pilot applies Mullusi to one high-risk workflow with declared evidence boundaries.
```

Tier language must not import a statistical-learning frame. The deterministic
symbolic positioning means a tier never "teaches the model"; it exposes more of
the governed verdict-trace-proof loop.

## Release Surface

```text
release_surface := {
  surface_id,
  claim,
  evidence_state,
  proof_boundary,
  snapshot_ref,
  supersedes,
  superseded_by,
  witness_ref,
  rollback_policy,
  public_notice_required
}
```

## Rollback Rule

```text
rollback(surface_id):
  old_surface.superseded_by := new_surface.surface_id
  preserve old claim
  mark old evidence_state as superseded / deprecated / rejected
  publish notice if public claim changed
  notify dependent consumers if they relied on the old claim
```

Rollback never erases a prior claim. It preserves lineage through
`superseded_by` and issues public notice where a public claim changed.

## Publication Posture

```text
Mullusi Doctrine v1.2
Status: Verified against architecture; AwaitingEvidence against runtime conformance.
Judgment: PublishableWithBoundary
```

The doctrine is publishable with a declared boundary. It is not published as
fully Verified until runtime witness evidence exists. The commercial surface is
approachable, the symbolic invariants remain intact, streaming and agentic
loops are handled by consequence re-governance, boundary leakage is patched, and
release lineage and rollback are defined.

STATUS:
  Completeness: 100%
  Invariants verified: declared evidence state, consequence re-governance, reversible release, rollback lineage, threat-modeled governance layer, doctrine versioning
  Open issues: runtime conformance witnesses remain AwaitingEvidence
  Next action: apply before each doctrine, philosophy, or public-claim change
