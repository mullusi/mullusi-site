"""
Purpose: enforce API-key authentication for Mullusi Govern Cloud routes.
Governance scope: request identity boundary and explicit failure behavior.
Dependencies: Python standard library and FastAPI transport exceptions.
Invariants: missing verifier configuration fails closed; key comparison is constant-time.
"""

from __future__ import annotations

import hmac
import os
from typing import Annotated

from fastapi import Header, HTTPException, status


def require_api_key(x_mullusi_key: Annotated[str | None, Header()] = None) -> str:
    """Validate the caller key against the configured local verifier."""
    expected_key = os.getenv("MULLUSI_DEV_API_KEY")
    if not expected_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="api_key_verifier_not_configured",
        )
    if not x_mullusi_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="api_key_required",
        )
    if not hmac.compare_digest(x_mullusi_key, expected_key):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="api_key_rejected",
        )
    return x_mullusi_key
