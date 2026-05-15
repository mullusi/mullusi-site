"""
Purpose: report whether Mullusi Govern Cloud can reach PostgreSQL and required tables.
Governance scope: explicit persistence readiness, driver availability, database URL presence, and schema table witness.
Dependencies: MULLUSI_DATABASE_URL and optional psycopg runtime driver.
Invariants: checks are read-only and never create or mutate database objects.
"""

from __future__ import annotations

import os
import shutil
import sys
from dataclasses import dataclass


REQUIRED_TABLES = (
    "govern_evaluations",
    "govern_violations",
    "govern_trace_deltas",
    "proof_stamps",
)
REQUIRED_SCHEMA = "public"


@dataclass(frozen=True)
class PersistenceCheck:
    state: str
    detail: str


def check_persistence() -> PersistenceCheck:
    """Return the local persistence readiness state."""
    database_url = os.getenv("MULLUSI_DATABASE_URL", "")
    if not database_url:
        return PersistenceCheck(
            state="blocked",
            detail="MULLUSI_DATABASE_URL_missing",
        )

    try:
        import psycopg
    except ImportError:
        return PersistenceCheck(
            state="blocked",
            detail="psycopg_not_installed",
        )

    try:
        with psycopg.connect(database_url, connect_timeout=5) as connection:
            with connection.cursor() as cursor:
                missing_tables = []
                for table_name in REQUIRED_TABLES:
                    cursor.execute(
                        """
                        SELECT 1
                        FROM information_schema.tables
                        WHERE table_schema = %s
                          AND table_name = %s
                        """,
                        (REQUIRED_SCHEMA, table_name),
                    )
                    if cursor.fetchone() is None:
                        missing_tables.append(table_name)
    except Exception as error:
        return PersistenceCheck(
            state="blocked",
            detail=f"database_unreachable:{type(error).__name__}",
        )

    if missing_tables:
        return PersistenceCheck(
            state="blocked",
            detail=f"schema_missing:{','.join(missing_tables)}",
        )

    return PersistenceCheck(
        state="ready",
        detail="postgres_schema_ready",
    )


def tool_hint() -> str:
    """Return a concise local tooling hint for operators."""
    if shutil.which("docker"):
        return "docker_available"
    if shutil.which("psql"):
        return "psql_available"
    if shutil.which("winget"):
        return "winget_available"
    if shutil.which("choco"):
        return "choco_available"
    return "postgres_tooling_missing"


def main() -> int:
    check = check_persistence()
    print(f"persistence_check state={check.state} detail={check.detail} hint={tool_hint()}")
    return 0 if check.state == "ready" else 1


if __name__ == "__main__":
    raise SystemExit(main())
