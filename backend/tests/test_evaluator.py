"""
Purpose: verify the deterministic Govern Cloud evaluator contract.
Governance scope: pass path, hard failure, hard unknown, soft degradation, and stable lineage IDs.
Dependencies: Python unittest and Mullusi govern domain modules.
Invariants: each test carries at least three assertions and no external services are required.
"""

import unittest

from app.govern.evaluator import evaluate_request
from app.govern.models import (
    ActionProposal,
    ConstraintLevel,
    ConstraintRule,
    EvaluationContext,
    GovernanceConstraint,
    GovernanceRequest,
    ProofState,
    SymbolRecord,
    Verdict,
)


def governed_request(
    *,
    authority: str | None = "project-admin",
    constraint_level: ConstraintLevel = ConstraintLevel.HARD,
    operator: str = "requires",
) -> GovernanceRequest:
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
                level=constraint_level,
                target="state_write",
                rule=ConstraintRule(
                    operator=operator,
                    field="action.authority",
                    value="project-admin",
                ),
            ),
            GovernanceConstraint(
                id="trace-invariant",
                level=ConstraintLevel.HARD,
                target="state_write",
                rule=ConstraintRule(
                    operator="contains_invariant",
                    value="trace_required",
                ),
            ),
        ),
        context=EvaluationContext(environment="production", trace_required=True),
    )


class GovernEvaluatorTests(unittest.TestCase):
    def test_authorized_action_passes_with_proof_stamp_eligibility(self) -> None:
        result = evaluate_request(governed_request())

        self.assertEqual(result.verdict, Verdict.SOLVED_VERIFIED)
        self.assertEqual(result.proof_state, ProofState.PASS)
        self.assertEqual(result.violations, ())
        self.assertTrue(result.proof_stamp_eligible)
        self.assertEqual(len(result.trace), 13)

    def test_missing_authority_blocks_hard_constraint(self) -> None:
        result = evaluate_request(governed_request(authority=None))

        self.assertEqual(result.verdict, Verdict.GOVERNANCE_BLOCKED)
        self.assertEqual(result.proof_state, ProofState.FAIL)
        self.assertEqual(result.blocked_phase, "Constraint")
        self.assertFalse(result.proof_stamp_eligible)
        self.assertIn("Provide action.authority", result.repair_actions[0])

    def test_unknown_hard_operator_blocks_with_unknown_proof_state(self) -> None:
        result = evaluate_request(governed_request(operator="unbounded_jump"))

        self.assertEqual(result.verdict, Verdict.GOVERNANCE_BLOCKED)
        self.assertEqual(result.proof_state, ProofState.UNKNOWN)
        self.assertEqual(result.violations[0].constraint_id, "authority-required")
        self.assertEqual(result.blocked_phase, "Constraint")
        self.assertIn("unsupported constraint operator", result.repair_actions[0])

    def test_unknown_soft_operator_degrades_without_blocking(self) -> None:
        result = evaluate_request(
            governed_request(
                constraint_level=ConstraintLevel.SOFT,
                operator="preference_curve",
            )
        )

        self.assertEqual(result.verdict, Verdict.SOLVED_UNVERIFIED)
        self.assertEqual(result.proof_state, ProofState.UNKNOWN)
        self.assertIsNone(result.blocked_phase)
        self.assertFalse(result.proof_stamp_eligible)
        self.assertEqual(result.violations[0].level, ConstraintLevel.SOFT)

    def test_evaluation_ids_are_stable_for_identical_requests(self) -> None:
        first_result = evaluate_request(governed_request())
        second_result = evaluate_request(governed_request())

        self.assertEqual(first_result.evaluation_id, second_result.evaluation_id)
        self.assertEqual(first_result.trace_id, second_result.trace_id)
        self.assertEqual(first_result.trace[-1].delta["request_digest"], second_result.trace[-1].delta["request_digest"])
        self.assertEqual(first_result.verdict, second_result.verdict)


if __name__ == "__main__":
    unittest.main()
