"""
Purpose: apply and identify the Mullusi Govern Cloud PostgreSQL schema.
Governance scope: schema loading, schema hash witness, and explicit migration failure behavior.
Dependencies: Python standard library and optional psycopg runtime driver.
Invariants: schema loading is deterministic and applying the schema requires an explicit database URL.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path


class MigrationUnavailable(RuntimeError):
    """Raised when schema migration cannot be applied."""


@dataclass(frozen=True)
class MigrationReceipt:
    state: str
    schema_hash: str
    detail: str


def schema_path() -> Path:
    """Return the repository path to the PostgreSQL schema."""
    return Path(__file__).resolve().with_name("schema.sql")


def load_schema() -> str:
    """Load the PostgreSQL schema text."""
    return schema_path().read_text(encoding="utf-8")


def schema_hash() -> str:
    """Return a stable hash for the current schema."""
    return hashlib.sha256(load_schema().encode("utf-8")).hexdigest()


def apply_schema(database_url: str) -> MigrationReceipt:
    """Apply the schema to a PostgreSQL database."""
    if not database_url.strip():
        raise MigrationUnavailable("database_url_missing")

    try:
        import psycopg
    except ImportError as error:
        raise MigrationUnavailable("psycopg_not_installed") from error

    schema_text = load_schema()
    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(schema_text)

    return MigrationReceipt(
        state="applied",
        schema_hash=schema_hash(),
        detail="schema.sql applied",
    )
