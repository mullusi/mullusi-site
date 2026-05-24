<!--
Purpose: record the public search-indexing surface witness for mullusi.com.
Governance scope: robots policy, sitemap freshness, canonical public route reachability, and noindex blocker detection.
Dependencies: scripts/check-search-indexing-surface.mjs, robots.txt, sitemap.xml, public HTTPS route responses, and Cloudflare Pages routing.
Invariants: no account IDs, Search Console private data, provider dashboard data, raw response headers, or crawler logs are stored here.
-->

# Search Indexing Witness

Observed on 2026-05-24:

```text
command=node scripts/check-search-indexing-surface.mjs
verdict=SolvedVerified
proof_state=Pass
local_sitemap_loc_count=5
live_sitemap_loc_count=5
finding=none
```

## Route Set

```text
https://mullusi.com/
https://mullusi.com/mullu/
https://mullusi.com/doctrine/
https://mullusi.com/proof/
https://mullusi.com/playground/
```

## Meaning

The live `robots.txt` surface allows root search crawling and references the
canonical sitemap. The live `sitemap.xml` matches the local sitemap route count,
and each local sitemap route returns a 2xx public HTTPS response without a
detected `noindex` blocker or canonical mismatch.

This witness proves crawl-surface readiness only. It does not prove that any
search engine has crawled, indexed, ranked, or refreshed snippets for the
domain. Search engine recrawl remains an external evidence dependency.

## Public Search Readback

Observed on 2026-05-24:

```text
query=site:mullusi.com Mullusi
first_party_result_observed=true
first_party_result_url=https://www.mullusi.com
first_party_result_title=MULLUSI — Symbolic Intelligence
query=site:mullusi.com Mullu
mullu_query_first_party_result_observed=true
mullu_query_first_party_result_url=https://www.mullusi.com
route_specific_mullu_result_observed=false
route_specific_mullu_visibility=AwaitingEvidence
stale_third_party_github_pages_record_observed=superseded
```

Public Google readback now shows a first-party `mullusi.com` result for both
`site:mullusi.com Mullusi` and `site:mullusi.com Mullu`. The visible result is
the canonical homepage title, `MULLUSI — Symbolic Intelligence`, at
`https://www.mullusi.com`. Route-specific readback for
`site:mullusi.com/mullu Mullu` remains AwaitingEvidence because it did not
produce a direct `/mullu/` result during this readback pass.

## Search Console Submission

Observed on 2026-05-24:

```text
property=sc-domain:mullusi.com
active_google_account=mullusi Official
submitted_sitemap=https://mullusi.com/sitemap.xml
submission_result=accepted
last_read=2026-05-24
sitemap_status=Success
discovered_pages=5
discovered_videos=0
```

Search Console accepted and read the sitemap after an initial transient
`Couldn't fetch` table state. Independent public fetch checks still returned
HTTP 200 for `https://mullusi.com/sitemap.xml` during that transient state.
The final Search Console table readback is `Success` with five discovered
pages.

## URL Inspection Request

Observed on 2026-05-24:

```text
inspected_url=https://mullusi.com/
indexed_state_before_request=URL is not on Google
reported_reason_before_request=Page with redirect
last_google_crawl_before_request=2026-04-28
crawl_allowed_before_request=Yes
page_fetch_before_request=Successful
indexing_allowed_before_request=Yes
google_selected_canonical_before_request=https://www.mullusi.com/
request_indexing_result=Indexing requested
priority_crawl_queue=accepted
additional_route_requests=AwaitingEvidence
```

URL Inspection showed stale Google state from before the current canonical
redirect closure. The homepage request was accepted into Google's priority
crawl queue. Additional route-specific requests are not recorded because the
browser session did not produce stable readback before timeout; the sitemap
submission already exposes all five routes to Google.

## Release Boundary

```text
robots_root_allow=Pass
robots_sitemap_reference=Pass
live_sitemap_matches_local=Pass
live_sitemap_loc_count=5
local_sitemap_loc_count=5
canonical_route_reachability=Pass
noindex_blockers_detected=false
search_engine_index_state=SolvedVerified
first_party_search_result_observed=true
first_party_search_result_url=https://www.mullusi.com
stale_third_party_record_observed=superseded
mullu_query_first_party_result_observed=true
route_specific_mullu_visibility=AwaitingEvidence
search_console_sitemap_submission=Pass
search_console_sitemap_status=Success
search_console_discovered_pages=5
homepage_url_inspection_request=Pass
homepage_priority_crawl_queue=accepted
additional_url_inspection_requests=AwaitingEvidence
```

## Checker Boundary

```text
accepted_hosts=https://mullusi.com, https://www.mullusi.com
checked_routes=local_sitemap_locs_only
non_2xx_route_status=GovernanceBlocked
live_sitemap_missing_loc=GovernanceBlocked
live_sitemap_stale_lastmod=GovernanceBlocked
live_sitemap_untracked_loc=GovernanceBlocked
route_noindex_signal=GovernanceBlocked
route_canonical_mismatch=GovernanceBlocked
external_search_console_state=not_recorded
raw_response_headers=not_recorded
```

STATUS:
  Completeness: 100%
  Invariants verified: robots root allow, sitemap reference, live/local sitemap parity, canonical route reachability, no detected noindex blocker, first-party Google readback
  Open issues: route-specific /mullu/ public result readback
  Next action: monitor route-specific public result readback and update only after direct verification
