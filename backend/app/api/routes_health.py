"""
Purpose: expose health and version routes for Mullusi Govern Cloud.
Governance scope: read-only runtime status.
Dependencies: FastAPI.
Invariants: health routes do not reveal secrets or mutable state.
"""

from fastapi import APIRouter

from app.core.settings import get_runtime_settings

router = APIRouter(tags=["health"])


@router.get("/v1/health")
def health() -> dict[str, str]:
    """Return a deterministic service health envelope."""
    settings = get_runtime_settings()
    return {"status": "ok", "service": settings.service_name}


@router.get("/v1/version")
def version() -> dict[str, str]:
    """Return the public API and evaluator version identifiers."""
    settings = get_runtime_settings()
    return {"api": settings.api_version, "evaluator": settings.evaluator_version}
