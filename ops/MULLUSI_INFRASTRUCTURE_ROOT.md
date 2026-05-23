<!--
Purpose: record the public-safe root infrastructure inventory for Mullusi.
Governance scope: registrar authority, DNS authority, identity boundary, recovery readiness, public surfaces, and runtime exposure gates.
Dependencies: Namecheap registrar, Cloudflare DNS, Google Workspace, GitHub Pages, GitHub account ownership, and ops release gates.
Invariants: no passwords, recovery codes, API keys, private tokens, billing secrets, or session tokens are stored in this file.
-->

# Mullusi Infrastructure Root

This file is a public-safe operational inventory. It records what controls the
Mullusi public foundation, what is verified, what remains manual, and which
surfaces may be exposed next.

Do not store secrets here. Recovery codes, passwords, API keys, registrar
backup codes, billing details, and token values belong only in an encrypted
password manager or offline encrypted backup.

For local-only notes, use:

```text
ops/recovery-inventory.private.md
```

That file is ignored by Git. Use `ops/recovery-inventory-template.md` as the
public-safe structure.

## Authority Chain

```text
Namecheap registrar
  -> Cloudflare authoritative DNS
      -> GitHub Pages public website/docs
      -> Google Workspace email routing
      -> future governed runtime surfaces
```

## Current Root State

| Layer | State | Evidence | Open Issue |
| --- | --- | --- | --- |
| Domain registrar | Namecheap | Nameservers delegated to Cloudflare | Confirm account recovery and transfer lock |
| DNS authority | Cloudflare | Zone active; Cloudflare nameservers authoritative | Post-stabilization public retest passed |
| Website | Live | `https://mullusi.com` returns 200 through Cloudflare | None |
| Website redirect | Live | `http://mullusi.com` redirects to HTTPS | None |
| Canonical host | AwaitingEvidence | `www.mullusi.com` root and path/query witnesses return 200 through Cloudflare and await one-hop 301 apex redirect proof | Enforce www-to-apex redirect with path/query preservation |
| Docs | Live | `https://docs.mullusi.com` returns 200 through Cloudflare | None |
| Email DNS | Working | MX `smtp.google.com` priority 1; user confirmed send/receive | Retest after 24 hours |
| SPF | Live | `v=spf1 include:_spf.google.com ~all` | None |
| DMARC | Monitoring | `_dmarc` uses `p=none` with aggregate reports | Move policy later after DKIM and report review |
| DNSSEC | Live | DS key tag `2371`, algorithm `13`, digest type `2` | Monitor resolver stability |
| HTTPS baseline | Live | Cloudflare Full strict, Always Use HTTPS, TLS 1.3 | HSTS deferred |
| Cloudflare 2FA | Active | Mobile authenticator active; account requires 2FA | Save recovery codes offline |
| Cloudflare API tokens | None observed | Dashboard showed no account/user API tokens | Do not create tokens until scoped need exists |
| Private runtime witness | Verified locally | Backend gate passes for witness route tests and solo gate | Not deployed to `api.mullusi.com` |
| API host path | Selected | Provider-neutral Linux container host with Nginx and external managed PostgreSQL | Host/provider not provisioned |
| API production gate | Defined | `ops/api-production-readiness-gate.md` blocks DNS until host evidence passes | Preconditions still pending |
| Recovery inventory template | Defined | `ops/recovery-inventory-template.md` defines private inventory structure | Private inventory still pending |
| Recovery completion witness | AwaitingEvidence | `ops/recovery-completion-witness.md` blocks API provisioning | Manual recovery confirmations still pending |

## Post-Stabilization Public Witness

Last checked: 2026-05-22.

| Check | Result |
| --- | --- |
| `https://mullusi.com` | 200 through Cloudflare |
| `https://www.mullusi.com` | 200 through Cloudflare; one-hop 301 canonical redirect AwaitingEvidence |
| `https://www.mullusi.com/proof/?gate=www-canonical` | 200 through Cloudflare; one-hop 301 path/query redirect preservation AwaitingEvidence |
| `http://mullusi.com` | Redirects to `https://mullusi.com/`, then 200 |
| `https://docs.mullusi.com` | 200 through Cloudflare |
| MX | `smtp.google.com` priority 1 |
| SPF | `v=spf1 include:_spf.google.com ~all` |
| DMARC | `_dmarc` monitoring policy present |
| DNSSEC DS | Key tag `2371`, algorithm `13`, digest type `2` |
| DNSSEC validation | Google DNS response has `AD=true` |

## DNSSEC Public Record

```text
Key Tag: 2371
Algorithm: 13
Digest Type: 2
Digest: CA861E2D1FDC73BC739662DA9C838A59662049C2DC8F4108DFCD115FDAF79576
```

