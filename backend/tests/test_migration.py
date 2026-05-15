"""
Purpose: verify local PostgreSQL provisioning artifacts and schema migration helpers.
Governance scope: compose contract, schema hash stability, schema loading, and migration failure behavior.
Dependencies: Python unittest and Mullusi migration module.
Invariants: tests require no Docker daemon, no PostgreSQL server, and at least three assertions per test.
"""

import unittest

from app.db.migration import MigrationUnavailable, apply_schema, load_schema, schema_hash, schema_path


class MigrationContractTests(unittest.TestCase):
    def test_schema_text_contains_required_tables(self) -> None:
        schema = load_schema()

        self.assertIn("CREATE TABLE IF NOT EXISTS govern_evaluations", schema)
        self.assertIn("CREATE TABLE IF NOT EXISTS govern_trace_deltas", schema)
        self.assertIn("CREATE TABLE IF NOT EXISTS proof_stamps", schema)
        self.assertIn("algorithm TEXT", schema)

    def test_schema_path_and_hash_are_stable(self) -> None:
        path = schema_path()
        first_hash = schema_hash()
        second_hash = schema_hash()

        self.assertTrue(path.name.endswith("schema.sql"))
        self.assertEqual(first_hash, second_hash)
        self.assertEqual(len(first_hash), 64)
        self.assertTrue(path.exists())

    def test_missing_database_url_blocks_migration(self) -> None:
        with self.assertRaises(MigrationUnavailable) as context:
            apply_schema("")

        self.assertIn("database_url_missing", str(context.exception))
        self.assertTrue(schema_path().exists())
        self.assertEqual(len(schema_hash()), 64)


if __name__ == "__main__":
    unittest.main()
