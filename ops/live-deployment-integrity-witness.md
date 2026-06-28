<!--
Purpose: record public-safe live deployment integrity evidence for mullusi.com.
Governance scope: live status-manifest consistency, governed public-file hashes, route sentinels, local/live drift, and runtime-claim separation.
Dependencies: status.json, scripts/check-live-deployment-integrity.mjs, public HTTPS responses from mullusi.com, Cloudflare Pages deployment state, mullusi-site#239, and mullusi-company-site#117.
Invariants: no response bodies, raw response headers, provider account IDs, DNS target values, tokens, credentials, or private deployment identifiers are stored here.
-->

# Live Deployment Integrity Witness

Observed on 2026-06-25 after public mirror PR #239, private deploy-source PR
#117, and the manual Cloudflare Pages workflow dispatch:

```text
command=node scripts/check-live-deployment-integrity.mjs --require-local-match
verdict=SolvedVerified
proof_state=Pass
live_deployment_integrity_state=SolvedVerified
live_status_manifest=Pass
live_content_hashes=Pass
local_status_manifest_match=Pass
edge_html_transform=Pass
route_sentinels=Pass
governed_file_count=7
route_sentinel_count=2
route_sentinel=browse_docs_route:Pass:200
route_sentinel=search_docs_route:Pass:200
finding=none
local_finding=none
accepted_finding=none
raw_response_bodies=not_recorded
raw_response_headers=not_recorded
```

## Publication Evidence

```text
public_mirror_pr=mullusi-site#239
public_mirror_merge_commit=d240121b4b8677d6db841dad638828f5e436df50
private_deploy_pr=mullusi-company-site#117
private_deploy_merge_commit=c223fffe6e35993dc9e190d56b7ef57facf28c12
deploy_workflow=Deploy to Cloudflare Pages
deploy_workflow_run_id=28187685917
deploy_workflow_state=SolvedVerified
deployment_url=redacted_url
publication_method=github_actions_workflow_dispatch
```

## Meaning

The live static deployment matches the current public mirror `status.json`
manifest for the governed public files. Governed public-file hashes pass,
expected route sentinels for `/browse/` and `/search/` pass, and no accepted
Cloudflare edge transform is needed for this observation.

This closes the static website local/live manifest parity gap. It does not
close product runtime release, public write-route exposure, dashboard readiness,
sandbox readiness, metrics readiness, SDK release, or proof-stamp release
witnesses.

## Boundary

```text
static_deployment_integrity=SolvedVerified
live_status_manifest=Pass
live_content_hashes=Pass
local_status_manifest_match=Pass
publicMirrorMode=governed-static-parity
privateDeploySourceAuthoritative=true
route_sentinels=Pass
runtime_api_readiness=AwaitingEvidence
product_runtime_release_witness=AwaitingEvidence
raw_response_bodies=not_recorded
raw_response_headers=not_recorded
```

## Closure Command

```bash
node scripts/check-live-deployment-integrity.mjs --require-local-match
```

A production-runtime claim still requires the separate API, runtime, recovery,
domain hardening, product-status, privacy, contract, rollback, and live evidence
witnesses to close.

STATUS:
  Completeness: 100%
  Self-attested invariants: governed static website parity closed, route sentinels pass, raw bodies and headers not recorded, runtime/API/product release boundary unchanged
  Open issues: product runtime release, public write-route exposure, dashboard, sandbox, metrics, SDK, and proof-stamp witnesses remain AwaitingEvidence
  Next action: keep strict live parity in scheduled probes and prepare product runtime witness evidence separately
