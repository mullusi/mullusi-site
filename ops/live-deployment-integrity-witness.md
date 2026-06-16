<!--
Purpose: record public-safe live deployment integrity evidence for mullusi.com.
Governance scope: live status-manifest consistency, governed public-file hashes, route sentinels, local/live drift, and runtime-claim separation.
Dependencies: status.json, scripts/check-live-deployment-integrity.mjs, public HTTPS responses from mullusi.com, and Cloudflare Pages deployment state.
Invariants: no response bodies, raw response headers, provider account IDs, DNS target values, tokens, credentials, or private deployment identifiers are stored here.
-->

# Live Deployment Integrity Witness

Observed on 2026-06-16 after the private deploy-source publication:

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

Remote deployment and live-safety evidence for the controlled private deploy
source closed after PR #96:

```text
private_deploy_pr=mullusi-company-site#96
private_deploy_commit=bb7312e947097612fa5fa125fdb70e7b31cd379c
deploy_workflow=Deploy to Cloudflare Pages
deploy_workflow_state=SolvedVerified
live_safety_workflow=Live Safety Probes
live_safety_witness_state=SolvedVerified
publicMirrorMode=governance-boundary
byteParityWithPrivateDeploySource=false
privateDeploySourceAuthoritative=true
publicReleaseArtifactApproved=false
runtimeWitnessState=AwaitingEvidence
sourceCopyToPublicMirror=blocked_without_approved_release_artifact
```

## Meaning

The live static deployment matches its live `status.json` manifest when checked
from the controlled private deploy source. Governed public-file hashes pass,
expected route sentinels for `/browse/` and `/search/` pass, and no accepted
Cloudflare edge transform is needed for this observation.

Local/live manifest parity from this public repository remains
`AwaitingEvidence` because `mullusi-site` is a public governance-boundary
mirror, not the authoritative live deploy source. The known deployment topology
deploys `mullusi.com` from the controlled private `mullusi-company-site` source.
That non-parity is intentional until Mullusi approves and publishes a separate
public release artifact. Do not copy private deployed source into this mirror to
make byte parity appear closed.

This static website publication witness is not a runtime product release
witness and does not close runtime API readiness, dashboard readiness, sandbox
readiness, metrics readiness, SDK release, proof-stamp release witnesses, or
product runtime release.

## Boundary

```text
static_deployment_integrity=AwaitingEvidence
live_status_manifest=Pass
live_content_hashes=Pass
local_status_manifest_match=AwaitingEvidence
publicMirrorMode=governance-boundary
byteParityWithPrivateDeploySource=false
privateDeploySourceAuthoritative=true
publicReleaseArtifactApproved=false
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

Use `--allow-pending` only when recording the intentional public-mirror
non-parity boundary without blocking the operator shell. A production-runtime
claim still requires the separate API, runtime, recovery, and domain hardening
witnesses to close.

## Handoff Command Boundary

Use `docs/mirror-to-deploy-port-runbook.md` only when an approved public-mirror
content change must be carried into the private deploy source. Do not reverse
copy the private deploy source into this public mirror for byte parity unless a
separate governed public release artifact is explicitly approved.

After an approved mirror-to-deploy port publishes, rerun:

```bash
node scripts/check-live-deployment-integrity.mjs --require-local-match
```

Do not use this static parity witness as authority to provision
`api.mullusi.com`, publish API DNS, or promote product runtime witnesses.

STATUS:
  Completeness: 95%
  Self-attested invariants: private deploy source is authoritative for live mullusi.com, public mirror is governance-boundary only, public mirror byte parity is intentionally false, raw bodies and headers not recorded, runtime/API release boundary unchanged
  Open issues: product runtime release, runtime API, dashboard, sandbox, metrics, SDK, and proof-stamp witnesses remain AwaitingEvidence
  Next action: keep public mirror non-parity documented unless a governed public release artifact is approved
