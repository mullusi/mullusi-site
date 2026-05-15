"""
Purpose: create the FastAPI application for Mullusi Govern Cloud.
Governance scope: service assembly, route registration, and public runtime metadata.
Dependencies: FastAPI route modules.
Invariants: importing this module must not read secrets or mutate evaluator state.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes_govern import router as govern_router
from app.api.routes_health import router as health_router
from app.api.routes_proof import router as proof_router
from app.core.settings import RuntimeSettings, get_runtime_settings


def create_app(settings: RuntimeSettings | None = None) -> FastAPI:
    """Build the FastAPI application with explicit route ownership."""
    runtime_settings = settings or get_runtime_settings()
    service = FastAPI(
        title="Mullusi Govern Cloud",
        version=runtime_settings.api_version,
        description="Hosted symbolic governance service for deterministic evaluation and trace output.",
    )
    service.add_middleware(
        CORSMiddleware,
        allow_origins=list(runtime_settings.allowed_origins),
        allow_credentials=False,
        allow_methods=list(runtime_settings.allowed_methods),
        allow_headers=list(runtime_settings.allowed_headers),
        max_age=600,
    )
    service.include_router(health_router)
    service.include_router(govern_router)
    service.include_router(proof_router)
    return service


app = create_app()
