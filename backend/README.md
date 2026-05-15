<!--
Purpose: document the Mullusi Govern Cloud backend package.
Governance scope: service boundary, local setup, evaluator contract, and verification commands.
Dependencies: Python, FastAPI runtime dependencies, and stdlib tests for the deterministic evaluator.
Invariants: backend files remain isolated from the public GitHub Pages site and expose no runtime secrets.
-->

# Mullusi Govern Cloud Backend

This backend package contains the first isolated service skeleton for `api.mullusi.com`.

The public static website remains deployable from `mullusi/mullusi-site` without this backend. This service is a separate FastAPI application for the first Govern Cloud vertical slice:

```text
API key -> POST /v1/govern/evaluate -> deterministic evaluator -> trace envelope -> verdict
```

## Contract

```text
POST /v1/govern/evaluate

Input:
  project_id
  system_id
  action
  symbols
  constraints
  context

Output:
  evaluation_id
  verdict
  proof_state
  blocked_phase
  violations
  trace_id
  proof_stamp_eligible
  proof_stamp
  repair_actions
  storage
  trace
```

## PostgreSQL Persistence

Start the local database with Docker Compose:

```bash
docker compose up -d postgres
```

Apply the schema before enabling storage:

```bash
set PYTHONPATH=%CD%
set MULLUSI_DATABASE_URL=postgresql://mullusi:mullusi_local_dev@127.0.0.1:55432/mullusi_govern
python scripts/apply_schema.py
```

Persistence environment:

```text
MULLUSI_DATABASE_URL       PostgreSQL connection URL. If absent, responses report storage.state=disabled.
MULLUSI_REQUIRE_PERSISTENCE=true  Blocks evaluation responses when no database URL is configured.
MULLUSI_PROOF_SIGNING_KEY  HMAC key for issuing signed proof stamps.
```

When `MULLUSI_DATABASE_URL` is configured, `POST /v1/govern/evaluate` writes:

```text
govern_evaluations
govern_violations
govern_trace_deltas
proof_stamps
```

Repeated identical evaluations are idempotent because evaluation and trace identifiers are deterministic.

## Proof Stamps

`POST /v1/govern/evaluate` returns a `proof_stamp` envelope:

```text
not_eligible       proof state did not pass
signing_disabled   eligible, but MULLUSI_PROOF_SIGNING_KEY is absent
issued             eligible and signed with HMAC-SHA256
```

Persisted stamps can be verified through:

```text
GET /v1/proof-stamps/{stamp_id}
```

Verification by ID requires `MULLUSI_DATABASE_URL` because the route must read the persisted stamp record.

## Local Setup

```bash
python -m venv .venv
.venv/Scripts/activate
pip install -r requirements.txt
set PYTHONPATH=%CD%
set MULLUSI_DEV_API_KEY=local-dev-key
set MULLUSI_PROOF_SIGNING_KEY=local-proof-key
set MULLUSI_DATABASE_URL=postgresql://mullusi:mullusi_local_dev@127.0.0.1:55432/mullusi_govern
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Local setup can also be run with:

```powershell
.\scripts\setup_local_env.ps1
```

Persistence readiness check:

```bash
python scripts/check_persistence.py
```

If PostgreSQL is not installed and Docker is unavailable, install PostgreSQL explicitly with one of these operator-controlled commands:

```powershell
winget install --id PostgreSQL.PostgreSQL.16 --source winget
# or
choco install postgresql16
```

Without admin access, use the repo-local portable runtime:

```powershell
.\scripts\setup_portable_postgres.ps1
set MULLUSI_DATABASE_URL=postgresql://mullusi:mullusi_local_dev@127.0.0.1:55432/mullusi_govern
python scripts/apply_schema.py
```

Stop the portable runtime:

```powershell
.\scripts\stop_portable_postgres.ps1
```

End-to-end persistence probe:

```bash
set PYTHONPATH=%CD%
set MULLUSI_API_BASE_URL=http://127.0.0.1:8000
set MULLUSI_DEV_API_KEY=local-dev-key
python scripts/probe_persistence.py
```

## Container Setup

Run the API and PostgreSQL together with Docker Compose:

```bash
docker compose up --build
```

Apply the schema inside the API container after PostgreSQL is healthy:

```bash
docker compose exec api python scripts/apply_schema.py
```

Probe the containerized API:

```bash
set MULLUSI_API_BASE_URL=http://127.0.0.1:8000
set MULLUSI_DEV_API_KEY=local-dev-key
python scripts/probe_persistence.py
```

The Compose file is local-only. Production must inject real values for:

```text
MULLUSI_DEV_API_KEY
MULLUSI_PROOF_SIGNING_KEY
MULLUSI_DATABASE_URL
MULLUSI_REQUIRE_PERSISTENCE=true
MULLUSI_ALLOWED_ORIGINS=https://mullusi.com,https://www.mullusi.com,https://dashboard.mullusi.com,https://docs.mullusi.com
```

Production deployment order:

1. Provision PostgreSQL with TLS and backups.
2. Set `MULLUSI_DATABASE_URL` to the private database endpoint.
3. Apply `app/db/schema.sql` using `python scripts/apply_schema.py`.
4. Run `python scripts/preflight_release.py`.
5. Start the API container from `Dockerfile`.
6. Route `api.mullusi.com` to the container load balancer.
7. Confirm `/v1/health`, `/v1/version`, and `scripts/probe_persistence.py`.

Production operating docs:

```text
docs/production-runbook.md
docs/api-mullusi-release-checklist.md
```

## Verification

```bash
python -m compileall app scripts tests
python -m unittest discover -s tests
python scripts/preflight_release.py
```

Repository CI also runs:

```text
python -m compileall app scripts tests
python -m unittest discover -s tests
python scripts/preflight_release.py with local placeholders and expected block
docker build -t mullusi-govern-cloud:ci .
```

CI is a release gate only. It does not publish images, route DNS, or access production secrets.

`backend/.github/workflows/govern-cloud-ci.yml` is a backend-local CI template for the same service if the backend is later split into a dedicated repository.

## Governance Boundary

The evaluator is deterministic and dependency-free. FastAPI handles transport, PostgreSQL stores append-only evidence, and proof stamps are signed only when `MULLUSI_PROOF_SIGNING_KEY` is configured. Billing and dashboard integration are intentionally deferred until persistence and proof verification are stable.
