"""
Purpose: serialize governance requests and results into PostgreSQL-ready records.
Governance scope: stable request hash, response envelope, trace rows, violation rows, and proof-stamp eligibility rows.
Dependencies: Python standard library and Mullusi govern domain models.
Invariants: serialization is deterministic, JSON-compatible, and performs no database or filesystem writes.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import asdict, is_dataclass
from enum import Enum
from typing import Any

from app.govern.proof import (
    PROOF_STAMP_ALGORITHM,
    ProofStampEnvelope,
    proof_stamp_hash_for_result,
    proof_stamp_id_for_evaluation,
)
from app.govern.models import EvaluationResult, GovernanceRequest

PERSISTENCE_NAMESPACE = uuid.UUID("fb58bca6-dc37-53f7-8403-104fd0cd6bb5")


def canonicalize(value: Any) -> Any:
    """Return a deterministic JSON-compatible representation."""
    if is_dataclass(value):
        return canonicalize(asdict(value))
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, dict):
        return {
            str(key): canonicalize(value[key])
            for key in sorted(value.keys(), key=str)
        }
    if isinstance(value, (list, tuple)):
        return [canonicalize(item) for item in value]
    return value


def stable_json(value: Any) -> str:
    """Encode a canonical value with stable separators and key order."""
    return json.dumps(canonicalize(value), sort_keys=True, separators=(",", ":"))


def stable_hash(value: Any) -> str:
    """Return the SHA-256 hash of a canonical value."""
    return hashlib.sha256(stable_json(value).encode("utf-8")).hexdigest()


def request_body(request: GovernanceRequest) -> dict[str, Any]:
    """Serialize a governance request for durable storage."""
    return canonicalize(request)


def response_body(result: EvaluationResult) -> dict[str, Any]:
    """Serialize an evaluation result for durable storage."""
    return {
        "evaluation_id": result.evaluation_id,
        "verdict": result.verdict.value,
        "proof_state": result.proof_state.value,
        "blocked_phase": result.blocked_phase,
        "violations": [canonicalize(violation) for violation in result.violations],
        "trace_id": result.trace_id,
        "proof_stamp_eligible": result.proof_stamp_eligible,
        "repair_actions": list(result.repair_actions),
        "trace": [canonicalize(trace_delta) for trace_delta in result.trace],
    }


def evaluation_row(request: GovernanceRequest, result: EvaluationResult) -> dict[str, Any]:
    """Build the govern_evaluations row payload."""
    return {
        "evaluation_id": result.evaluation_id,
        "trace_id": result.trace_id,
        "project_id": request.project_id,
        "system_id": request.system_id,
        "verdict": result.verdict.value,
        "proof_state": result.proof_state.value,
        "blocked_phase": result.blocked_phase,
        "proof_stamp_eligible": result.proof_stamp_eligible,
        "repair_actions": list(result.repair_actions),
        "request_hash": stable_hash(request),
        "request_body": request_body(request),
        "response_body": response_body(result),
    }


def violation_rows(result: EvaluationResult) -> list[dict[str, Any]]:
    """Build govern_violations row payloads."""
    return [
        {
            "violation_id": str(
                uuid.uuid5(
                    PERSISTENCE_NAMESPACE,
                    f"violation:{result.evaluation_id}:{ordinal}",
                )
            ),
            "evaluation_id": result.evaluation_id,
            "ordinal": ordinal,
            "constraint_id": violation.constraint_id,
            "level": violation.level.value,
            "cause": violation.cause,
            "blocked_phase": violation.blocked_phase,
        }
        for ordinal, violation in enumerate(result.violations, start=1)
    ]


def trace_delta_rows(result: EvaluationResult) -> list[dict[str, Any]]:
    """Build govern_trace_deltas row payloads."""
    return [
        {
            "trace_delta_id": str(
                uuid.uuid5(
                    PERSISTENCE_NAMESPACE,
                    f"trace-delta:{result.trace_id}:{phase_index}",
                )
            ),
            "evaluation_id": result.evaluation_id,
            "trace_id": result.trace_id,
            "phase_index": phase_index,
            "phase": trace_delta.phase,
            "delta": canonicalize(trace_delta.delta),
            "judgment": canonicalize(trace_delta.judgment),
        }
        for phase_index, trace_delta in enumerate(result.trace, start=1)
    ]


def proof_stamp_row(
    result: EvaluationResult,
    stamp: ProofStampEnvelope | None = None,
) -> dict[str, Any] | None:
    """Build a proof_stamps row when the evaluation is eligible for a stamp."""
    if not result.proof_stamp_eligible:
        return None
    stamp_hash = stamp.stamp_hash if stamp and stamp.stamp_hash else proof_stamp_hash_for_result(result)
    signature = stamp.signature if stamp else None
    stamp_state = "issued" if signature else "eligible"
    return {
        "proof_stamp_id": proof_stamp_id_for_evaluation(result.evaluation_id),
        "evaluation_id": result.evaluation_id,
        "stamp_state": stamp_state,
        "stamp_hash": stamp_hash,
        "algorithm": PROOF_STAMP_ALGORITHM,
        "signature": signature,
    }
