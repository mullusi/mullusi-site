"""
Purpose: expose the Govern Evaluation HTTP route.
Governance scope: request validation, API-key boundary, evaluator invocation, and response projection.
Dependencies: FastAPI, Pydantic, Mullusi govern domain modules.
Invariants: route code delegates judgment to the deterministic evaluator and does not mutate evaluator state.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.core.security import require_api_key
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
from app.govern.proof import issue_proof_stamp

router = APIRouter(
    prefix="/v1/govern",
    tags=["govern"],
    dependencies=[Depends(require_api_key)],
)


class ActionPayload(BaseModel):
    id: str = Field(..., min_length=1)
    kind: str = Field(..., min_length=1)
    intent: str = Field(..., min_length=1)
    authority: str | None = None


class SymbolPayload(BaseModel):
    id: str = Field(..., min_length=1)
    kind: str = Field(..., min_length=1)
    boundary: str = Field(..., min_length=1)
    invariants: list[str] = Field(default_factory=list)


class ConstraintRulePayload(BaseModel):
    operator: str = Field(..., min_length=1)
    field: str | None = None
    value: Any = None


class ConstraintPayload(BaseModel):
    id: str = Field(..., min_length=1)
    level: ConstraintLevel
    target: str = Field(..., min_length=1)
    rule: ConstraintRulePayload


class EvaluationContextPayload(BaseModel):
    environment: str = Field(..., min_length=1)
    trace_required: bool = True


class EvaluateRequestPayload(BaseModel):
    project_id: str = Field(..., min_length=1)
    system_id: str = Field(..., min_length=1)
    action: ActionPayload
    symbols: list[SymbolPayload] = Field(default_factory=list)
    constraints: list[ConstraintPayload] = Field(default_factory=list)
    context: EvaluationContextPayload


class ViolationResponse(BaseModel):
    constraint_id: str
    level: str
    cause: str
    blocked_phase: str


class TraceResponse(BaseModel):
    phase: str
    delta: dict[str, Any]
    judgment: dict[str, Any]


class StorageResponse(BaseModel):
    state: str
    detail: str


class ProofStampResponse(BaseModel):
    id: str | None
    state: str
    stamp_hash: str | None
    algorithm: str | None
    signature: str | None
    verification_state: str


class EvaluateResponse(BaseModel):
    evaluation_id: str
    verdict: str
    proof_state: str
    blocked_phase: str | None
    violations: list[ViolationResponse]
    trace_id: str
    proof_stamp_eligible: bool
    proof_stamp: ProofStampResponse
    repair_actions: list[str]
    storage: StorageResponse
    trace: list[TraceResponse]


def _domain_request(payload: EvaluateRequestPayload) -> GovernanceRequest:
    return GovernanceRequest(
        project_id=payload.project_id,
        system_id=payload.system_id,
        action=ActionProposal(
            id=payload.action.id,
            kind=payload.action.kind,
            intent=payload.action.intent,
            authority=payload.action.authority,
        ),
        symbols=tuple(
            SymbolRecord(
                id=symbol.id,
                kind=symbol.kind,
                boundary=symbol.boundary,
                invariants=tuple(symbol.invariants),
            )
            for symbol in payload.symbols
        ),
        constraints=tuple(
            GovernanceConstraint(
                id=constraint.id,
                level=constraint.level,
                target=constraint.target,
                rule=ConstraintRule(
                    operator=constraint.rule.operator,
                    field=constraint.rule.field,
                    value=constraint.rule.value,
                ),
            )
            for constraint in payload.constraints
        ),
        context=EvaluationContext(
            environment=payload.context.environment,
            trace_required=payload.context.trace_required,
        ),
    )


@router.post("/evaluate", response_model=EvaluateResponse)
def evaluate(payload: EvaluateRequestPayload) -> EvaluateResponse:
    """Evaluate a governed action and return the deterministic proof envelope."""
    request = _domain_request(payload)
    result = evaluate_request(request)
    stamp = issue_proof_stamp(result)
    try:
        storage_receipt = store_evaluation_if_configured(request, result, stamp)
    except PersistenceUnavailable as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"persistence_unavailable:{error}",
        ) from error

    return EvaluateResponse(
        evaluation_id=result.evaluation_id,
        verdict=result.verdict.value,
        proof_state=result.proof_state.value,
        blocked_phase=result.blocked_phase,
        violations=[
            ViolationResponse(
                constraint_id=violation.constraint_id,
                level=violation.level.value,
                cause=violation.cause,
                blocked_phase=violation.blocked_phase,
            )
            for violation in result.violations
        ],
        trace_id=result.trace_id,
        proof_stamp_eligible=result.proof_stamp_eligible,
        proof_stamp=ProofStampResponse(
            id=stamp.id,
            state=stamp.state,
            stamp_hash=stamp.stamp_hash,
            algorithm=stamp.algorithm,
            signature=stamp.signature,
            verification_state=stamp.verification_state,
        ),
        repair_actions=list(result.repair_actions),
        storage=StorageResponse(
            state=storage_receipt.state,
            detail=storage_receipt.detail,
        ),
        trace=[
            TraceResponse(
                phase=trace_delta.phase,
                delta=trace_delta.delta,
                judgment=trace_delta.judgment,
            )
            for trace_delta in result.trace
        ],
    )
