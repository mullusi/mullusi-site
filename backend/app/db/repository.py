"""
Purpose: persist Mullusi Govern Cloud evaluations to PostgreSQL when configured.
Governance scope: explicit persistence policy, fail-closed database errors, and idempotent append-only inserts.
Dependencies: environment variables, optional psycopg driver, and PostgreSQL schema.sql.
Invariants: missing persistence is reported explicitly; configured persistence failure blocks the HTTP response.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

from app.core.settings import get_runtime_settings
from app.db.records import (
    evaluation_row,
    proof_stamp_row,
    trace_delta_rows,
    violation_rows,
)
from app.govern.proof import ProofStampEnvelope
from app.govern.models import EvaluationResult, GovernanceRequest


@dataclass(frozen=True)
class PersistenceReceipt:
    state: str
    detail: str


class PersistenceUnavailable(RuntimeError):
    """Raised when configured persistence cannot satisfy the storage contract."""


class ProofStampNotFound(LookupError):
    """Raised when a proof-stamp ID does not exist in persistence."""


@dataclass(frozen=True)
class ProofStampRecord:
    proof_stamp_id: str
    evaluation_id: str
    stamp_state: str
    stamp_hash: str
    algorithm: str | None
    signature: str | None


def store_evaluation_if_configured(
    request: GovernanceRequest,
    result: EvaluationResult,
    stamp: ProofStampEnvelope | None = None,
) -> PersistenceReceipt:
    """Store an evaluation when PostgreSQL is configured, otherwise report disabled state."""
    database_url = os.getenv("MULLUSI_DATABASE_URL")
    persistence_required = get_runtime_settings().require_persistence

    if not database_url:
        if persistence_required:
            raise PersistenceUnavailable("database_url_missing")
        return PersistenceReceipt(
            state="disabled",
            detail="MULLUSI_DATABASE_URL not configured",
        )

    try:
        return _store_with_postgres(database_url, request, result, stamp)
    except ImportError as error:
        raise PersistenceUnavailable("psycopg_not_installed") from error
    except Exception as error:
        raise PersistenceUnavailable("postgres_write_failed") from error


def _store_with_postgres(
    database_url: str,
    request: GovernanceRequest,
    result: EvaluationResult,
    stamp: ProofStampEnvelope | None,
) -> PersistenceReceipt:
    import psycopg
    from psycopg.types.json import Jsonb

    eval_row = evaluation_row(request, result)
    violations = violation_rows(result)
    trace_rows = trace_delta_rows(result)
    stamp_row = proof_stamp_row(result, stamp)

    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO govern_evaluations (
                  evaluation_id,
                  trace_id,
                  project_id,
                  system_id,
                  verdict,
                  proof_state,
                  blocked_phase,
                  proof_stamp_eligible,
                  repair_actions,
                  request_hash,
                  request_body,
                  response_body
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (evaluation_id) DO NOTHING
                """,
                (
                    eval_row["evaluation_id"],
                    eval_row["trace_id"],
                    eval_row["project_id"],
                    eval_row["system_id"],
                    eval_row["verdict"],
                    eval_row["proof_state"],
                    eval_row["blocked_phase"],
                    eval_row["proof_stamp_eligible"],
                    Jsonb(eval_row["repair_actions"]),
                    eval_row["request_hash"],
                    Jsonb(eval_row["request_body"]),
                    Jsonb(eval_row["response_body"]),
                ),
            )

            for violation in violations:
                cursor.execute(
                    """
                    INSERT INTO govern_violations (
                      violation_id,
                      evaluation_id,
                      ordinal,
                      constraint_id,
                      level,
                      cause,
                      blocked_phase
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (evaluation_id, ordinal) DO NOTHING
                    """,
                    (
                        violation["violation_id"],
                        violation["evaluation_id"],
                        violation["ordinal"],
                        violation["constraint_id"],
                        violation["level"],
                        violation["cause"],
                        violation["blocked_phase"],
                    ),
                )

            for trace_row in trace_rows:
                cursor.execute(
                    """
                    INSERT INTO govern_trace_deltas (
                      trace_delta_id,
                      evaluation_id,
                      trace_id,
                      phase_index,
                      phase,
                      delta,
                      judgment
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (trace_id, phase_index) DO NOTHING
                    """,
                    (
                        trace_row["trace_delta_id"],
                        trace_row["evaluation_id"],
                        trace_row["trace_id"],
                        trace_row["phase_index"],
                        trace_row["phase"],
                        Jsonb(trace_row["delta"]),
                        Jsonb(trace_row["judgment"]),
                    ),
                )

            if stamp_row is not None:
                cursor.execute(
                    """
                    INSERT INTO proof_stamps (
                      proof_stamp_id,
                      evaluation_id,
                      stamp_state,
                      stamp_hash,
                      algorithm,
                      signature
                    )
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (evaluation_id) DO UPDATE SET
                      stamp_state = EXCLUDED.stamp_state,
                      stamp_hash = EXCLUDED.stamp_hash,
                      algorithm = EXCLUDED.algorithm,
                      signature = COALESCE(EXCLUDED.signature, proof_stamps.signature),
                      issued_at = CASE
                        WHEN EXCLUDED.signature IS NOT NULL THEN COALESCE(proof_stamps.issued_at, now())
                        ELSE proof_stamps.issued_at
                      END
                    """,
                    (
                        stamp_row["proof_stamp_id"],
                        stamp_row["evaluation_id"],
                        stamp_row["stamp_state"],
                        stamp_row["stamp_hash"],
                        stamp_row["algorithm"],
                        stamp_row["signature"],
                    ),
                )

    return PersistenceReceipt(
        state="stored",
        detail=f"evaluation:{result.evaluation_id}",
    )


def receipt_to_response(receipt: PersistenceReceipt) -> dict[str, Any]:
    """Convert the persistence receipt into a JSON response fragment."""
    return {"state": receipt.state, "detail": receipt.detail}


def fetch_proof_stamp(stamp_id: str) -> ProofStampRecord:
    """Fetch one persisted proof stamp by ID."""
    database_url = os.getenv("MULLUSI_DATABASE_URL")
    if not database_url:
        raise PersistenceUnavailable("database_url_missing")

    try:
        return _fetch_proof_stamp_with_postgres(database_url, stamp_id)
    except ImportError as error:
        raise PersistenceUnavailable("psycopg_not_installed") from error


def _fetch_proof_stamp_with_postgres(
    database_url: str,
    stamp_id: str,
) -> ProofStampRecord:
    import psycopg

    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                  proof_stamp_id::text,
                  evaluation_id::text,
                  stamp_state,
                  stamp_hash,
                  algorithm,
                  signature
                FROM proof_stamps
                WHERE proof_stamp_id = %s
                """,
                (stamp_id,),
            )
            row = cursor.fetchone()

    if row is None:
        raise ProofStampNotFound(stamp_id)

    return ProofStampRecord(
        proof_stamp_id=row[0],
        evaluation_id=row[1],
        stamp_state=row[2],
        stamp_hash=row[3],
        algorithm=row[4],
        signature=row[5],
    )
