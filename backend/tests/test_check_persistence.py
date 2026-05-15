"""
Purpose: verify local persistence readiness checks without requiring PostgreSQL.
Governance scope: missing URL handling, tool hint shape, and required-table contract.
Dependencies: Python unittest and check_persistence script module.
Invariants: tests are read-only and require no database server.
"""

import os
import unittest
from unittest.mock import patch

from scripts.check_persistence import REQUIRED_SCHEMA, REQUIRED_TABLES, check_persistence, tool_hint


class PersistenceCheckTests(unittest.TestCase):
    def test_missing_database_url_reports_blocked_state(self) -> None:
        env = {key: value for key, value in os.environ.items() if key != "MULLUSI_DATABASE_URL"}

        with patch.dict(os.environ, env, clear=True):
            check = check_persistence()

        self.assertEqual(check.state, "blocked")
        self.assertEqual(check.detail, "MULLUSI_DATABASE_URL_missing")
        self.assertIn("govern_evaluations", REQUIRED_TABLES)
        self.assertEqual(REQUIRED_SCHEMA, "public")

    def test_required_tables_contract_includes_trace_and_stamp_tables(self) -> None:
        self.assertIn("govern_trace_deltas", REQUIRED_TABLES)
        self.assertIn("proof_stamps", REQUIRED_TABLES)
        self.assertEqual(len(REQUIRED_TABLES), 4)
        self.assertEqual(len(set(REQUIRED_TABLES)), len(REQUIRED_TABLES))

    def test_tool_hint_returns_known_category(self) -> None:
        hint = tool_hint()

        self.assertIsInstance(hint, str)
        self.assertTrue(hint.endswith("_available") or hint == "postgres_tooling_missing")
        self.assertGreater(len(hint), 4)


if __name__ == "__main__":
    unittest.main()
