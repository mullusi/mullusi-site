"""
Purpose: define deterministic domain contracts for Mullusi Govern Cloud.
Governance scope: symbolic action proposals, constraints, traces, proof states, and verdicts.
Dependencies: Python standard library dataclasses and enums.
Invariants: domain records are immutable after construction and carry explicit contracts.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any


class ProofState(str, Enum):
    PASS = "Pass"
    FAIL = "Fail"
    UNKNOWN = "Unknown"
    BUDGET_UNKNOWN = "BudgetUnknown"


class Verdict(str, Enum):
    SOLVED_VERIFIED = "SolvedVerified"
    SOLVED_UNVERIFIED = "SolvedUnverified"
    AWAITING_EVIDENCE = "AwaitingEvidence"
    GOVERNANCE_BLOCKED = "GovernanceBlocked"


class ConstraintLevel(str, Enum):
    HARD = "hard"
    SOFT = "soft"
    CONTEXTUAL = "contextual"


@dataclass(frozen=True)
class ActionProposal:
    id: str
    kind: str
    intent: str
    authority: str | None = None


@dataclass(frozen=True)
class SymbolRecord:
    id: str
    kind: str
    boundary: str
    invariants: tuple[str, ...] = ()


@dataclass(frozen=True)
class ConstraintRule:
    operator: str
    field: str | None = None
    value: Any = None


@dataclass(frozen=True)
class GovernanceConstraint:
    id: str
    level: ConstraintLevel
    target: str
    rule: ConstraintRule


@dataclass(frozen=True)
class EvaluationContext:
    environment: str
    trace_required: bool = True


@dataclass(frozen=True)
class GovernanceRequest:
    project_id: str
    system_id: str
    action: ActionProposal
    symbols: tuple[SymbolRecord, ...]
    constraints: tuple[GovernanceConstraint, ...]
    context: EvaluationContext


@dataclass(frozen=True)
class Violation:
    constraint_id: str
    level: ConstraintLevel
    cause: str
    blocked_phase: str


@dataclass(frozen=True)
class TraceDelta:
    phase: str
    delta: dict[str, Any]
    judgment: dict[str, Any]


@dataclass(frozen=True)
class EvaluationResult:
    evaluation_id: str
    verdict: Verdict
    proof_state: ProofState
    blocked_phase: str | None
    violations: tuple[Violation, ...]
    trace_id: str
    proof_stamp_eligible: bool
    repair_actions: tuple[str, ...]
    trace: tuple[TraceDelta, ...]
