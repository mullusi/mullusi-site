"""
Purpose: verify repository CI workflow contracts for Mullusi website and Govern Cloud.
Governance scope: static validation, backend test gate, release preflight block, and container build witness.
Dependencies: Python unittest and GitHub Actions workflow text.
Invariants: tests are read-only and do not execute CI or require GitHub credentials.
"""

from pathlib import Path
import unittest


BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = Path(__file__).resolve().parents[2]
ROOT_WORKFLOW_PATH = REPO_ROOT / ".github" / "workflows" / "mullusi-ci.yml"
BACKEND_WORKFLOW_PATH = BACKEND_ROOT / ".github" / "workflows" / "govern-cloud-ci.yml"


class CiWorkflowContractTests(unittest.TestCase):
    def test_root_workflow_runs_static_site_validation(self) -> None:
        workflow = ROOT_WORKFLOW_PATH.read_text(encoding="utf-8")

        self.assertIn("Static site validation", workflow)
        self.assertIn("node --check assets/app.js", workflow)
        self.assertIn("node scripts/validate-site.mjs", workflow)
        self.assertIn("actions/setup-node@v4", workflow)

    def test_root_workflow_runs_backend_tests_and_container_build(self) -> None:
        workflow = ROOT_WORKFLOW_PATH.read_text(encoding="utf-8")

        self.assertIn("Govern Cloud backend validation", workflow)
        self.assertIn("python -m compileall app scripts tests", workflow)
        self.assertIn("python -m unittest discover -s tests", workflow)
        self.assertIn("docker build -t mullusi-govern-cloud:ci backend", workflow)

    def test_backend_template_runs_backend_tests_and_compile_gate(self) -> None:
        workflow = BACKEND_WORKFLOW_PATH.read_text(encoding="utf-8")

        self.assertIn("Backend validation", workflow)
        self.assertIn("actions/setup-python@v5", workflow)
        self.assertIn("python -m pip install -r requirements.txt", workflow)
        self.assertIn("python -m compileall app scripts tests", workflow)
        self.assertIn("python -m unittest discover -s tests", workflow)
        self.assertIn("PYTHONPATH: ${{ github.workspace }}", workflow)

    def test_backend_template_blocks_placeholder_release_preflight_and_builds_container(self) -> None:
        workflow = BACKEND_WORKFLOW_PATH.read_text(encoding="utf-8")

        self.assertIn("Confirm local release preflight blocks placeholders", workflow)
        self.assertIn("python scripts/preflight_release.py", workflow)
        self.assertIn('test "$status" -eq 1', workflow)
        self.assertIn("docker build -t mullusi-govern-cloud:ci .", workflow)


if __name__ == "__main__":
    unittest.main()
