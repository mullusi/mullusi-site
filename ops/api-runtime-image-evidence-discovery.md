<!--
Purpose: record public-safe discovery status for the first api.mullusi.com runtime evidence item, production_image_published.
Governance scope: immutable API image publication evidence, GitHub Actions/package discovery boundary, private-value exclusion, and DNS denial.
Dependencies: ops/api-runtime-manual-evidence-intake-template.json, ops/api-runtime-manual-evidence-checklist.md, and scripts/report-api-runtime-manual-evidence-next.mjs.
Invariants: no token value, package digest, private package metadata, host address, database URL, DNS target, provider account ID, or raw API payload is stored.
-->

# API Runtime Image Evidence Discovery

This witness records the public-safe closure state for the first pre-DNS API
runtime evidence item:

```text
evidence_item=production_image_published
production_image_published=Pass
api_runtime_manual_evidence_next=AwaitingEvidence
api_dns_publication_allowed=false
github_actions_image_publish_run=github:actions/runs/28353797103:api-image-published
github_packages_read_scope=not_required_for_public_safe_ref
secret_values=not_recorded
provider_values=not_recorded
host_addresses=not_recorded
database_urls=not_recorded
dns_targets=not_recorded
raw_payloads=not_recorded
```

## Discovery Commands

Public-safe commands used for discovery:

```bash
gh run list --repo tamirat-wubie/mullu-control-plane --limit 20 \
  --json databaseId,name,displayTitle,status,conclusion,createdAt,headBranch,event,url

gh workflow list --repo tamirat-wubie/mullu-control-plane --all

gh api /users/tamirat-wubie/packages?package_type=container --paginate

gh api /orgs/mullusi/packages?package_type=container --paginate
```

Observed public-safe result:

```text
recent_actions_image_publish_workflow=github:actions/runs/28353797103
github_package_listing_result=not_required_for_public_safe_ref
production_image_public_safe_ref=github:actions/runs/28353797103:api-image-published
operator_approval_ref=approval://api-image-publication/2026-06-29-operator-approved
```

The publication receipt reports `image_published=true`,
`secret_values_serialized=false`, `dns_mutated=false`, and
`runtime_mutated=false`. The receipt is sufficient for this checklist item and
does not close runtime host, managed persistence, secret storage, TLS, private
witness, or DNS authority evidence.

## Accepted Closure Ref

The evidence item may close only with a public-safe ref such as:

```text
github:actions/runs/NNN:api-image-published
receipt://api-runtime/image-published/YYYY-MM-DD
```

The ref must prove an immutable, versioned API image was published. Do not store
image digests, package private metadata, token scopes, or raw GitHub API
responses in this repository.

## Next Check

```bash
node scripts/report-api-runtime-manual-evidence-next.mjs
node scripts/validate-api-runtime-manual-evidence-intake.mjs
```

STATUS:
  Completeness: 100%
  Self-attested invariants: no raw package metadata, no token values, no DNS publication, image evidence recorded only as public-safe run ref
  Open issues: runtime_host_ready is the next missing pre-DNS evidence item
  Next action: collect the runtime_host_ready public-safe ref without storing private values
