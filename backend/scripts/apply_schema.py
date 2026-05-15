"""
Purpose: apply the Mullusi Govern Cloud PostgreSQL schema from the command line.
Governance scope: explicit database URL requirement and schema hash witness output.
Dependencies: MULLUSI_DATABASE_URL, optional psycopg runtime driver, and app.db.migration.
Invariants: no default production target is assumed and failures exit nonzero.
"""

from __future__ import annotations

import os
import sys

from app.db.migration import MigrationUnavailable, apply_schema


def main() -> int:
    database_url = os.getenv("MULLUSI_DATABASE_URL", "")
    try:
        receipt = apply_schema(database_url)
    except MigrationUnavailable as error:
        print(f"schema_apply_failed:{error}", file=sys.stderr)
        return 1

    print(
        f"schema_apply_passed state={receipt.state} "
        f"schema_hash={receipt.schema_hash} detail={receipt.detail}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
