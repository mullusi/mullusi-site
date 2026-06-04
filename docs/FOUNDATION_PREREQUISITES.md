# Mullusi Website Foundation Prerequisites

Purpose: define the public-safe prerequisite ladder for website copy while Mullusi remains in solo-founder preparation.
Governance scope: public copy, proof boundary, contact language, pilot boundary, deployment restraint, and public-safe prerequisite disclosure.
Dependencies: `docs/FOUNDATION_MODE.md`, `README.md`, `ops/public-claim-gate.md`, `ops/solo-developer-assistant-handoff.md`, and `scripts/validate-site.mjs`.
Invariants: no customer-access claim, no active pilot invitation, no runtime deployment claim, no endpoint-readiness claim, and no private account, DNS, credential, or legal-detail disclosure.

## Current Public Meaning

Foundation prerequisites are preparation work, not launch work. The website may
say Mullusi is preparing local proof, claim boundaries, documentation,
readiness gates, and prerequisite evidence. It must not imply that customers can
use a live runtime, join a pilot, request access, rely on public endpoints, or
treat the product as production-ready.

External witness blockers apply to product/runtime release claims. They do not block the current static `mullusi.com` website, public routes, proof boundary, status route, or foundation copy.

## Public-Safe Prerequisite Ladder

| Layer | Public-safe wording | Blocked wording |
| --- | --- | --- |
| Local proof | Local proof first | Live runtime ready |
| Local proof thread | First proof thread remains local, harmless, approval-gated, receipt-bound, and rollback-named | Public runtime proof complete |
| Public claim boundary | No customer access or deployment claim | Customer access is open |
| Pilot posture | Pilot access is not open yet | Request pilot access |
| Runtime posture | Runtime claims AwaitingEvidence | Live endpoint |
| API posture | Endpoint readiness not claimed | Public API is ready |
| Dashboard posture | Dashboard route reserved | Operator dashboard is live |
| Sandbox posture | Sandbox route reserved | Public sandbox is available |
| Legal/business | Legal and company readiness are prerequisites | Legal clearance is complete |
| Security/recovery | Recovery and security evidence remain prerequisites | Recovery complete without witness |

## Public Copy Rule

Use these phrases:

- "Foundation before launch."
- "Local proof first."
- "Static website published; product runtime release witnesses AwaitingEvidence."
- "First local proof thread is approval-gated and receipt-bound."
- "Prerequisite setup is underway."
- "No customer access or deployment claim."
- "Runtime claims AwaitingEvidence."
- "Pilot access is not open yet."

Do not use these phrases until the evidence gates are explicitly closed:

- "Request access"
- "Start pilot"
- "private beta"
- "production-ready"
- "live endpoint"
- "public sandbox is available"
- "customer access is open"

## Assistant Rule

When website work continues, keep the visible surface in Foundation Mode:

1. Do not turn `/pilot/` into intake.
2. Do not turn `/contact/` into sales or access routing.
3. Do not publish private account, credential, DNS target, provider dashboard,
   or legal-detail evidence.
4. Keep public status tied to validation output and claim gates.
5. State whether changes are local only, committed, pushed, or deployed.

STATUS:
  Completeness: 100%
  Invariants verified: public-safe prerequisite wording, no customer access claim, no deployment claim, no pilot invitation, no endpoint-readiness claim
  Open issues: runtime, API, dashboard, sandbox, legal, recovery, and customer access evidence remain AwaitingEvidence
  Next action: keep this prerequisite ladder synchronized with public copy and website validators
