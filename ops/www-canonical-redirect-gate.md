<!--
Purpose: define the www-to-apex canonical redirect gate for mullusi.com.
Governance scope: public host canonicalization, Cloudflare Pages routing, redirect witness, Worker-route enforcement, and migration closure.
Dependencies: _redirects, scripts/check-website-origin.mjs, Cloudflare Pages custom domains, Cloudflare Worker route, and public HTTPS headers.
Invariants: no provider account IDs, DNS target values, tokens, or private deployment identifiers are stored here.
-->

# WWW Canonical Redirect Gate

Required source rule:

```text
https://www.mullusi.com/* https://mullusi.com/:splat 301
```

The source rule must exist as an uncommented exact `_redirects` line. A comment,
embedded copy, or partial match is not a valid source-rule witness.

Each required live witness target must appear exactly once in the witness file.
Missing or duplicated target blocks fail closed because they make the causal
record ambiguous.

Required live behavior:

```text
request=https://www.mullusi.com/
expected_final_url=https://mullusi.com/
expected_status=200
expected_redirect_count=1
expected_first_redirect_status=301
expected_first_redirect_url=https://mullusi.com/
expected_verdict=CloudflareOriginCandidate
expected_proof_state=Pass
request=https://www.mullusi.com/proof/?gate=www-canonical
expected_final_url=https://mullusi.com/proof/?gate=www-canonical
expected_status=200
expected_redirect_count=1
expected_first_redirect_status=301
expected_first_redirect_url=https://mullusi.com/proof/?gate=www-canonical
expected_verdict=CloudflareOriginCandidate
expected_proof_state=Pass
```

Current witness:

```text
request=https://www.mullusi.com/
observed_witness_block_count=1
observed_final_url=https://mullusi.com/
observed_status=200
observed_redirect_count=1
observed_first_redirect_status=301
observed_first_redirect_url=https://mullusi.com/
observed_verdict=CloudflareOriginCandidate
observed_proof_state=Pass
request=https://www.mullusi.com/proof/?gate=www-canonical
observed_witness_block_count=1
observed_final_url=https://mullusi.com/proof/?gate=www-canonical
observed_status=200
observed_redirect_count=1
observed_first_redirect_status=301
observed_first_redirect_url=https://mullusi.com/proof/?gate=www-canonical
observed_verdict=CloudflareOriginCandidate
observed_proof_state=Pass
```

## Gate Decision

```text
source_redirect_rule=present
live_redirect_witness=Pass
path_query_redirect_witness=Pass
permanent_redirect_status_witness=Pass
single_redirect_hop_witness=Pass
unique_witness_blocks=Pass
release_gate=ready
failure_action=none
```

The `www` host is public, served through Cloudflare, and now has a canonical
redirect witness. The migration gate is closed because
`scripts/check-website-origin.mjs` reports `https://www.mullusi.com/` with
`final_url=https://mullusi.com/`, `first_redirect_status=301`, and
`first_redirect_url=https://mullusi.com/`; reports
`https://www.mullusi.com/proof/?gate=www-canonical` with the same path and
query preserved on the apex host with `first_redirect_status=301`; and returns
`verdict=CloudflareOriginCandidate` for both records.

## Operator Rule Contract

```text
rule_surface=Cloudflare Pages redirect, Cloudflare zone redirect rule, or versioned Cloudflare Worker route
match_host=www.mullusi.com
target_host=mullusi.com
scheme=https
status_code=301
preserve_path=true
preserve_query=true
single_redirect_hop=true
runtime_dependency=false
secret_required=false
```

Required closure command:

```bash
node scripts/check-website-origin.mjs https://www.mullusi.com/ "https://www.mullusi.com/proof/?gate=www-canonical"
```

Required closure output:

```text
target=https://www.mullusi.com/
final_url=https://mullusi.com/
redirect_count=1
first_redirect_status=301
first_redirect_url=https://mullusi.com/
status=200
verdict=CloudflareOriginCandidate
proof_state=Pass
target=https://www.mullusi.com/proof/?gate=www-canonical
final_url=https://mullusi.com/proof/?gate=www-canonical
redirect_count=1
first_redirect_status=301
first_redirect_url=https://mullusi.com/proof/?gate=www-canonical
status=200
verdict=CloudflareOriginCandidate
proof_state=Pass
```

Do not close this gate from a dashboard screenshot alone. The closure witness
must be a command output captured from the public HTTPS route after propagation.

STATUS:
  Completeness: 100%
  Self-attested invariants: source redirect rule declared, unique witness blocks required, live redirect witness verified, permanent 301 verified, path/query preservation verified, operator closure contract declared, runtime API boundary unchanged
  Open issues: none for www canonical redirect
  Next action: keep the redirect under versioned source control and monitor runtime API gates separately
