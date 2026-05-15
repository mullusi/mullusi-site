"""
Purpose: verify portable PostgreSQL setup script contracts without downloading binaries.
Governance scope: repo-local runtime paths, no service mutation, and expected environment variables.
Dependencies: Python unittest and PowerShell script text.
Invariants: tests are read-only and perform no network, database, or process operations.
"""

from pathlib import Path
import unittest


SCRIPT_DIR = Path(__file__).resolve().parents[1] / "scripts"


class PortablePostgresScriptTests(unittest.TestCase):
    def test_setup_script_is_repo_local_and_non_service(self) -> None:
        script = (SCRIPT_DIR / "setup_portable_postgres.ps1").read_text(encoding="utf-8")

        self.assertIn(".postgres", script)
        self.assertIn(".pgdata", script)
        self.assertIn(".pgrun", script)
        self.assertNotIn("New-Service", script)
        self.assertNotIn("Set-ItemProperty", script)

    def test_setup_script_creates_expected_database_contract(self) -> None:
        script = (SCRIPT_DIR / "setup_portable_postgres.ps1").read_text(encoding="utf-8")

        self.assertIn("mullusi_govern", script)
        self.assertIn("CREATE ROLE mullusi", script)
        self.assertIn("createdb.exe", script)
        self.assertIn("-O mullusi mullusi_govern", script)
        self.assertIn("55432", script)

    def test_stop_script_does_not_delete_runtime_files(self) -> None:
        script = (SCRIPT_DIR / "stop_portable_postgres.ps1").read_text(encoding="utf-8")

        self.assertIn("pg_ctl.exe", script)
        self.assertIn("stop", script)
        self.assertNotIn("Remove-Item", script)
        self.assertNotIn("rmdir", script.lower())


if __name__ == "__main__":
    unittest.main()
