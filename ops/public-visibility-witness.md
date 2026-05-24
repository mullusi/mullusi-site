<!--
Purpose: record bounded public visibility evidence for mullusi.com.
Governance scope: public DNS resolution, HTTPS reachability, canonical www redirect, TLS validation, and global-claim boundary.
Dependencies: scripts/check-public-visibility.mjs, public DNS resolvers, public HTTPS edge, and ops/website-origin-witness.md.
Invariants: no account IDs, DNS target records from provider dashboards, tokens, raw private logs, or universal visibility claims are stored here.
-->

# Public Visibility Witness

Observed on 2026-05-24:

```text
command=node scripts/check-public-visibility.mjs
verdict=SolvedVerified
proof_state=Pass
public_edge_visibility=SolvedVerified
external_multi_region_visibility=AwaitingEvidence
global_all_users_claim=AwaitingEvidence
persistent_regional_monitoring=Pass
monitor_workflow=.github/workflows/live-safety.yml
monitor_schedule=41 7 * * *
monitor_command=node scripts/check-public-visibility.mjs --external-check-host --check-host-max-nodes=6 --allow-pending
dns_host_count=2
dns_public_resolver_passes=6
https_route_count=2
external_regional_probe_floor=2
external_probe_count=0
external_distinct_region_passes=0
finding=none
external_finding=external_probe_not_attached
dns_host=mullusi.com
dns_resolver=cloudflare
dns_public_resolver=true
dns_a=104.21.82.46,172.67.153.104
dns_aaaa=2606:4700:3032::6815:522e,2606:4700:3033::ac43:9968
dns_error=
dns_host=mullusi.com
dns_resolver=google
dns_public_resolver=true
dns_a=104.21.82.46,172.67.153.104
dns_aaaa=2606:4700:3033::ac43:9968,2606:4700:3032::6815:522e
dns_error=
dns_host=mullusi.com
dns_resolver=quad9
dns_public_resolver=true
dns_a=104.21.82.46,172.67.153.104
dns_aaaa=2606:4700:3033::ac43:9968,2606:4700:3032::6815:522e
dns_error=
dns_host=mullusi.com
dns_resolver=system
dns_public_resolver=false
dns_a=104.21.82.46,172.67.153.104
dns_aaaa=2606:4700:3032::6815:522e,2606:4700:3033::ac43:9968
dns_error=
dns_host=www.mullusi.com
dns_resolver=cloudflare
dns_public_resolver=true
dns_a=104.21.82.46,172.67.153.104
dns_aaaa=2606:4700:3032::6815:522e,2606:4700:3033::ac43:9968
dns_error=
dns_host=www.mullusi.com
dns_resolver=google
dns_public_resolver=true
dns_a=104.21.82.46,172.67.153.104
dns_aaaa=2606:4700:3032::6815:522e,2606:4700:3033::ac43:9968
dns_error=
dns_host=www.mullusi.com
dns_resolver=quad9
dns_public_resolver=true
dns_a=172.67.153.104,104.21.82.46
dns_aaaa=2606:4700:3032::6815:522e,2606:4700:3033::ac43:9968
dns_error=
dns_host=www.mullusi.com
dns_resolver=system
dns_public_resolver=false
dns_a=104.21.82.46,172.67.153.104
dns_aaaa=2606:4700:3032::6815:522e,2606:4700:3033::ac43:9968
dns_error=
target=https://mullusi.com/
expected_final_url=https://mullusi.com/
final_url=https://mullusi.com/
status=200
redirect_count=0
expected_redirect_count=0
first_redirect_status=
expected_first_redirect_status=
tls_authorized=true
route_error=
target=https://www.mullusi.com/
expected_final_url=https://mullusi.com/
final_url=https://mullusi.com/
status=200
redirect_count=1
expected_redirect_count=1
first_redirect_status=301
expected_first_redirect_status=301
tls_authorized=true
route_error=
external_probe_provider=
external_probe_api=
external_probe_target=
external_probe_request_id=
external_probe_permanent_link=
external_probe_max_nodes=
```

