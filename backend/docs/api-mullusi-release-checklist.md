<!--
Purpose: provide the api.mullusi.com production release checklist for Mullusi Govern Cloud.
Governance scope: pre-release evidence, deployment execution, post-release verification, and go/no-go judgment.
Dependencies: production secrets, managed PostgreSQL, container registry, DNS/TLS routing, and backend scripts.
Invariants: no release proceeds with local placeholders, disabled persistence, unsigned proof stamps, or failed probe evidence.
-->

# api.mullusi.com Release Checklist

## Pre-Release

1. Confirm release scope:

```text
Service: Mullusi Govern Cloud
Domain: api.mullusi.com
Image: <registry>/mullusi-govern-cloud:<version>
API version: 2026.05.v1
Evaluator version: govern-evaluator.v1
```

2. Confirm production environment:

```text
MULLUSI_DEV_API_KEY configured in secret store
MULLUSI_PROOF_SIGNING_KEY configured in secret store
MULLUSI_DATABASE_URL configured with private PostgreSQL endpoint
MULLUSI_REQUIRE_PERSISTENCE=true
MULLUSI_ALLOWED_ORIGINS contains only HTTPS Mullusi origins
```

3. Confirm database baseline:

```bash
export PYTHONPATH=$PWD
python scripts/apply_schema.py
python scripts/check_persistence.py
```

Required evidence:

```text
schema_apply_passed ...
persistence_check state=ready detail=postgres_schema_ready
```

## Preflight Gate

Run:

```bash
export PYTHONPATH=$PWD
python scripts/preflight_release.py
```

Go condition:

```text
release_preflight state=ready
```

No-go conditions:

```text
required_environment state=fail
database_url state=fail
persistence_policy state=fail
allowed_origins state=fail
database_schema state=fail
```

## Deploy

1. Build image:

```bash
docker build -t <registry>/mullusi-govern-cloud:<version> .
```

2. Publish image:

```bash
docker push <registry>/mullusi-govern-cloud:<version>
```

3. Install host deployment templates if using the VPS/container handoff path:

```text
deploy/docker-compose.production.yaml -> /opt/mullusi/govern-cloud/docker-compose.production.yaml
deploy/production.env.example -> /etc/mullusi/govern.env after replacing placeholders
deploy/nginx/api.mullusi.com.conf -> /etc/nginx/sites-available/api.mullusi.com.conf
deploy/systemd/mullusi-govern.service -> /etc/systemd/system/mullusi-govern.service
```

4. Deploy image to production runtime.

5. Route `api.mullusi.com` to the new runtime through TLS.

6. Confirm health:

```bash
curl https://api.mullusi.com/v1/health
curl https://api.mullusi.com/v1/version
```

Expected:

```text
{"status":"ok","service":"mullusi-govern-cloud"}
{"api":"2026.05.v1","evaluator":"govern-evaluator.v1"}
```

## Post-Deploy Proof

Run the full request path:

```bash
export PYTHONPATH=$PWD
export MULLUSI_API_BASE_URL=https://api.mullusi.com
python scripts/probe_persistence.py
```

Go condition:

```text
probe_passed ... storage=stored verification=valid
```

Database witness:

```sql
SELECT evaluation_id, verdict, proof_state, created_at
FROM govern_evaluations
ORDER BY created_at DESC
LIMIT 5;

SELECT proof_stamp_id, stamp_state, algorithm, issued_at
FROM proof_stamps
ORDER BY created_at DESC
LIMIT 5;
```

## Go/No-Go Judgment

| Evidence | Pass condition | Block condition |
| --- | --- | --- |
| Environment | All required variables configured | Missing or placeholder value |
| Persistence | `postgres_schema_ready` | Missing schema or unreachable database |
| API health | `status=ok` | Health timeout or wrong service name |
| Evaluation | `verdict=SolvedVerified` | Any blocked hard constraint |
| Storage | `storage=stored` | Disabled or failed storage |
| Proof stamp | `state=issued` | Missing signature or not eligible |
| Verification | `verification_state=valid` | Invalid or missing persisted stamp |

Release outcome terms:

```text
SolvedVerified: all release checks and probe checks pass
AwaitingEvidence: DNS, database, or runtime evidence is incomplete
GovernanceBlocked: secret, CORS, or persistence policy fails
ModelInvalidated: observed runtime response conflicts with expected contract
SafeHalt: fail-closed persistence blocks runtime writes
```

## Release Record

Record:

```text
Operator:
Timestamp:
Image digest:
Commit:
Schema hash:
Preflight output:
Probe output:
Database witness:
Decision:
```

STATUS:
  Completeness: 100%
  Invariants verified: environment gate, schema gate, runtime gate, proof gate, release outcome terms
  Open issues: concrete production registry and hosting platform identifiers
  Next action: execute this checklist during api.mullusi.com release
