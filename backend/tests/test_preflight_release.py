"""
Purpose: verify production release preflight checks for Mullusi Govern Cloud.
Governance scope: secret shape, production persistence policy, CORS origin boundary, and schema witness.
Dependencies: Python unittest and preflight_release script module.
Invariants: tests are pure and never contact a database or print secret values.
"""

import unittest

from scripts.check_persistence import PersistenceCheck
from scripts.preflight_release import evaluate_release_preflight


def production_env() -> dict[str, str]:
    return {
        "MULLUSI_DEV_API_KEY": "prod-api-key-0123456789abcdef012345",
        "MULLUSI_PROOF_SIGNING_KEY": "prod-proof-key-0123456789abcdef0123",
        "MULLUSI_DATABASE_URL": "postgresql://mullusi:prod-db-secret-0123456789@db.mullusi.internal:5432/mullusi_govern",
        "MULLUSI_REQUIRE_PERSISTENCE": "true",
        "MULLUSI_ALLOWED_ORIGINS": "https://mullusi.com,https://www.mullusi.com,https://dashboard.mullusi.com,https://docs.mullusi.com",
    }


def ready_persistence() -> PersistenceCheck:
    return PersistenceCheck(state="ready", detail="postgres_schema_ready")


def blocked_persistence() -> PersistenceCheck:
    return PersistenceCheck(state="blocked", detail="schema_missing:proof_stamps")


class ReleasePreflightTests(unittest.TestCase):
    def test_production_environment_with_ready_schema_passes(self) -> None:
        preflight = evaluate_release_preflight(production_env(), ready_persistence)
        findings = {finding.name: finding for finding in preflight.findings}

        self.assertEqual(preflight.state, "ready")
        self.assertEqual(findings["database_url"].state, "pass")
        self.assertEqual(findings["persistence_policy"].detail, "required")
        self.assertEqual(findings["allowed_origins"].detail, "count:4")

    def test_missing_environment_values_block_release(self) -> None:
        preflight = evaluate_release_preflight({}, ready_persistence)
        findings = {finding.name: finding for finding in preflight.findings}

        self.assertEqual(preflight.state, "blocked")
        self.assertEqual(findings["required_environment"].state, "fail")
        self.assertIn("MULLUSI_DEV_API_KEY", findings["required_environment"].detail)
        self.assertEqual(findings["MULLUSI_PROOF_SIGNING_KEY"].detail, "missing")

    def test_local_placeholder_values_block_release(self) -> None:
        env = {
            "MULLUSI_DEV_API_KEY": "local-dev-key",
            "MULLUSI_PROOF_SIGNING_KEY": "local-proof-key",
            "MULLUSI_DATABASE_URL": "postgresql://mullusi:mullusi_local_dev@127.0.0.1:55432/mullusi_govern",
            "MULLUSI_REQUIRE_PERSISTENCE": "false",
            "MULLUSI_ALLOWED_ORIGINS": "https://mullusi.com,http://localhost:5173",
        }

        preflight = evaluate_release_preflight(env, ready_persistence)
        findings = {finding.name: finding for finding in preflight.findings}

        self.assertEqual(preflight.state, "blocked")
        self.assertEqual(findings["MULLUSI_DEV_API_KEY"].detail, "placeholder_value")
        self.assertEqual(findings["database_url"].detail, "local_host_forbidden")
        self.assertEqual(findings["allowed_origins"].state, "fail")

    def test_schema_readiness_failure_blocks_release(self) -> None:
        preflight = evaluate_release_preflight(production_env(), blocked_persistence)
        findings = {finding.name: finding for finding in preflight.findings}

        self.assertEqual(preflight.state, "blocked")
        self.assertEqual(findings["database_schema"].state, "fail")
        self.assertEqual(findings["database_schema"].detail, "schema_missing:proof_stamps")
        self.assertEqual(findings["database_url"].state, "pass")


if __name__ == "__main__":
    unittest.main()
