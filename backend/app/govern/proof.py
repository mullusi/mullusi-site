"""
Purpose: issue and verify Mullusi proof-stamp envelopes.
Governance scope: stamp identity, deterministic hash basis, signing policy, and signature verification.
Dependencies: Python standard library HMAC, environment configuration, and govern result models.
Invariants: stamp hashes are deterministic, signing requires an explicit key, and missing keys never produce fake signatures.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import uuid
from dataclasses import dataclass
from typing import Any

from app.govern.models import EvaluationResult

PROOF_STAMP_NAMESPACE = uuid.UUID("8d9776a9-968b-571a-a9c6-9f38187694e8")
PROOF_STAMP_ALGORITHM = "HMAC-SHA256"


@dataclass(frozen=True)
class ProofStampEnvelope:
    id: str | None
    state: str
    stamp_hash: str | None
    algorithm: str | None
    signature: str | None
    verification_state: str


@dataclass(frozen=True)
class ProofStampVerification:
    id: str
    evaluation_id: str
    state: str
    stamp_hash: str
    algorithm: str | None
    signature: str | None
    verification_state: str


def proof_stamp_id_for_evaluation(evaluation_id: str) -> str:
    """Return the deterministic proof-stamp ID for an evaluation."""
    return str(uuid.uuid5(PROOF_STAMP_NAMESPACE, f"proof-stamp:{evaluation_id}"))


def proof_stamp_hash_for_result(result: EvaluationResult) -> str:
    """Return the deterministic proof-stamp hash for an eligible result."""
    return f"sha256:{_stable_hash(_stamp_basis_for_result(result))}"


def issue_proof_stamp(result: EvaluationResult) -> ProofStampEnvelope:
    """Issue a signed proof stamp when the result is eligible and signing is configured."""
    if not result.proof_stamp_eligible:
        return ProofStampEnvelope(
            id=None,
            state="not_eligible",
            stamp_hash=None,
            algorithm=None,
            signature=None,
            verification_state="not_eligible",
        )

    stamp_id = proof_stamp_id_for_evaluation(result.evaluation_id)
    stamp_hash = proof_stamp_hash_for_result(result)
    signing_key = os.getenv("MULLUSI_PROOF_SIGNING_KEY")
    if not signing_key:
        return ProofStampEnvelope(
            id=stamp_id,
            state="signing_disabled",
            stamp_hash=stamp_hash,
            algorithm=PROOF_STAMP_ALGORITHM,
            signature=None,
            verification_state="unsigned",
        )

    signature = _sign_stamp(
        signing_key=signing_key,
        stamp_id=stamp_id,
        evaluation_id=result.evaluation_id,
        stamp_hash=stamp_hash,
    )
    return ProofStampEnvelope(
        id=stamp_id,
        state="issued",
        stamp_hash=stamp_hash,
        algorithm=PROOF_STAMP_ALGORITHM,
        signature=signature,
        verification_state="valid",
    )


def verify_proof_stamp(
    *,
    stamp_id: str,
    evaluation_id: str,
    stamp_state: str,
    stamp_hash: str,
    algorithm: str | None,
    signature: str | None,
) -> ProofStampVerification:
    """Verify a persisted proof-stamp record against the configured signing key."""
    if not signature:
        verification_state = "unsigned"
    elif algorithm != PROOF_STAMP_ALGORITHM:
        verification_state = "unsupported_algorithm"
    else:
        signing_key = os.getenv("MULLUSI_PROOF_SIGNING_KEY")
        if not signing_key:
            verification_state = "signing_key_missing"
        else:
            expected_signature = _sign_stamp(
                signing_key=signing_key,
                stamp_id=stamp_id,
                evaluation_id=evaluation_id,
                stamp_hash=stamp_hash,
            )
            verification_state = (
                "valid"
                if hmac.compare_digest(signature, expected_signature)
                else "invalid"
            )

    return ProofStampVerification(
        id=stamp_id,
        evaluation_id=evaluation_id,
        state=stamp_state,
        stamp_hash=stamp_hash,
        algorithm=algorithm,
        signature=signature,
        verification_state=verification_state,
    )


def _sign_stamp(
    *,
    signing_key: str,
    stamp_id: str,
    evaluation_id: str,
    stamp_hash: str,
) -> str:
    payload = _stable_json(
        {
            "algorithm": PROOF_STAMP_ALGORITHM,
            "evaluation_id": evaluation_id,
            "stamp_hash": stamp_hash,
            "stamp_id": stamp_id,
        }
    )
    return hmac.new(
        signing_key.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _stamp_basis_for_result(result: EvaluationResult) -> dict[str, Any]:
    return {
        "evaluation_id": result.evaluation_id,
        "trace_id": result.trace_id,
        "verdict": result.verdict.value,
        "proof_state": result.proof_state.value,
        "blocked_phase": result.blocked_phase,
    }


def _stable_hash(value: Any) -> str:
    return hashlib.sha256(_stable_json(value).encode("utf-8")).hexdigest()


def _stable_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))
