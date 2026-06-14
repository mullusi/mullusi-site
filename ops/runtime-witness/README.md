# Runtime Witness Registry

Purpose: define the public-safe runtime witness authority for products before
any production runtime claim can publish.

Governance scope: runtime witness state, service health evidence, control-plane
bypass prevention, production preflight, rollback state, and public exposure
decision.

Dependencies:

- `ops/runtime-witness/registry.json`
- `ops/runtime-witness/mullu-govern-closure-packet.md`
- `schemas/runtime-witness.schema.json`
- `products/*/product.manifest.json`
- `scripts/generate-platform.mjs`
- `scripts/validate-manifests.mjs`

Invariants:

1. Every product with `runtimeWitnessRequired: true` must have one witness row.
2. The witness row must match product id, manifest path, and runtime service.
3. `controlPlane.required` must be `true`.
4. `controlPlane.bypassAllowed` must be `false`.
5. `preflight.mode` must be `fail-closed`.
6. `runtimeWitnessClosed` is true only when production evidence is complete.
7. Production or public exposure requires `proofState: SolvedVerified`,
   `health.evidenceState: pass`, `preflight.decision: allow`,
   `publicExposure.allowed: true`, and `rollback.state: Ready`.
8. Unknown, missing, stale, or non-passing service health evidence blocks
   production and public exposure.

Public boundary:

The registry may record service names, product ids, endpoint shapes, proof
states, and blocking reasons. It must not record credentials, host secrets,
private deployment URLs, private account ids, database URLs, operator keys, raw
headers, or unpublished source paths.

STATUS:
  Completeness: 100%
  Self-attested invariants: runtime witness format, fail-closed preflight, service health evidence boundary
  Open issues: product witnesses are AwaitingEvidence until product-status promotion, contract, privacy, rollback, and service health evidence close
  Next action: use ops/runtime-witness/mullu-govern-closure-packet.md as the first closure packet candidate
