<!--
Purpose: record the live browser-control header witness for mullusi.com.
Governance scope: CSP, HSTS, frame blocking, cross-origin boundaries, nosniff, referrer policy, permissions policy, and public-safe response-header evidence.
Dependencies: _headers, scripts/check-live-security-headers.mjs, Cloudflare Pages routing, and public HTTPS response headers.
Invariants: no secret values, account IDs, DNS target records, raw response-header values, provider dashboard data, or private deployment identifiers are stored here.
-->

# Security Header Witness

Observed on 2026-05-24 after the Cloudflare Pages artifact was deployed:

```text
command=node scripts/check-live-security-headers.mjs
verdict=SolvedVerified
proof_state=Pass
security_header_state=SolvedVerified
target_count=3
required_header_count=10
finding=none
target=https://mullusi.com/
status=200
security_headers=Pass
header_content_security_policy=Pass
header_strict_transport_security=Pass
header_referrer_policy=Pass
header_content_type_options=Pass
header_frame_options=Pass
header_cross_origin_opener_policy=Pass
header_cross_origin_resource_policy=Pass
header_dns_prefetch_control=Pass
header_permitted_cross_domain_policies=Pass
header_permissions_policy=Pass
target=https://mullusi.com/security/
status=200
security_headers=Pass
header_content_security_policy=Pass
header_strict_transport_security=Pass
header_referrer_policy=Pass
header_content_type_options=Pass
header_frame_options=Pass
header_cross_origin_opener_policy=Pass
header_cross_origin_resource_policy=Pass
header_dns_prefetch_control=Pass
header_permitted_cross_domain_policies=Pass
header_permissions_policy=Pass
target=https://mullusi.com/.well-known/security.txt
status=200
security_headers=Pass
header_content_security_policy=Pass
header_strict_transport_security=Pass
header_referrer_policy=Pass
header_content_type_options=Pass
header_frame_options=Pass
header_cross_origin_opener_policy=Pass
header_cross_origin_resource_policy=Pass
header_dns_prefetch_control=Pass
header_permitted_cross_domain_policies=Pass
header_permissions_policy=Pass
raw_response_headers=not_recorded
```

## Meaning

The live Cloudflare edge serves the required browser-control header policy on
the public root, security route, and `security.txt` route. This closes the
bounded static website header witness for the current deployment.

This witness does not prove account security, WAF configuration, API runtime
security, dashboard authentication, incident response readiness, or future
header persistence after later deployments.

## Boundary

```text
static_browser_header_policy=SolvedVerified
content_security_policy=Pass
hsts_preload_header=Pass
frame_blocking=Pass
cross_origin_boundary=Pass
nosniff=Pass
referrer_policy=Pass
permissions_policy=Pass
legacy_cross_domain_policy_block=Pass
raw_response_headers=not_recorded
runtime_api_readiness=AwaitingEvidence
```

## Closure Command

```bash
node scripts/check-live-security-headers.mjs
```

STATUS:
  Completeness: 100%
  Invariants verified: CSP present, HSTS preload present, frame blocking present, cross-origin headers present, nosniff present, permissions policy present, raw headers not recorded
  Open issues: account-level MFA/WAF/CAA cannot be proven from this repository; runtime API remains AwaitingEvidence
  Next action: keep live security-header checker in scheduled probes and rerun after every Pages deployment
