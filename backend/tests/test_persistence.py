"""
Purpose: verify PostgreSQL persistence serialization and policy behavior.
Governance scope: row construction, proof-stamp eligibility, disabled persistence, and required persistence blocking.
Dependencies: Python unittest, environment patching, and Mullusi backend modules.
Invariants: tests require no PostgreSQL server and each test carries at least three assertions.
"""

import os
import unittest
from unittest.mock import patch

from app.db.records import (
    evaluation_row,
    proof_stamp_row,
    stable_hash,
    trace_delta_rows,
    violation_rows,
)
from app.govern.proof import issue_proof_stamp
from app.db.repository import PersistenceUnavailable, store_evaluation_if_configured
from app.govern.evaluator import evaluate_request
from app.govern.models import (
    ActionProposal,
    ConstraintLevel,
    ConstraintRule,
    EvaluationContext,
    GovernanceConstraint,
    GovernanceRequest,
    SymbolRecord,
)


def request_with_authority(authority: str | None = "project-admin") -> GovernanceRequest:
    return GovernanceRequest(
        project_id="project-alpha",
        system_id="govern-cloud-v1",
        action=ActionProposal(
            id="deploy-api-change",
            kind="deployment",
            intent="release govern evaluation endpoint",
            authority=authority,
        ),
        symbols=(
            SymbolRecord(
                id="state_write",
                kind="operation",
                boundary="api.mullusi.com",
                invariants=("authority_required", "trace_required"),
            ),
        ),
        constraints=(
            GovernanceConstraint(
                id="authority-required",
                level=ConstraintLevel.HARD,
                target="state_write",
                rule=ConstraintRule(
                    operator="requires",
                    field="action.authority",
                    value="project-admin",
                ),
            ),
        ),
        context=EvaluationContext(environment="production", trace_required=True),
    )


class PersistenceRecordTests(unittest.TestCase):
    def test_evaluation_row_preserves_request_and_response_contract(self) -> None:
        request = request_with_authority()
        result = evaluate_request(request)
        row = evaluation_row(request, result)

        self.assertEqual(row["evaluation_id"], result.evaluation_id)
        self.assertEqual(row["trace_id"], result.trace_id)
        self.assertEqual(row["project_id"], "project-alpha")
        self.assertEqual(row["request_hash"], stable_hash(request))
        self.assertEqual(row["response_body"]["proof_state"], "Pass")

    def test_trace_and_proof_rows_are_deterministic(self) -> None:
        result = evaluate_request(request_with_authority())
        first_trace_rows = trace_delta_rows(result)
        second_trace_rows = trace_delta_rows(result)
        stamp = proof_stamp_row(result)

        self.assertEqual(len(first_trace_rows), 13)
        self.assertEqual(first_trace_rows, second_trace_rows)
        self.assertEqual(first_trace_rows[0]["phase_index"], 1)
        self.assertIsNotNone(stamp)
        self.assertEqual(stamp["algorithm"], "HMAC-SHA256")
        self.assertTrue(stamp["stamp_hash"].startswith("sha256:"))

    def test_issued_proof_stamp_row_preserves_signature(self) -> None:
        result = evaluate_request(request_with_authority())
        env = {key: value for key, value in os.environ.items() if not key.startswith("MULLUSI_")}
        env["MULLUSI_PROOF_SIGNING_KEY"] = "unit-proof-key"

        with patch.dict(os.environ, env, clear=True):
            issued_stamp = issue_proof_stamp(result)
            row = proof_stamp_row(result, issued_stamp)

        self.assertEqual(row["stamp_state"], "issued")
        self.assertEqual(row["signature"], issued_stamp.signature)
        self.assertEqual(row["algorithm"], "HMAC-SHA256")
        self.assertEqual(row["proof_stamp_id"], issued_stamp.id)

    def test_violation_rows_are_absent_for_pass_and_present_for_block(self) -> None:
        pass_result = evaluate_request(request_with_authority())
        blocked_result = evaluate_request(request_with_authority(authority=None))
        rows = violation_rows(blocked_result)

        self.assertEqual(violation_rows(pass_result), [])
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["ordinal"], 1)
        self.assertEqual(rows[0]["level"], "hard")

    def test_disabled_persistence_reports_explicit_receipt(self) -> None:
        request = request_with_authority()
        result = evaluate_request(request)
        env = {key: value for key, value in os.environ.items() if not key.startswith("MULLUSI_")}

        with patch.dict(os.environ, env, clear=True):
            receipt = store_evaluation_if_configured(request, result)

        self.assertEqual(receipt.state, "disabled")
        self.assertIn("MULLUSI_DATABASE_URL", receipt.detail)
        self.assertEqual(result.proof_stamp_eligible, True)
        self.assertEqual(result.verdict.value, "SolvedVerified")

    def test_required_persistence_without_database_url_blocks(self) -> None:
        request = request_with_authority()
        result = evaluate_request(request)
        env = {
            key: value
            for key, value in os.environ.items()
            if not key.startswith("MULLUSI_")
        }
        env["MULLUSI_REQUIRE_PERSISTENCE"] = "true"

        with patch.dict(os.environ, env, clear=True):
            with self.assertRaises(PersistenceUnavailable) as context:
                store_evaluation_if_configured(request, result)

        self.assertIn("database_url_missing", str(context.exception))
        self.assertEqual(result.proof_state.value, "Pass")
        self.assertEqual(len(result.trace), 13)


if __name__ == "__main__":
    unittest.main()
