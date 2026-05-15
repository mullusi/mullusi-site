"""
Purpose: define runtime settings for Mullusi Govern Cloud.
Governance scope: environment parsing, public version metadata, CORS boundary, and persistence policy.
Dependencies: Python standard library environment mapping.
Invariants: settings parsing is deterministic, side-effect free, and never exposes secret values.
"""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass


DEFAULT_ALLOWED_ORIGINS = (
    "https://mullusi.com",
    "https://www.mullusi.com",
    "https://dashboard.mullusi.com",
    "https://docs.mullusi.com",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
)
DEFAULT_ALLOWED_METHODS = ("GET", "POST", "OPTIONS")
DEFAULT_ALLOWED_HEADERS = ("Content-Type", "X-Mullusi-Key")


@dataclass(frozen=True)
class RuntimeSettings:
    service_name: str
    api_version: str
    evaluator_version: str
    allowed_origins: tuple[str, ...]
    allowed_methods: tuple[str, ...]
    allowed_headers: tuple[str, ...]
    require_persistence: bool


def _csv_tuple(value: str | None, default: tuple[str, ...]) -> tuple[str, ...]:
    """Parse a comma-separated environment value into an ordered unique tuple."""
    if value is None or value.strip() == "":
        return default

    parsed_values: list[str] = []
    for raw_item in value.split(","):
        item = raw_item.strip()
        if item and item not in parsed_values:
            parsed_values.append(item)
    return tuple(parsed_values)


def _truthy(value: str | None) -> bool:
    """Parse an explicit boolean-like environment value."""
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def runtime_settings_from_env(environ: Mapping[str, str]) -> RuntimeSettings:
    """Build immutable runtime settings from an environment mapping."""
    return RuntimeSettings(
        service_name=environ.get("MULLUSI_SERVICE_NAME", "mullusi-govern-cloud"),
        api_version=environ.get("MULLUSI_API_VERSION", "2026.05.v1"),
        evaluator_version=environ.get("MULLUSI_EVALUATOR_VERSION", "govern-evaluator.v1"),
        allowed_origins=_csv_tuple(
            environ.get("MULLUSI_ALLOWED_ORIGINS"),
            DEFAULT_ALLOWED_ORIGINS,
        ),
        allowed_methods=_csv_tuple(
            environ.get("MULLUSI_ALLOWED_METHODS"),
            DEFAULT_ALLOWED_METHODS,
        ),
        allowed_headers=_csv_tuple(
            environ.get("MULLUSI_ALLOWED_HEADERS"),
            DEFAULT_ALLOWED_HEADERS,
        ),
        require_persistence=_truthy(environ.get("MULLUSI_REQUIRE_PERSISTENCE")),
    )


def get_runtime_settings() -> RuntimeSettings:
    """Return settings from the current process environment."""
    return runtime_settings_from_env(os.environ)
