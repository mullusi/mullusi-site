<!--
Purpose: define the www-to-apex canonical redirect gate for mullusi.com.
Governance scope: public host canonicalization, Cloudflare Pages routing, redirect witness, and migration closure.
Dependencies: _redirects, scripts/check-website-origin.mjs, Cloudflare Pages custom domains, and public HTTPS headers.
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
observed_final_url=https://www.mullusi.com/
observed_status=200
observed_redirect_count=0
observed_first_redirect_status=
observed_first_redirect_url=
observed_verdict=CanonicalRedirectPending
observed_proof_state=Unknown
request=https://www.mullusi.com/proof/?gate=www-canonical
observed_witness_block_count=1
observed_final_url=https://www.mullusi.com/proof/?gate=www-canonical
observed_status=200
observed_redirect_count=0
observed_first_redirect_status=
observed_first_redirect_url=
observed_verdict=CanonicalRedirectPending
observed_proof_state=Unknown
```

## Gate Decision

```text
source_redirect_rule=present
live_redirect_witness=AwaitingEvidence
path_query_redirect_witness=AwaitingEvidence
permanent_redirect_status_witness=AwaitingEvidence
single_redirect_hop_witness=AwaitingEvidence
unique_witness_blocks=required
release_gate=blocked
failure_action=keep_private_source_migration_open
```

The `www` host is public and served through Cloudflare, but it is not yet a
canonical redirect witness. The migration must remain open until
`scripts/check-website-origin.mjs` reports `https://www.mullusi.com/` with
`final_url=https://mullusi.com/`, `first_redirect_status=301`, and
`first_redirect_url=https://mullusi.com/`; reports
`https://www.mullusi.com/proof/?gate=www-canonical` with the same path and
query preserved on the apex host with `first_redirect_status=301`; and returns
`verdict=CloudflareOriginCandidate` for both records.

## Operator Rule Contract

```text
rule_surface=Cloudflare Pages redirect or Cloudflare zone redirect rule
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
  Invariants verified: source redirect rule declared, unique witness blocks required, live redirect gap recorded, permanent 301 required, path/query preservation required, operator closure contract declared, runtime API boundary unchanged
  Open issues: Cloudflare Pages or zone-level rule must enforce www-to-apex redirect
  Next action: enforce the redirect, rerun the origin checker, and update ops/website-origin-witness.md
