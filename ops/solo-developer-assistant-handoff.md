# Solo Developer Assistant Handoff

Purpose: define the safe working contract for coding assistants supporting a single Mullusi developer.
Governance scope: source ownership, generated artifact handling, public claim boundaries, validation order, and handoff trace.
Dependencies: product manifests, generated registries, runtime witness registry, validation scripts, and Cloudflare artifact builder.
Invariants: one developer remains the final authority, generated artifacts are not hand-edited, public claims require proof bindings, and every assistant handoff leaves a reproducible validation trace.

## Operating Rule

Mullusi is maintained by one developer with help from multiple coding assistants. Therefore the architecture must prefer small enforceable contracts over large process overhead.

Assistants may make bounded code changes, but they must not create hidden state or undocumented release paths.

## Foundation Mode

The website is in Foundation Mode, defined in `docs/FOUNDATION_MODE.md`.

Current public boundary:

- Local proof first.
- Pilot access is not open.
- Contact is for foundation, research, support, and public-route questions.
- Product runtime claims remain `AwaitingEvidence`.
- No customer access or product production-service claim is allowed without closed product witness evidence.

When public copy changes, preserve this boundary unless the user explicitly asks to open a governed access path and the relevant recovery, runtime, security, rollback, and public-claim gates pass.

## Source Authority

| Surface | Source of truth | Edit rule |
|---|---|---|
| Product identity | `products/*/product.manifest.json` | Edit manifest first |
| Product scaffolding | `scripts/scaffold-product.mjs` | Dry-run first, write only with `--write` |
| Public product registry | `data/generated/*.json` | Generated only |
| Public non-product surfaces | `data/manual/public-surfaces.json` | Manual, no product rows |
| Claims | `proof/*.proof.json` | Bind every claim to witnesses |
| Runtime witness | `ops/runtime-witness/registry.json` | Fail-closed until endpoints close |
| Product scaffold | `scripts/scaffold-product.mjs` | Dry-run first, write only after planned files are reviewed |
| Homepage runtime | `assets/runtime/*`, `assets/render/*`, `assets/app.js` | Keep boot, lifecycle, context, and rendering separate |
| Secondary routes | `assets/pages/*` | Keep boot files thin |
| Deployment artifact | `dist/` | Built by `scripts/build-cloudflare-pages.mjs` |

## Forbidden Assistant Moves

1. Do not edit generated files directly.
2. Do not expose a product without a manifest.
3. Do not add public product claims without `proof/*.proof.json` claim bindings.
4. Do not mark runtime public or production-ready without closed runtime witness evidence.
5. Do not place renderer logic back into route boot files.
6. Do not introduce public text containing unsupported runtime, quality, scale, or production claims.
7. Do not add corrupted or decomposed fidel text; omit optional translations until clean atomic text is available.
8. Do not create a new product by hand when `scripts/scaffold-product.mjs` can create the governed starter bundle.
9. Do not turn `/pilot/` into an access or intake route while Foundation Mode is active.

## Product Scaffold Rule

For new Search, Browse, world-modeling, physics, biology, dashboard, or sandbox product families, start with a dry run:

```bash
node scripts/scaffold-product.mjs --id=mullu-world-modeling --name="Mullu World Modeling" --category=world-modeling
```

After reviewing the planned files, write only with:

```bash
node scripts/scaffold-product.mjs --id=mullu-world-modeling --name="Mullu World Modeling" --category=world-modeling --write
```

Then run generation and checkpoint validation. The scaffold starts private-incubation, keeps homepage exposure off unless explicitly requested, and records the runtime witness as blocked.

## Required Validation Trace

## Current Operator State

As of 2026-06-25, the current public-safe operator state is:

```text
recovery_witness_state=ReadyForProvisioning
api_provisioning_allowed=true
domain_hardening_preflight=SolvedVerified
domain_dns_mutation_allowed=true
api_exposure_state=AwaitingEvidence
api_dns_publication_allowed=false
api_production_readiness_state=AwaitingEvidence
product_runtime_release_witness=AwaitingEvidence
```

The next safe local command is:

```bash
npm run ops:next
```

The command is read-only and reports aggregate state only. It does not read or
print private recovery locations, browser sessions, Cloudflare dashboard values,
DNS target values, host addresses, database URLs, mailbox contents, or secret
values.

Current external blockers:

```text
product_runtime_witness
```

Do not continue to product production-runtime claims until the selected product
runtime evidence is closed outside Git and the local gates report readiness.

Run these before handoff when the touched area is relevant:

Preferred local checkpoint:

```bash
node scripts/validate-checkpoint.mjs
```

Optional npm aliases:

