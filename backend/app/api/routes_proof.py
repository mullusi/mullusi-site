"""
Purpose: expose proof-stamp verification routes for Mullusi Govern Cloud.
Governance scope: API-key boundary, persisted stamp lookup, and signature verification response.
Dependencies: FastAPI, persistence repository, and proof verification utilities.
Invariants: verification by ID requires durable persistence because stamp ID alone is not enough evidence.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.core.security import require_api_key
from app.db.repository import (
    PersistenceUnavailable,
    ProofStampNotFound,
    fetch_proof_stamp,
)
from app.govern.proof import verify_proof_stamp

router = APIRouter(
    prefix="/v1/proof-stamps",
    tags=["proof-stamps"],
    dependencies=[Depends(require_api_key)],
)


class ProofStampVerificationResponse(BaseModel):
    id: str
    evaluation_id: str
    state: str
    stamp_hash: str
    algorithm: str | None
    signature: str | None
    verification_state: str


@router.get("/{stamp_id}", response_model=ProofStampVerificationResponse)
def verify_stamp(stamp_id: str) -> ProofStampVerificationResponse:
    """Verify a persisted proof stamp by ID."""
    try:
        record = fetch_proof_stamp(stamp_id)
    except PersistenceUnavailable as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"persistence_unavailable:{error}",
        ) from error
    except ProofStampNotFound as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"proof_stamp_not_found:{error}",
        ) from error

    verification = verify_proof_stamp(
        stamp_id=record.proof_stamp_id,
        evaluation_id=record.evaluation_id,
        stamp_state=record.stamp_state,
        stamp_hash=record.stamp_hash,
        algorithm=record.algorithm,
        signature=record.signature,
    )
    return ProofStampVerificationResponse(
        id=verification.id,
        evaluation_id=verification.evaluation_id,
        state=verification.state,
        stamp_hash=verification.stamp_hash,
        algorithm=verification.algorithm,
        signature=verification.signature,
        verification_state=verification.verification_state,
    )
