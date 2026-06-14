<!--
Purpose: define the longitudinal live-safety witness monitor for mullusi.com.
Governance scope: scheduled public visibility, origin, security-header, security.txt, domain-hardening, search-surface, and artifact-retention evidence.
Dependencies: .github/workflows/live-safety.yml and public-safe live checker scripts.
Invariants: no secrets, raw private logs, provider account IDs, or raw response-header values are stored in monitor artifacts.
-->

# Live Safety Monitor

The scheduled monitor runs once per day from GitHub Actions:

```text
workflow=.github/workflows/live-safety.yml
schedule=41 7 * * *
artifact_name=live-safety-witness-${{ github.run_id }}-${{ github.run_attempt }}
artifact_retention_days=90
artifact_directory=live-safety-witness/
artifact_capture=node scripts/capture-live-safety-witness.mjs live-safety-witness
artifact_validation=node scripts/check-live-safety-witness.mjs live-safety-witness
raw_response_bodies=not_recorded
raw_response_headers=not_recorded
javascript_action_runtime=Node24
```

## Probe Set

```text
public_visibility=node scripts/check-public-visibility.mjs
regional_public_visibility=node scripts/check-public-visibility.mjs --external-globalping --allow-pending
origin_headers=node scripts/check-website-origin.mjs
security_headers=node scripts/check-live-security-headers.mjs
security_txt=node scripts/check-security-txt.mjs
domain_security=node scripts/check-domain-security.mjs
domain_hardening_preflight=node scripts/check-domain-hardening-preflight.mjs --require-ready
search_indexing_surface=node scripts/check-search-indexing-surface.mjs
deployment_integrity=node scripts/check-live-deployment-integrity.mjs --allow-pending
artifact_validator=node scripts/check-live-safety-witness.mjs live-safety-witness
```

The capture script writes one public-safe witness file per command into the
uploaded artifact, then runs the validator before upload. Failed probes are
recorded as bounded failure witnesses without stderr or private values.
The regional visibility probe uses Globalping as its scheduled external
provider and is allowed to remain pending because external probe providers are
not a Mullusi-controlled invariant.
When the regional probe does not close, the workflow emits a GitHub Actions
warning and preserves the exact `AwaitingEvidence` output, structured
`external_probe_provider_error`, and `external_probe_error` in the artifact.
The artifact validator runs before upload and fails closed when required
public-safe witness files are missing, malformed, or contain forbidden private
boundary terms.

## Workflow Annotations

```text
deployment_integrity_annotation=notice when SolvedVerified or SolvedUnverified with edge_html_transform=AcceptedBoundary
deployment_integrity_annotation=warning when AwaitingEvidence or GovernanceBlocked
domain_security_annotation=notice while domain_security_state=SolvedVerified
domain_hardening_preflight_annotation=notice while domain_hardening_preflight=SolvedVerified
regional_visibility_annotation=warning when external_multi_region_visibility remains AwaitingEvidence
```

## Evidence Rule

```text
single_run_public_edge=SolvedVerified when public visibility, origin headers, security headers, security.txt metadata, and search surface pass
security_txt_metadata=SolvedVerified when contacts, policy, canonical URL, preferred languages, and Expires freshness pass
domain_security_hardening=SolvedVerified while CAA, DKIM, SPF enforcement, DMARC enforcement, MTA-STS, and TLS-RPT pass public DNS readback
domain_hardening_preflight=SolvedVerified while external admin evidence and mutation permissions remain promoted
deployment_integrity=SolvedVerified when live status-manifest hashes match governed live files and route sentinels pass
deployment_integrity=SolvedUnverified when live files match live status after canonical Cloudflare edge transforms, route sentinels pass, and edge_html_transform=AcceptedBoundary
deployment_integrity=AwaitingEvidence when live files match live status but local status has not caught up
regional_visibility=SolvedVerified when external distinct-region passes meet the checker floor with no external findings
regional_visibility=SolvedUnverified when the region floor is met but an external node is pending or failed
regional_visibility_pending=warning_annotation plus artifact evidence when the external provider returns rate limit or pending state
longitudinal_evidence=Pass after repeated scheduled artifacts remain available for review
universal_all_users_visibility=AwaitingEvidence
runtime_api_readiness=AwaitingEvidence
```

The monitor proves continuity over observed runs. It does not prove every
network path, every ISP, API readiness, dashboard readiness, or future edge
state after unobserved changes.

STATUS:
  Completeness: 100%
  Self-attested invariants: scheduled probe set declared, artifact validator declared, artifact retention declared, security.txt disclosure metadata declared, public-safe witness boundary declared, universal claim boundary preserved
  Open issues: longitudinal evidence depends on future scheduled runs
  Next action: review uploaded live-safety artifacts after scheduled execution
