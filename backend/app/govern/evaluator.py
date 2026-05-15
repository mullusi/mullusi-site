"""
Purpose: evaluate Mullusi governance requests with deterministic causal traces.
Governance scope: constraint evaluation, proof-state assignment, verdict selection, and trace construction.
Dependencies: Python standard library and Mullusi domain models.
Invariants: evaluation is pure, deterministic, bounded, and does not perform network, filesystem, or database writes.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import asdict, is_dataclass
from enum import Enum
from typing import Any

from app.govern.models import (
    ConstraintLevel,
    ConstraintRule,
    EvaluationResult,
    GovernanceConstraint,
    GovernanceRequest,
    ProofState,
    TraceDelta,
    Verdict,
    Violation,
)

EVALUATOR_NAMESPACE = uuid.UUID("4ca9a45a-1a91-5b43-9b5f-0f2d1ed0c101")

PHASES = (
    "Distinction",
    "Constraint",
    "Ontology",
    "Topology",
    "Form",
    "Organization",
    "Module",
    "Execution",
    "Body",
    "Architecture",
    "Performance",
    "Feedback",
    "Evolution",
)


def evaluate_request(request: GovernanceRequest) -> EvaluationResult:
    """Return a deterministic governance verdict and trace for one request."""
    request_digest = _stable_digest(request)
    evaluation_id = str(uuid.uuid5(EVALUATOR_NAMESPACE, f"evaluation:{request_digest}"))
    trace_id = str(uuid.uuid5(EVALUATOR_NAMESPACE, f"trace:{request_digest}"))

    shape_violations = _validate_request_shape(request)
    rule_violations = tuple(
        violation
        for constraint in request.constraints
        for violation in _evaluate_constraint(request, constraint)
    )
    violations = shape_violations + rule_violations

    hard_failures = tuple(
        violation for violation in violations if violation.level == ConstraintLevel.HARD
    )
    soft_or_contextual_failures = tuple(
        violation for violation in violations if violation.level != ConstraintLevel.HARD
    )
    hard_unknowns = tuple(
        violation
        for violation in hard_failures
        if violation.cause.startswith("unknown_constraint_operator")
    )

    if hard_unknowns:
        verdict = Verdict.GOVERNANCE_BLOCKED
        proof_state = ProofState.UNKNOWN
        blocked_phase = "Constraint"
    elif hard_failures:
        verdict = Verdict.GOVERNANCE_BLOCKED
        proof_state = ProofState.FAIL
        blocked_phase = "Constraint"
    elif soft_or_contextual_failures:
        verdict = Verdict.SOLVED_UNVERIFIED
        proof_state = ProofState.UNKNOWN
        blocked_phase = None
    else:
        verdict = Verdict.SOLVED_VERIFIED
        proof_state = ProofState.PASS
        blocked_phase = None

    repair_actions = _repair_actions(violations)
    trace = _trace_phases(
        request=request,
        verdict=verdict,
        proof_state=proof_state,
        blocked_phase=blocked_phase,
        violations=violations,
        request_digest=request_digest,
    )

    return EvaluationResult(
        evaluation_id=evaluation_id,
        verdict=verdict,
        proof_state=proof_state,
        blocked_phase=blocked_phase,
        violations=violations,
        trace_id=trace_id,
        proof_stamp_eligible=proof_state == ProofState.PASS,
        repair_actions=repair_actions,
        trace=trace,
    )


def _validate_request_shape(request: GovernanceRequest) -> tuple[Violation, ...]:
    violations: list[Violation] = []
    required_fields = (
        ("request.project_id", request.project_id),
        ("request.system_id", request.system_id),
        ("action.id", request.action.id),
        ("action.kind", request.action.kind),
        ("action.intent", request.action.intent),
        ("context.environment", request.context.environment),
    )
    for field_path, field_value in required_fields:
        if not _is_present(field_value):
            violations.append(
                Violation(
                    constraint_id=f"shape:{field_path}",
                    level=ConstraintLevel.HARD,
                    cause=f"required_field_missing:{field_path}",
                    blocked_phase="Distinction",
                )
            )
    return tuple(violations)


def _evaluate_constraint(
    request: GovernanceRequest,
    constraint: GovernanceConstraint,
) -> tuple[Violation, ...]:
    rule = constraint.rule
    if rule.operator == "present":
        field_value = _resolve_field(request, rule.field)
        if _is_present(field_value):
            return ()
        return (
            Violation(
                constraint_id=constraint.id,
                level=constraint.level,
                cause=f"required_field_missing:{rule.field}",
                blocked_phase="Constraint",
            ),
        )

    if rule.operator in {"requires", "equals"}:
        field_value = _resolve_field(request, rule.field)
        if rule.operator == "requires" and not _is_present(field_value):
            return (
                Violation(
                    constraint_id=constraint.id,
                    level=constraint.level,
                    cause=f"required_field_missing:{rule.field}",
                    blocked_phase="Constraint",
                ),
            )
        if field_value == rule.value:
            return ()
        return (
            Violation(
                constraint_id=constraint.id,
                level=constraint.level,
                cause=f"field_value_mismatch:{rule.field}",
                blocked_phase="Constraint",
            ),
        )

    if rule.operator == "contains_invariant":
        if _target_contains_invariant(request, constraint.target, rule.value):
            return ()
        return (
            Violation(
                constraint_id=constraint.id,
                level=constraint.level,
                cause=f"target_invariant_missing:{constraint.target}",
                blocked_phase="Constraint",
            ),
        )

    return (
        Violation(
            constraint_id=constraint.id,
            level=constraint.level,
            cause=f"unknown_constraint_operator:{rule.operator}",
            blocked_phase="Constraint",
        ),
    )


def _resolve_field(request: GovernanceRequest, field_path: str | None) -> Any:
    if not field_path:
        return None

    roots: dict[str, Any] = {
        "project": {"id": request.project_id},
        "system": {"id": request.system_id},
        "action": request.action,
        "context": request.context,
    }
    parts = field_path.split(".")
    current_value: Any = roots.get(parts[0])
    for part in parts[1:]:
        if current_value is None:
            return None
        if isinstance(current_value, dict):
            current_value = current_value.get(part)
            continue
        current_value = getattr(current_value, part, None)
    return current_value


def _target_contains_invariant(
    request: GovernanceRequest,
    target_symbol_id: str,
    invariant: Any,
) -> bool:
    expected_invariant = str(invariant)
    return any(
        symbol.id == target_symbol_id and expected_invariant in symbol.invariants
        for symbol in request.symbols
    )


def _repair_actions(violations: tuple[Violation, ...]) -> tuple[str, ...]:
    if not violations:
        return ()

    actions: list[str] = []
    for violation in violations:
        if violation.cause.startswith("required_field_missing:"):
            field_path = violation.cause.split(":", 1)[1]
            actions.append(f"Provide {field_path} before re-evaluation.")
        elif violation.cause.startswith("field_value_mismatch:"):
            field_path = violation.cause.split(":", 1)[1]
            actions.append(f"Align {field_path} with the declared governance rule.")
        elif violation.cause.startswith("target_invariant_missing:"):
            target_symbol_id = violation.cause.split(":", 1)[1]
            actions.append(f"Attach the required invariant to symbol {target_symbol_id}.")
        elif violation.cause.startswith("unknown_constraint_operator:"):
            operator = violation.cause.split(":", 1)[1]
            actions.append(f"Replace unsupported constraint operator {operator}.")
        else:
            actions.append(f"Resolve violation {violation.constraint_id}.")
    return tuple(dict.fromkeys(actions))


def _trace_phases(
    request: GovernanceRequest,
    verdict: Verdict,
    proof_state: ProofState,
    blocked_phase: str | None,
    violations: tuple[Violation, ...],
    request_digest: str,
) -> tuple[TraceDelta, ...]:
    violation_summary = [
        {
            "constraint_id": violation.constraint_id,
            "level": violation.level.value,
            "cause": violation.cause,
            "blocked_phase": violation.blocked_phase,
        }
        for violation in violations
    ]
    trace: list[TraceDelta] = []
    for index, phase in enumerate(PHASES, start=1):
        trace.append(
            TraceDelta(
                phase=phase,
                delta=_phase_delta(request, phase, violation_summary, request_digest),
                judgment={
                    "phase_index": index,
                    "status": _phase_status(phase, blocked_phase, violations),
                    "proof_state": proof_state.value,
                    "verdict": verdict.value,
                },
            )
        )
    return tuple(trace)


def _phase_delta(
    request: GovernanceRequest,
    phase: str,
    violation_summary: list[dict[str, str]],
    request_digest: str,
) -> dict[str, Any]:
    if phase == "Distinction":
        return {
            "project_id": request.project_id,
            "system_id": request.system_id,
            "action_id": request.action.id,
            "symbol_count": len(request.symbols),
        }
    if phase == "Constraint":
        return {
            "constraint_count": len(request.constraints),
            "violations": violation_summary,
        }
    if phase == "Execution":
        return {
            "trace_required": request.context.trace_required,
            "termination": "bounded_phase_count",
        }
    if phase == "Evolution":
        return {
            "request_digest": request_digest,
            "lineage_policy": "append_only_trace",
        }
    return {"observed": True, "phase": phase}


def _phase_status(
    phase: str,
    blocked_phase: str | None,
    violations: tuple[Violation, ...],
) -> str:
    if blocked_phase == phase:
        return "blocked"
    if violations:
        return "observed_with_findings"
    return "pass"


def _stable_digest(request: GovernanceRequest) -> str:
    canonical_map = _canonicalize(request)
    encoded = json.dumps(
        canonical_map,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _canonicalize(value: Any) -> Any:
    if is_dataclass(value):
        return _canonicalize(asdict(value))
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, dict):
        return {
            str(key): _canonicalize(value[key])
            for key in sorted(value.keys(), key=str)
        }
    if isinstance(value, (list, tuple)):
        return [_canonicalize(item) for item in value]
    return value


def _is_present(value: Any) -> bool:
    return value is not None and str(value).strip() != ""
