<!--
Purpose: define the longitudinal live-safety witness monitor for mullusi.com.
Governance scope: scheduled public visibility, origin, security-header, search-surface, and artifact-retention evidence.
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
raw_response_headers=not_recorded
javascript_action_runtime=Node24
```

## Probe Set

```text
public_visibility=node scripts/check-public-visibility.mjs
regional_public_visibility=node scripts/check-public-visibility.mjs --external-globalping --allow-pending
origin_headers=node scripts/check-website-origin.mjs
security_headers=node scripts/check-live-security-headers.mjs
search_indexing_surface=node scripts/check-search-indexing-surface.mjs
```

Each command writes one public-safe witness file into the uploaded artifact.
`set -o pipefail` preserves failure behavior while `tee` records the output.
The regional visibility probe uses Globalping as its scheduled external
provider. It is allowed to remain pending because external probe providers are
not a Mullusi-controlled invariant.
When the regional probe does not close, the workflow emits a GitHub Actions
warning and preserves the exact `AwaitingEvidence` output, structured
`external_probe_provider_error`, and `external_probe_error` in the artifact.

## Evidence Rule

```text
single_run_public_edge=SolvedVerified when public visibility, origin headers, security headers, and search surface pass
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
  Invariants verified: scheduled probe set declared, artifact retention declared, public-safe witness boundary declared, universal claim boundary preserved
  Open issues: longitudinal evidence depends on future scheduled runs
  Next action: review uploaded live-safety artifacts after scheduled execution
