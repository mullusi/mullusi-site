"""
Purpose: verify Mullusi Govern Cloud runtime settings parsing.
Governance scope: environment-derived versions, CORS boundaries, and persistence policy.
Dependencies: Python unittest and settings module.
Invariants: tests are pure and never read process secrets.
"""

import unittest

from app.core.settings import (
    DEFAULT_ALLOWED_ORIGINS,
    RuntimeSettings,
    runtime_settings_from_env,
)


class RuntimeSettingsTests(unittest.TestCase):
    def test_defaults_define_public_runtime_contract(self) -> None:
        settings = runtime_settings_from_env({})

        self.assertIsInstance(settings, RuntimeSettings)
        self.assertEqual(settings.service_name, "mullusi-govern-cloud")
        self.assertEqual(settings.api_version, "2026.05.v1")
        self.assertEqual(settings.allowed_origins, DEFAULT_ALLOWED_ORIGINS)
        self.assertFalse(settings.require_persistence)

    def test_environment_overrides_are_trimmed_and_deduplicated(self) -> None:
        settings = runtime_settings_from_env(
            {
                "MULLUSI_SERVICE_NAME": "mullusi-govern-prod",
                "MULLUSI_API_VERSION": "2026.05.prod",
                "MULLUSI_EVALUATOR_VERSION": "govern-evaluator.prod",
                "MULLUSI_ALLOWED_ORIGINS": " https://dashboard.mullusi.com,https://dashboard.mullusi.com,https://mullusi.com ",
                "MULLUSI_ALLOWED_METHODS": "GET, POST",
                "MULLUSI_ALLOWED_HEADERS": "Content-Type, X-Mullusi-Key",
                "MULLUSI_REQUIRE_PERSISTENCE": "yes",
            }
        )

        self.assertEqual(settings.service_name, "mullusi-govern-prod")
        self.assertEqual(settings.api_version, "2026.05.prod")
        self.assertEqual(settings.evaluator_version, "govern-evaluator.prod")
        self.assertEqual(settings.allowed_origins, ("https://dashboard.mullusi.com", "https://mullusi.com"))
        self.assertTrue(settings.require_persistence)


if __name__ == "__main__":
    unittest.main()
