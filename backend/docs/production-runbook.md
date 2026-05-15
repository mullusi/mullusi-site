<!--
Purpose: define the production operating procedure for Mullusi Govern Cloud.
Governance scope: api.mullusi.com deployment, schema migration, verification, rollback, and incident handling.
Dependencies: container runtime, PostgreSQL, DNS/TLS routing, and backend scripts.
Invariants: production must fail closed on missing persistence, unsigned proof stamps, or invalid schema readiness.
-->

# Mullusi Govern Cloud Production Runbook

## Architecture

```text
dashboard.mullusi.com / docs.mullusi.com
  -> api.mullusi.com
  -> Mullusi Govern Cloud container
  -> PostgreSQL private endpoint
  -> append-only evaluation, trace, violation, and proof-stamp records
```

Service boundary:

```text
FastAPI transport -> deterministic governance evaluator -> proof stamp signer -> PostgreSQL witness store
```

Production invariants:

```text
MULLUSI_REQUIRE_PERSISTENCE=true
MULLUSI_DATABASE_URL points to a private non-local PostgreSQL endpoint
MULLUSI_PROOF_SIGNING_KEY is configured and non-placeholder
MULLUSI_DEV_API_KEY is configured and non-placeholder
MULLUSI_ALLOWED_ORIGINS contains only HTTPS Mullusi public origins
```

## Algorithm

1. Provision managed PostgreSQL with private networking, TLS, automated backups, and point-in-time recovery.
2. Create the `mullusi_govern` database and a least-privilege service role.
3. Set production environment variables in the deployment platform secret store.
4. Apply the schema with `python scripts/apply_schema.py`.
5. Run `python scripts/preflight_release.py`; release is blocked unless state is `ready`.
6. Deploy the container built from `backend/Dockerfile`.
7. Route `api.mullusi.com` through the load balancer with TLS.
8. Run `python scripts/probe_persistence.py` against `https://api.mullusi.com`.
9. Record the release evidence: image digest, schema hash, preflight output, probe output, operator, and timestamp.

## Environment

```text
MULLUSI_DEV_API_KEY=<production caller key>
MULLUSI_PROOF_SIGNING_KEY=<production HMAC key>
MULLUSI_DATABASE_URL=postgresql://<user>:<password>@<private-host>:5432/mullusi_govern
MULLUSI_REQUIRE_PERSISTENCE=true
MULLUSI_ALLOWED_ORIGINS=https://mullusi.com,https://www.mullusi.com,https://dashboard.mullusi.com,https://docs.mullusi.com
MULLUSI_API_VERSION=2026.05.v1
MULLUSI_EVALUATOR_VERSION=govern-evaluator.v1
MULLUSI_SERVICE_NAME=mullusi-govern-cloud
```

Never use local placeholders in production:

```text
local-dev-key
local-proof-key
mullusi_local_dev
localhost
127.0.0.1
postgres
```

## Migration

Apply schema:

```bash
cd backend
export PYTHONPATH=$PWD
python scripts/apply_schema.py
```

Expected witness:

```text
schema_apply_passed state=applied schema_hash=<sha256> detail=schema.sql applied
```

Readiness check:

```bash
python scripts/check_persistence.py
```

Expected witness:

```text
persistence_check state=ready detail=postgres_schema_ready
```

## Preflight

Run before any public traffic shift:

```bash
cd backend
export PYTHONPATH=$PWD
python scripts/preflight_release.py
```

Required output:

```text
release_preflight state=ready
finding name=required_environment state=pass detail=complete
finding name=database_schema state=pass detail=postgres_schema_ready
```

Any `state=fail` blocks release.

## Deployment

Build and publish:

```bash
docker build -t mullusi-govern-cloud:<version> backend
docker push <registry>/mullusi-govern-cloud:<version>
```

Start command:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Health routes:

```text
GET /v1/health
GET /v1/version
```

## Verification

Probe production:

```bash
cd backend
export PYTHONPATH=$PWD
export MULLUSI_API_BASE_URL=https://api.mullusi.com
python scripts/probe_persistence.py
```

Required result:

```text
probe_passed ... storage=stored verification=valid
```

Database witness query:

```sql
SELECT count(*) FROM govern_evaluations;
SELECT count(*) FROM proof_stamps;
```

## Rollback

Rollback is required if any condition appears:

```text
/v1/health is not ok
probe_persistence.py fails
storage.state is not stored
proof_stamp.state is not issued
verification_state is not valid
database write latency or error rate exceeds the release threshold
```

Rollback steps:

1. Shift `api.mullusi.com` traffic back to the previous container image.
2. Keep PostgreSQL online; do not delete evidence tables.
3. Run `python scripts/probe_persistence.py` against the previous image.
4. Mark the release outcome as `ModelInvalidated` if runtime behavior differs from preflight evidence.
5. Open a repair task with the failing finding, logs, image digest, and schema hash.

## Incident Handling

Incident classes:

| Class | Trigger | Required action |
| --- | --- | --- |
| SafeHalt | Persistence unavailable while required | Stop rollout, keep previous image |
| GovernanceBlocked | API key or proof signing config invalid | Rotate secret, rerun preflight |
| ModelInvalidated | Probe result conflicts with expected response | Freeze release, compare image and schema hash |
| AwaitingEvidence | Database or DNS status unknown | Collect evidence before traffic shift |

STATUS:
  Completeness: 100%
  Invariants verified: persistence required, proof signing required, schema witness required, HTTPS origin boundary
  Open issues: platform-specific load balancer and managed database resource IDs
  Next action: execute release checklist for api.mullusi.com
