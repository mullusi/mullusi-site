<!--
Purpose: record the public website origin-header witness for mullusi.com.
Governance scope: Cloudflare edge verification, GitHub Pages fallback detection, and private-source migration closure.
Dependencies: scripts/check-website-origin.mjs, public HTTPS response headers, and Cloudflare Pages routing.
Invariants: no secret values, account IDs, DNS target records, raw response headers, or provider billing details are stored here.
-->

# Website Origin Witness

Observed on 2026-05-24:

```text
command=node scripts/check-website-origin.mjs
target=https://mullusi.com/
final_url=https://mullusi.com/
status=200
redirect_count=0
first_redirect_status=
first_redirect_url=
server=present
verdict=CloudflareOriginCandidate
proof_state=Pass
github_request=
fastly_request=
served_by=
via=
summary=No GitHub Pages origin markers were found in the response headers.

target=https://www.mullusi.com/
final_url=https://mullusi.com/
status=200
redirect_count=1
first_redirect_status=301
first_redirect_url=https://mullusi.com/
server=present
verdict=CloudflareOriginCandidate
proof_state=Pass
github_request=
fastly_request=
served_by=
via=
summary=No GitHub Pages origin markers were found in the response headers.

target=https://www.mullusi.com/proof/?gate=www-canonical
final_url=https://mullusi.com/proof/?gate=www-canonical
status=200
redirect_count=1
first_redirect_status=301
first_redirect_url=https://mullusi.com/proof/?gate=www-canonical
server=present
verdict=CloudflareOriginCandidate
proof_state=Pass
github_request=
fastly_request=
served_by=
via=
summary=No GitHub Pages origin markers were found in the response headers.

target=https://mullusi.com/assets/app.js
final_url=https://mullusi.com/assets/app.js
status=200
redirect_count=0
first_redirect_status=
first_redirect_url=
server=present
verdict=CloudflareOriginCandidate
proof_state=Pass
github_request=
fastly_request=
served_by=
via=
summary=No GitHub Pages origin markers were found in the response headers.

target=https://mullusi.com/data/site.json
final_url=https://mullusi.com/data/site.json
status=200
redirect_count=0
first_redirect_status=
first_redirect_url=
server=present
verdict=CloudflareOriginCandidate
proof_state=Pass
github_request=
fastly_request=
served_by=
via=
summary=No GitHub Pages origin markers were found in the response headers.

target=https://mullusi.com/.well-known/security.txt
final_url=https://mullusi.com/.well-known/security.txt
status=200
redirect_count=0
first_redirect_status=
first_redirect_url=
server=present
verdict=CloudflareOriginCandidate
proof_state=Pass
github_request=
fastly_request=
served_by=
via=
summary=No GitHub Pages origin markers were found in the response headers.
```

## Meaning

The public website route, `www` host, primary script asset, structured data
route, and security contact route are currently served through Cloudflare edge
headers with HTTP 200 responses and without visible GitHub Pages or Fastly
origin markers. The apex origin header evidence is closed. The `www` canonical
redirect is also closed because both the root host and a path/query witness
return one permanent 301 hop to the matching `https://mullusi.com/` apex URL
while preserving the request path and query.

## Release Boundary

```text
origin_headers_no_github=true
cloudflare_edge_observed=true
github_pages_origin_markers=false
www_canonical_redirect=SolvedVerified
www_redirect_count=1
www_first_redirect_status=301
www_path_query_preserved=true
runtime_api_readiness=AwaitingEvidence
```

The website origin witness does not prove `api.mullusi.com` runtime readiness.
API production remains blocked until the runtime conformance, gateway witness,
database, and proof-stamp checks close.

## Checker Boundary

```text
accepted_targets=https://mullusi.com/*, https://www.mullusi.com/
accepted_www_redirect_witnesses=https://www.mullusi.com/, https://www.mullusi.com/proof/?gate=www-canonical
rejected_targets=http://*, https://external-host/*
json_output=sanitized_witness_records_only
raw_response_headers=not_recorded
redirect_boundary=stays_within_mullusi_https_hosts
www_redirect_failure_state=none
www_redirect_path_query_preservation=Pass
www_redirect_status_code=301
required_www_redirect_status=301
```

STATUS:
  Completeness: 100%
  Self-attested invariants: Cloudflare edge observed, GitHub origin markers absent, one-hop www-to-apex 301 verified, path/query preservation verified, runtime API boundary unchanged
  Open issues: Cloudflare Pages project configuration readback
  Next action: preserve this witness during private-source migration and keep API readiness gated separately
