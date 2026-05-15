"""
Purpose: verify Mullusi proof-stamp signing and verification behavior.
Governance scope: eligible issuance, disabled signing, ineligible results, valid signatures, and invalid signatures.
Dependencies: Python unittest, environment patching, and Mullusi proof modules.
Invariants: tests require no external services and each test carries at least three assertions.
"""

import os
import unittest
from unittest.mock import patch

from app.govern.evaluator import evaluate_request
from app.govern.models import (
    ActionProposal,
    ConstraintLevel,
    ConstraintRule,
    EvaluationContext,
    GovernanceConstraint,
    GovernanceRequest,
)
from app.govern.proof import (
    PROOF_STAMP_ALGORITHM,
    issue_proof_stamp,
    verify_proof_stamp,
)


def proof_request(authority: str | None = "project-admin") -> GovernanceRequest:
    return GovernanceRequest(
        project_id="project-alpha",
        system_id="govern-cloud-v1",
        action=ActionProposal(
            id="deploy-api-change",
            kind="deployment",
            intent="release govern evaluation endpoint",
            authority=authority,
        ),
        symbols=(),
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


class ProofStampTests(unittest.TestCase):
    def test_eligible_result_issues_signature_when_key_is_configured(self) -> None:
        result = evaluate_request(proof_request())
        env = {key: value for key, value in os.environ.items() if not key.startswith("MULLUSI_")}
        env["MULLUSI_PROOF_SIGNING_KEY"] = "unit-proof-key"

        with patch.dict(os.environ, env, clear=True):
            stamp = issue_proof_stamp(result)

        self.assertEqual(stamp.state, "issued")
        self.assertEqual(stamp.algorithm, PROOF_STAMP_ALGORITHM)
        self.assertEqual(stamp.verification_state, "valid")
        self.assertIsNotNone(stamp.signature)
        self.assertTrue(stamp.stamp_hash.startswith("sha256:"))

    def test_eligible_result_reports_unsigned_when_key_is_absent(self) -> None:
        result = evaluate_request(proof_request())
        env = {key: value for key, value in os.environ.items() if not key.startswith("MULLUSI_")}

        with patch.dict(os.environ, env, clear=True):
            stamp = issue_proof_stamp(result)

        self.assertEqual(stamp.state, "signing_disabled")
        self.assertEqual(stamp.verification_state, "unsigned")
        self.assertIsNone(stamp.signature)
        self.assertIsNotNone(stamp.id)

    def test_ineligible_result_does_not_issue_stamp_identity(self) -> None:
        result = evaluate_request(proof_request(authority=None))
        stamp = issue_proof_stamp(result)

        self.assertEqual(stamp.state, "not_eligible")
        self.assertEqual(stamp.verification_state, "not_eligible")
        self.assertIsNone(stamp.id)
        self.assertIsNone(stamp.signature)

    def test_signature_verification_detects_valid_and_invalid_signatures(self) -> None:
        result = evaluate_request(proof_request())
        env = {key: value for key, value in os.environ.items() if not key.startswith("MULLUSI_")}
        env["MULLUSI_PROOF_SIGNING_KEY"] = "unit-proof-key"

        with patch.dict(os.environ, env, clear=True):
            stamp = issue_proof_stamp(result)
            valid = verify_proof_stamp(
                stamp_id=stamp.id,
                evaluation_id=result.evaluation_id,
                stamp_state="issued",
                stamp_hash=stamp.stamp_hash,
                algorithm=stamp.algorithm,
                signature=stamp.signature,
            )
            invalid = verify_proof_stamp(
                stamp_id=stamp.id,
                evaluation_id=result.evaluation_id,
                stamp_state="issued",
                stamp_hash=stamp.stamp_hash,
                algorithm=stamp.algorithm,
                signature=f"{stamp.signature}0",
            )

        self.assertEqual(valid.verification_state, "valid")
        self.assertEqual(invalid.verification_state, "invalid")
        self.assertEqual(valid.id, stamp.id)
        self.assertEqual(valid.stamp_hash, stamp.stamp_hash)


if __name__ == "__main__":
    unittest.main()