DNSSEC records are public by design. This section is a witness record, not a
secret.

## Recovery Hardening Checklist

Complete these manually. Do not paste the resulting codes into this file.

| System | Required Action | Status |
| --- | --- | --- |
| Cloudflare | Save recovery codes offline | Pending user confirmation |
| Cloudflare | Confirm `tamirat@mullusi.com` remains primary infrastructure identity | Confirmed during migration |
| GitHub | Save recovery codes offline | Pending user confirmation |
| GitHub | Confirm owner/admin account recovery path | Pending user confirmation |
| Google Workspace | Confirm admin login and recovery path | Pending user confirmation |
| Google Workspace | Generate DKIM for Gmail when stable | Deferred |
| Namecheap | Confirm 2FA and recovery path | Pending user confirmation |
| Namecheap | Confirm domain transfer lock | Pending user confirmation |
| Billing | Confirm payment owner and renewal path | Pending user confirmation |
| Password manager | Store recovery locations and emergency procedure | Pending user confirmation |

## Public Surface Rule

A subdomain may become public only when all conditions are true:

```text
purpose_defined=true
controlled_target_exists=true
health_behavior_exists=true
owner_defined=true
state_label_defined=true
rollback_path_defined=true
```

Do not create unbuilt public subdomains as placeholders. Unused public surfaces
become governance debt.

## Current Surface Classification

| Surface | State | Purpose | Exposure Rule |
| --- | --- | --- | --- |
| `mullusi.com` | Live | Main public website | Keep stable |
| `www.mullusi.com` | AwaitingEvidence | Canonical one-hop 301 redirect to apex with path/query preservation | Enforce redirect before closing migration |
| `docs.mullusi.com` | Live | Documentation surface | Keep stable |
| `learn.mullusi.com` | Candidate | Guides, concepts, tutorials, learning capsules | Create only with content owner and route |
| `sandbox.mullusi.com` | Deferred | Experimental demos and isolated visualizers | Must be isolated and marked experimental |
| `api.mullusi.com` | Deferred | Governed runtime API | Requires private runtime witness first |
| `dashboard.mullusi.com` | Deferred | Authenticated application UI | Requires real runtime, auth, permissions, storage |
| `metrics.mullusi.com` | Deferred | Operational analytics | Keep private/internal first |
| `status.mullusi.com` | Candidate later | Public uptime and incident status | Safer public alternative to raw metrics |

## Runtime Evidence Milestone

The next architectural closure is production runtime evidence, not broad
subdomain expansion. The private backend already defines the witness routes:

```text
GET /health
GET /gateway/witness
GET /runtime/conformance
```

Current private verification:

```text
backend route tests: pass
backend solo gate: pass
production preflight without production secrets/database: blocked as expected
```

Public API preview may follow only after these routes are deployed behind
`api.mullusi.com` with explicit contracts, structured errors, logging,
validation, rate limiting, durable persistence, and rollback behavior.

## HSTS Rollout

Current state:

```text
Always Use HTTPS: enabled
HSTS: deferred
```

Later staged rollout:

```text
Stage 1: max-age=86400, no includeSubDomains, no preload
Stage 2: increase max-age gradually after stability
Stage 3: consider includeSubDomains only after all subdomains are HTTPS-ready
Stage 4: consider preload only when rollback risk is acceptable
```

Do not enable `includeSubDomains` or preload during active surface evolution.

## Open Governance Items

| Item | Reason | Blocking For |
| --- | --- | --- |
| Save recovery codes offline | Prevent account lockout | Runtime deployment |
| Fill private recovery inventory | Make recovery witnesses operational | Runtime deployment |
| Promote recovery completion witness | Permit host/database provisioning | Runtime deployment |
| Confirm Namecheap transfer lock | Prevent unauthorized domain transfer | Long-term domain security |
| Confirm Google Workspace DKIM | Improve mail authentication | Stronger DMARC policy |
| Define private runtime owner | Clarify operational responsibility | API exposure |
| Deploy runtime witness privately | Turn local witness into hosted evidence | API exposure |
| Provision managed PostgreSQL | Keep durable persistence outside API host | API exposure |
| Satisfy API readiness gate | Prevent premature `api` DNS exposure | API exposure |

STATUS:
  Completeness: 100%
  Invariants verified: no secrets stored, authority chain explicit, recovery before runtime, public surfaces require purpose and health behavior, www redirect not claimed before one-hop 301 root and path/query witnesses
  Open issues: www one-hop 301 redirect enforcement with path/query preservation, recovery code storage, transfer lock confirmation, DKIM setup, hosted runtime witness, managed PostgreSQL
  Next action: enforce www-to-apex redirect, then complete private recovery inventory and promote recovery witness before host/database provisioning
