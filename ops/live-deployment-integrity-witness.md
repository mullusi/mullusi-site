<!--
Purpose: record public-safe live deployment integrity evidence for mullusi.com.
Governance scope: live status-manifest consistency, governed public-file hashes, route sentinels, local/live drift, and runtime-claim separation.
Dependencies: status.json, scripts/check-live-deployment-integrity.mjs, public HTTPS responses from mullusi.com, and Cloudflare Pages deployment state.
Invariants: no response bodies, raw response headers, provider account IDs, DNS target values, tokens, credentials, or private deployment identifiers are stored here.
-->

# Live Deployment Integrity Witness

Observed on 2026-06-12:

```text
command=node scripts/check-live-deployment-integrity.mjs --allow-pending
verdict=AwaitingEvidence
proof_state=Unknown
live_deployment_integrity_state=AwaitingEvidence
live_status_manifest=Pass
live_content_hashes=Pass
local_status_manifest_match=AwaitingEvidence
edge_html_transform=Pass
route_sentinels=Pass
governed_file_count=7
route_sentinel_count=2
route_sentinel=browse_docs_route:Pass:200
route_sentinel=search_docs_route:Pass:200
finding=none
local_finding=local_status_manifest_mismatch
accepted_finding=none
raw_response_bodies=not_recorded
raw_response_headers=not_recorded
```

## Meaning

The live static deployment currently matches its live `status.json` manifest.
Governed public-file hashes pass, expected route sentinels for `/browse/` and
`/search/` pass, and no accepted Cloudflare edge transform is needed for this
observation.

Local/live manifest parity is currently `AwaitingEvidence` because the local
`status.json` manifest does not match the live status manifest. This is a
deployment-propagation or local-release-boundary gap, not a runtime product
release witness. It does not close runtime API readiness, dashboard readiness,
sandbox readiness, metrics readiness, proof-stamp release witnesses, or product
runtime release.

## Boundary

```text
static_deployment_integrity=AwaitingEvidence
live_status_manifest=Pass
live_content_hashes=Pass
local_status_manifest_match=AwaitingEvidence
route_sentinels=Pass
runtime_api_readiness=AwaitingEvidence
product_runtime_release_witness=AwaitingEvidence
raw_response_bodies=not_recorded
raw_response_headers=not_recorded
```

## Closure Command

```bash
node scripts/check-live-deployment-integrity.mjs --allow-pending
```

Use `--allow-pending` only when recording a live/local deployment propagation
gap without blocking the operator shell. A production-runtime claim still
requires the separate API, runtime, recovery, and domain hardening witnesses to
close.

STATUS:
  Completeness: 80%
  Self-attested invariants: live static deployment hashes match the live manifest, route sentinels pass, raw bodies and headers not recorded, runtime/API release boundary unchanged
  Open issues: local/live status manifest parity, runtime API, product runtime release, and recovery witnesses remain AwaitingEvidence
  Next action: rerun after deployment propagation or rebuild/publish so local status manifest matches live status manifest
