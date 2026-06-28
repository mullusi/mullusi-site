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

## Historical Route Set

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

## Current Main Crawl Surface

Observed on 2026-05-24 after the trust-surface route expansion reached `main`:

```text
command=node scripts/check-search-indexing-surface.mjs
verdict=GovernanceBlocked
proof_state=Fail
local_sitemap_loc_count=13
live_sitemap_loc_count=5
finding=live_sitemap_lastmod_stale:https://mullusi.com/playground/:local=2026-05-24:live=2026-05-16
finding=live_sitemap_loc_missing:https://mullusi.com/contact/
finding=live_sitemap_loc_missing:https://mullusi.com/pilot/
finding=live_sitemap_loc_missing:https://mullusi.com/status/
finding=live_sitemap_loc_missing:https://mullusi.com/security/
finding=live_sitemap_loc_missing:https://mullusi.com/privacy/
finding=live_sitemap_loc_missing:https://mullusi.com/terms/
finding=live_sitemap_loc_missing:https://mullusi.com/acceptable-use/
finding=live_sitemap_loc_missing:https://mullusi.com/responsible-disclosure/
finding=live_route_status_invalid:https://mullusi.com/contact/:404
finding=live_route_status_invalid:https://mullusi.com/pilot/:404
finding=live_route_status_invalid:https://mullusi.com/status/:404
finding=live_route_status_invalid:https://mullusi.com/security/:404
finding=live_route_status_invalid:https://mullusi.com/privacy/:404
finding=live_route_status_invalid:https://mullusi.com/terms/:404
finding=live_route_status_invalid:https://mullusi.com/acceptable-use/:404
finding=live_route_status_invalid:https://mullusi.com/responsible-disclosure/:404
```

The current repository sitemap declares thirteen routes. Production still
serves the earlier five-route sitemap and returns 404 for the newly declared
trust routes. That drift is a deployment-readback gap, not a `/mullu/` indexing
gap.

## Production Deployment Closure

Observed on 2026-05-24 after the private production source was synced and the
Cloudflare Pages artifact was deployed:

```text
command=npx.cmd --yes wrangler@latest pages deployment list --project-name redacted_project
deployment_result=production deployment observed
deployment_project=redacted_project
deployment_id=redacted_value
deployment_source=redacted_value
deployment_dirty=true
command=node scripts/check-search-indexing-surface.mjs
verdict=SolvedVerified
proof_state=Pass
local_sitemap_loc_count=13
live_sitemap_loc_count=13
finding=none
trust_surface_deployment_visibility=SolvedVerified
```

Current production now serves the thirteen-route sitemap and the newly declared
trust routes return public 2xx responses. The deployment-readback gap is closed.

## Current Route Set

```text
https://mullusi.com/
https://mullusi.com/mullu/
https://mullusi.com/doctrine/
https://mullusi.com/proof/
https://mullusi.com/playground/
https://mullusi.com/contact/
https://mullusi.com/pilot/
https://mullusi.com/status/
https://mullusi.com/security/
https://mullusi.com/privacy/
https://mullusi.com/terms/
https://mullusi.com/acceptable-use/
https://mullusi.com/responsible-disclosure/
```

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
query=site:mullusi.com/mullu/ Mullu
route_specific_mullu_result_observed=true
route_specific_mullu_result_url=https://mullusi.com/mullu/
route_specific_mullu_result_title=Mullu, by Mullusi - Governed Symbolic Intelligence
route_specific_mullu_visibility=SolvedVerified
stale_third_party_github_pages_record_observed=superseded
```

Public Google readback now shows a first-party `mullusi.com` result for both
`site:mullusi.com Mullusi` and `site:mullusi.com Mullu`. The visible result is
the canonical homepage title, `MULLUSI — Symbolic Intelligence`, at
`https://www.mullusi.com`. Route-specific readback for the canonical
trailing-slash query, `site:mullusi.com/mullu/ Mullu`, now returns
`https://mullusi.com/mullu/` with the title `Mullu, by Mullusi - Governed
Symbolic Intelligence`.

## Public Route Coverage Readback

Observed on 2026-05-24 after the sitemap was resubmitted in Search Console:

```text
source=Chrome-backed Google Search readback
checked_at=2026-05-24T18:36:03Z
query_set=exact sitemap-route site queries
google_challenge_observed=false
indexed_route_signals=2
indexed_route_signal_total=13
indexed_route=https://mullusi.com/
indexed_route=https://mullusi.com/mullu/
awaiting_google_route_signal=https://mullusi.com/doctrine/
awaiting_google_route_signal=https://mullusi.com/proof/
awaiting_google_route_signal=https://mullusi.com/playground/
awaiting_google_route_signal=https://mullusi.com/contact/
awaiting_google_route_signal=https://mullusi.com/pilot/
awaiting_google_route_signal=https://mullusi.com/status/
awaiting_google_route_signal=https://mullusi.com/security/
awaiting_google_route_signal=https://mullusi.com/privacy/
awaiting_google_route_signal=https://mullusi.com/terms/
awaiting_google_route_signal=https://mullusi.com/acceptable-use/
awaiting_google_route_signal=https://mullusi.com/responsible-disclosure/
route_coverage_state=AwaitingEvidence
```

Google Search readback currently confirms indexed signals for the homepage and
`/mullu/`. Exact-route queries for the remaining eleven sitemap routes returned
no public result in the observed readback session. This is an external recrawl
gap only; the live sitemap and public route responses remain verified.

Observed again on 2026-05-25:

```text
source=Chrome-backed Google Search readback
checked_at=2026-05-25T18:08:35Z
query_set=exact sitemap-route site queries
google_challenge_observed=false
indexed_route_signals=2
indexed_route_signal_total=13
indexed_route=https://mullusi.com/
indexed_route=https://mullusi.com/mullu/
awaiting_google_route_signal=https://mullusi.com/doctrine/
awaiting_google_route_signal=https://mullusi.com/proof/
awaiting_google_route_signal=https://mullusi.com/playground/
awaiting_google_route_signal=https://mullusi.com/contact/
awaiting_google_route_signal=https://mullusi.com/pilot/
awaiting_google_route_signal=https://mullusi.com/status/
awaiting_google_route_signal=https://mullusi.com/security/
awaiting_google_route_signal=https://mullusi.com/privacy/
awaiting_google_route_signal=https://mullusi.com/terms/
awaiting_google_route_signal=https://mullusi.com/acceptable-use/
awaiting_google_route_signal=https://mullusi.com/responsible-disclosure/
route_coverage_state=AwaitingEvidence
```

The public route-specific Google result set did not advance on the May 25
readback. The homepage and `/mullu/` remain visible; the remaining eleven routes
still await public Google result evidence.

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

## Search Console Resubmission

Observed on 2026-05-24 after the thirteen-route production deployment was
verified:

```text
submitted_sitemap=https://mullusi.com/sitemap.xml
submission_result=Sitemap submitted successfully
post_submit_sitemap_status=Success
post_submit_discovered_pages=5
post_submit_discovered_videos=0
search_console_expanded_route_count_state=AwaitingEvidence
```

Search Console accepted the fresh sitemap signal. The table remained at five
discovered pages immediately after resubmission, so expanded route discovery is
still pending Google processing.

## Search Console Discovery Closure

Observed on 2026-05-25:

```text
property=https://mullusi.com/
submitted_sitemap=https://mullusi.com/sitemap.xml
last_read=2026-05-24
sitemap_status=Success
discovered_pages=13
discovered_videos=0
search_console_expanded_route_count_state=SolvedVerified
```

Search Console now reports all thirteen sitemap routes as discovered. This
closes the expanded-sitemap readback gap. Public Google route-specific result
coverage remains separate and is still `2/13`.

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
submission already exposes all currently declared routes to Google.

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
route_specific_mullu_visibility=SolvedVerified
current_crawl_surface_state=SolvedVerified
current_live_sitemap_matches_local=Pass
current_local_sitemap_loc_count=13
current_live_sitemap_loc_count=13
trust_surface_deployment_visibility=SolvedVerified
search_console_sitemap_submission=Pass
search_console_sitemap_status=Success
search_console_discovered_pages=13
search_console_expanded_route_count_state=SolvedVerified
homepage_url_inspection_request=Pass
homepage_priority_crawl_queue=accepted
additional_url_inspection_requests=AwaitingEvidence
google_indexed_route_signals=2/13
google_indexed_routes=https://mullusi.com/,https://mullusi.com/mullu/
google_unindexed_route_signals=11/13
google_expanded_route_recrawl=AwaitingEvidence
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
  Completeness: 99%
  Self-attested invariants: historical five-route crawl parity, current thirteen-route crawl parity, robots root allow, sitemap reference, no detected noindex blocker on verified routes, first-party Google readback, route-specific /mullu/ Google readback, Google route coverage readback, Search Console thirteen-route discovery
  Open issues: eleven expanded routes still await public Google route-specific readback
  Next action: monitor public Google results for expanded route recrawl