```bash
npm run checkpoint
npm run checkpoint:backend
npm run ops:next
npm run validate:api-exposure
npm run test:api-exposure
npm run validate:api-production
npm run test:api-production
npm run validate:domain-hardening
npm run test:domain-hardening
npm run validate:security-txt
npm run test:security-txt
npm run validate:ops
npm run test:ops
npm run test:ops-next
npm run validate:private-recovery
npm run test:private-recovery
npm run scaffold:product
npm run test:scaffold-product
```

On Windows PowerShell, use `npm.cmd run checkpoint` if the local execution policy blocks `npm.ps1`.

CI uses the same checkpoint. Update `scripts/validate-checkpoint.mjs` for new
local/CI gates instead of duplicating the gate list in `.github/workflows/validate.yml`.

Expanded checkpoint:

```bash
node --check assets/app.js
node --check assets/runtime/page-runtime.js
node --check assets/runtime/preference-runtime.js
node --check assets/runtime/substrate-runtime.js
node --check assets/runtime/homepage-lifecycle-plan.js
node --check assets/runtime/homepage-controller.js
node --check assets/runtime/homepage-context.js
node --check assets/registry/homepage-registry.js
node --check assets/render/site-content.js
node --check assets/render/public-surface-registry.js
node --check assets/render/product-registry.js
node --check assets/render/news-activity.js
node --check assets/pages/route-preferences.js
node --check assets/pages/proof-renderer.js
node --check assets/pages/proof.js
node --check assets/pages/playground-simulator.js
node --check assets/pages/playground.js
node --check assets/pages/mullu.js
node --check scripts/scaffold-product.mjs
node --check scripts/test-scaffold-product.mjs
node --check scripts/validate-checkpoint.mjs
node --check scripts/test-validate-checkpoint.mjs
node --check scripts/scaffold-product.mjs
node --check scripts/test-scaffold-product.mjs
node --check scripts/check-ops-gates.mjs
node --check scripts/test-ops-gates.mjs
node --check scripts/report-ops-next-action.mjs
node --check scripts/test-report-ops-next-action.mjs
node --check scripts/check-api-exposure-gate.mjs
node --check scripts/test-check-api-exposure-gate.mjs
node --check scripts/check-api-production-readiness.mjs
node --check scripts/test-check-api-production-readiness.mjs
node --check scripts/check-domain-hardening-preflight.mjs
node --check scripts/test-check-domain-hardening-preflight.mjs
node --check scripts/check-private-recovery-inventory.mjs
node --check scripts/test-private-recovery-inventory.mjs
node --check scripts/check-security-txt.mjs
node --check scripts/test-check-security-txt.mjs
node scripts/generate-platform.mjs --check
node scripts/scaffold-product.mjs
node scripts/test-scaffold-product.mjs
node scripts/validate-architecture-boundaries.mjs
node scripts/test-validate-architecture-boundaries.mjs
node scripts/test-validate-checkpoint.mjs
node scripts/test-scaffold-product.mjs
node scripts/check-ops-gates.mjs
node scripts/test-ops-gates.mjs
node scripts/report-ops-next-action.mjs
node scripts/test-report-ops-next-action.mjs
node scripts/check-api-exposure-gate.mjs
node scripts/test-check-api-exposure-gate.mjs
node scripts/check-api-production-readiness.mjs
node scripts/test-check-api-production-readiness.mjs
node scripts/check-api-production-readiness.mjs
node scripts/check-domain-hardening-preflight.mjs
node scripts/test-check-domain-hardening-preflight.mjs
node scripts/check-private-recovery-inventory.mjs --allow-missing
node scripts/test-private-recovery-inventory.mjs
node scripts/check-security-txt.mjs
node scripts/test-check-security-txt.mjs
node scripts/validate-site.mjs
node scripts/validate-manifests.mjs
node scripts/validate-runtime-witnesses.mjs
node scripts/test-build-cloudflare-pages.mjs
node scripts/verify-registry-repos.mjs
```

When backend files change, also run:

```bash
cd backend
python -m unittest discover -s tests
```

## Handoff Format

Every assistant handoff must state:

```text
Changed:
Validated:
Blocked:
Next:
```

`Blocked` must say `none` only when there is no known unresolved gate.

STATUS:
  Completeness: 100%
  Self-attested invariants: solo authority, dry-run-first product scaffold, generated artifact boundary, proof-bound claim boundary, fail-closed runtime witness, fail-closed ops gate, fail-closed ops next-action reporter, fail-closed API exposure gate, fail-closed API production readiness gate, domain hardening preflight, security.txt expiry gate, private recovery boundary, thin route boot files
  Open issues: product runtime witness evidence remains manual
  Next action: run npm run ops:next, then prepare one product runtime witness closure packet before changing product claims
