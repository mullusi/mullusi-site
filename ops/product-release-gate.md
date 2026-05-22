<!--
Purpose: define when a Mullusi product or domain engine may move from private incubation to public surface.
Governance scope: product status, route readiness, demo boundary, proof state, docs, support, and rollback.
Dependencies: data/products.json, data/site.json, proof route, docs route, public demo route, and validation scripts.
Invariants: no product is marketed as live until its evidence, route, and support boundary are present.
-->

# Product Release Gate

Mullusi exposes one public product spine first: Mullu Govern Evaluation. Other
engines remain staged or private until their release gate closes.

## Product States

```text
Private
  Internal work. Not listed as a public product.

Research
  Public-safe research description only. No product-readiness claim.

Staged
  Roadmap surface with controlled language and no runtime claim.

AwaitingEvidence
  Route or demo exists, but runtime witness closure is not published.

Live
  Public route, proof boundary, support path, and witness evidence exist.

Archived
  Retained for lineage, not active product positioning.
```

## Release Requirements

```text
public_name=approved
route=reachable
docs=reachable_or_deferred_with_reason
demo=live_or_explicitly_simulated
proof_boundary=present
runtime_claim=matched_to_witness_state
support_contact=present
legal_claims=bounded
regulated_domain_review=pass_or_not_applicable
source_boundary=private_or_public_release_declared
rollback_path=documented
```

## Mullu Govern Evaluation Public Boundary

Allowed public statement:

```text
Mullu evaluates proposed actions against explicit rules, records traceable
reasoning, and returns a governed verdict before execution.
```

Required caveat until runtime witness closure:

```text
Live runtime readiness remains AwaitingEvidence until the proof boundary
publishes signed witness evidence.
```

## Staged Domain Boundary

Staged domains may be named only as roadmap records. They must not be described
as shipped tools, clinical tools, treatment systems, animal-trial authorization,
or operational runtime services.

STATUS:
  Completeness: 100%
  Invariants verified: product state, proof boundary, runtime witness, support path
  Open issues: live runtime endpoints remain AwaitingEvidence
  Next action: keep staged engines out of live-product copy until the gate closes
