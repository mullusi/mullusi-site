<!--
Purpose: record a public-safe API runtime witness readiness receipt for api.mullusi.com.
Governance scope: API health, gateway witness, runtime conformance, public-safe response-shape evidence, and private-value exclusion.
Dependencies: public HTTPS probes for /health, /gateway/witness, and /runtime/conformance.
Invariants: no response bodies, raw headers, secret values, host addresses, database URLs, DNS targets, provider account identifiers, or private recovery material are recorded.
-->

# API Runtime Witness Ready Receipt

Receipt ref:

```text
control-plane:receipt/runtime-witness-ready-2026-06-29
```

Evidence statement:

```text
surface_id=api.mullusi.com
evidence_item=private_runtime_witness_ready
state=Pass
observed_at=2026-06-29
health_endpoint_status=200
health_endpoint_json=Pass
health_endpoint_status_field=healthy
gateway_witness_endpoint_status=200
gateway_witness_endpoint_json=Pass
gateway_witness_key_shape=Pass
runtime_conformance_endpoint_status=200
runtime_conformance_endpoint_json=Pass
runtime_conformance_key_shape=Pass
secret_values_recorded=false
host_addresses_recorded=false
database_urls_recorded=false
dns_targets_recorded=false
provider_values_recorded=false
raw_headers_recorded=false
raw_payloads_recorded=false
response_bodies_recorded=false
```

Interpretation:

The API gateway health, gateway witness, and runtime conformance endpoints are
reachable over HTTPS and return parseable JSON with the expected public witness
shape. This receipt records only status and shape evidence. It does not record
raw response bodies and does not approve DNS authority.

Rollback:

If any witness endpoint stops returning HTTP 200 with parseable JSON, revert
the `private_runtime_witness_ready` row to
`state=AwaitingEvidence public_safe_ref=missing private_value_storage=outside_git`
and rerun the manual evidence validators.

STATUS:
  Completeness: 100%
  Self-attested invariants: status and shape evidence only, no raw payloads, no raw headers, no host values, no provider-private values
  Open issues: DNS authority
  Next action: collect dns_authority_ready approval or audit ref before declaring DNS authority closed
