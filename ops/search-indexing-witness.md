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

## Release Boundary

```text
robots_root_allow=Pass
robots_sitemap_reference=Pass
live_sitemap_matches_local=Pass
live_sitemap_loc_count=5
local_sitemap_loc_count=5
canonical_route_reachability=Pass
noindex_blockers_detected=false
search_engine_index_state=AwaitingEvidence
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
  Invariants verified: robots root allow, sitemap reference, live/local sitemap parity, canonical route reachability, no detected noindex blocker
  Open issues: search engine recrawl and indexing evidence
  Next action: submit sitemap and request recrawl through Search Console, then record external indexing evidence only after direct readback
