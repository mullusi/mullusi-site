"""
Purpose: verify deployment artifact contracts for Mullusi Govern Cloud.
Governance scope: container runtime boundary, Compose service linkage, and secret injection discipline.
Dependencies: Python unittest and deployment file text.
Invariants: tests are read-only and do not build images or start containers.
"""

from pathlib import Path
import unittest


BACKEND_ROOT = Path(__file__).resolve().parents[1]


class DeploymentContractTests(unittest.TestCase):
    def test_dockerfile_runs_as_non_root_api_service(self) -> None:
        dockerfile = (BACKEND_ROOT / "Dockerfile").read_text(encoding="utf-8")

        self.assertIn("FROM python:3.12-slim", dockerfile)
        self.assertIn("USER mullusi", dockerfile)
        self.assertIn('CMD ["uvicorn", "app.main:app"', dockerfile)
        self.assertIn("HEALTHCHECK", dockerfile)
        self.assertIn("scripts/preflight_release.py", dockerfile)

    def test_dockerignore_excludes_local_runtime_state(self) -> None:
        dockerignore = (BACKEND_ROOT / ".dockerignore").read_text(encoding="utf-8")

        self.assertIn(".venv/", dockerignore)
        self.assertIn(".postgres/", dockerignore)
        self.assertIn(".pgdata/", dockerignore)
        self.assertIn(".env", dockerignore)

    def test_compose_links_api_to_postgres_without_hardcoded_production_secret(self) -> None:
        compose = (BACKEND_ROOT / "compose.yaml").read_text(encoding="utf-8")

        self.assertIn("mullusi-govern-api", compose)
        self.assertIn("depends_on:", compose)
        self.assertIn("postgres:5432/mullusi_govern", compose)
        self.assertIn("${MULLUSI_PROOF_SIGNING_KEY:-local-proof-key}", compose)

    def test_production_runbooks_reference_preflight_and_probe_gates(self) -> None:
        runbook = (BACKEND_ROOT / "docs" / "production-runbook.md").read_text(encoding="utf-8")
        checklist = (BACKEND_ROOT / "docs" / "api-mullusi-release-checklist.md").read_text(encoding="utf-8")

        self.assertIn("scripts/preflight_release.py", runbook)
        self.assertIn("scripts/probe_persistence.py", runbook)
        self.assertIn("release_preflight state=ready", checklist)
        self.assertIn("probe_passed", checklist)


if __name__ == "__main__":
    unittest.main()