Optional external regional probe observed on 2026-05-24 after the security-header deployment:

```text
command=node scripts/check-public-visibility.mjs --external-check-host --check-host-max-nodes=6 --allow-pending
external_probe_provider=check-host.net
external_probe_api=https://check-host.net/about/api?lang=en
external_probe_target=https://mullusi.com/
external_probe_request_id=4064f24ak5e0
external_probe_permanent_link=https://check-host.net/check-report/4064f24ak5e0
external_multi_region_visibility=SolvedVerified
external_regional_probe_floor=2
external_probe_count=6
external_distinct_region_passes=5
persistent_regional_monitoring=Pass
monitor_workflow=.github/workflows/live-safety.yml
external_finding=none
external_node=br2.node.check-host.net
external_country=Brazil
external_city=Sao Paulo
external_passed=true
external_status=200
external_node=ch2.node.check-host.net
external_country=Switzerland
external_city=Zurich
external_passed=true
external_status=200
external_node=sg1.node.check-host.net
external_country=Singapore
external_city=Singapore
external_passed=true
external_status=200
external_node=ua1.node.check-host.net
external_country=Ukraine
external_city=Khmelnytskyi
external_passed=true
external_status=200
external_node=us1.node.check-host.net
external_country=USA
external_city=Los Angeles
external_passed=true
external_status=200
external_node=us4.node.check-host.net
external_country=USA
external_city=Miami
external_passed=true
external_status=200
```

## Meaning

The public edge visibility claim is closed for the bounded witness: `mullusi.com`
and `www.mullusi.com` resolve through public DNS resolvers, return HTTPS 200,
validate TLS, and route `www` to the apex host with one permanent 301 redirect.

The optional external probe observed six successful public checks across five
distinct countries through Check-Host. This closes the bounded
`external_multi_region_visibility` witness without turning a finite sample into
a universal claim.

The universal "all internet users" claim remains `AwaitingEvidence`. Public DNS,
local HTTPS, and finite external probes cannot prove every region, ISP,
enterprise firewall, browser, or government network can reach the site.

## Boundary

```text
public_dns_resolution=Pass
https_reachability=Pass
tls_validation=Pass
www_canonical_redirect=Pass
external_multi_region_visibility=SolvedVerified
external_regional_probe_provider=check-host.net
external_distinct_region_passes=5
external_probe_failures=none
persistent_regional_monitoring=Pass
monitor_workflow=.github/workflows/live-safety.yml
monitor_schedule=41 7 * * *
cloudflare_origin_header_witness=ops/website-origin-witness.md
search_crawl_surface_witness=ops/search-indexing-witness.md
security_header_witness=ops/security-header-witness.md
global_all_users_claim=AwaitingEvidence
universal_all_users_visibility=AwaitingEvidence
runtime_api_readiness=AwaitingEvidence
```

This witness does not prove `api.mullusi.com`, `docs.mullusi.com`,
`dashboard.mullusi.com`, `sandbox.mullusi.com`, or `metrics.mullusi.com`
runtime readiness.

## Closure Command

```bash
node scripts/check-public-visibility.mjs
node scripts/check-public-visibility.mjs --external-check-host --check-host-max-nodes=6 --allow-pending
```

Use `--allow-pending` only when recording a propagation, DNS resolver, external
probe, or edge cache gap without blocking the operator shell.

STATUS:
  Completeness: 99%
  Invariants verified: public DNS resolver floor, HTTPS 200, TLS authorized, one-hop www-to-apex 301, external regional probe floor met, scheduled live-safety monitor attached, bounded global-claim boundary
  Open issues: universal all-user visibility remains unprovable by finite probes
  Next action: review scheduled live-safety runs for longitudinal evidence
