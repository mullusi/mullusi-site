"""
Purpose: verify release readiness for Mullusi Govern Cloud before routing api.mullusi.com traffic.
Governance scope: production environment variables, CORS boundary, persistence requirement, and database schema witness.
Dependencies: scripts.check_persistence and app.core.settings.
Invariants: checks are read-only, deterministic, and never print secret values.
"""

from __future__ import annotations

import os
import sys
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from urllib.parse import urlparse

from app.core.settings import runtime_settings_from_env
from scripts.check_persistence import PersistenceCheck, check_persistence


LOCAL_HOSTS = {"127.0.0.1", "::1", "localhost", "postgres"}
PLACEHOLDER_VALUES = {
    "local-dev-key",
    "local-proof-key",
    "mullusi_local_dev",
}
PUBLIC_ORIGIN_HOSTS = {
    "mullusi.com",
    "www.mullusi.com",
    "dashboard.mullusi.com",
    "docs.mullusi.com",
    "learn.mullusi.com",
}
REQUIRED_ENVIRONMENT_KEYS = (
    "MULLUSI_DEV_API_KEY",
    "MULLUSI_PROOF_SIGNING_KEY",
    "MULLUSI_DATABASE_URL",
    "MULLUSI_REQUIRE_PERSISTENCE",
    "MULLUSI_ALLOWED_ORIGINS",
)


@dataclass(frozen=True)
class ReleaseFinding:
    name: str
    state: str
    detail: str


@dataclass(frozen=True)
class ReleasePreflight:
    state: str
    findings: tuple[ReleaseFinding, ...]


def _is_placeholder(value: str) -> bool:
    """Return whether a configured value is a known local placeholder."""
    return value.strip() in PLACEHOLDER_VALUES


def _secret_finding(environ: Mapping[str, str], key: str, minimum_length: int) -> ReleaseFinding:
    """Validate presence and shape of a secret-like environment variable."""
    value = environ.get(key, "").strip()
    if not value:
        return ReleaseFinding(key, "fail", "missing")
    if _is_placeholder(value):
        return ReleaseFinding(key, "fail", "placeholder_value")
    if len(value) < minimum_length:
        return ReleaseFinding(key, "fail", f"too_short_min_{minimum_length}")
    return ReleaseFinding(key, "pass", "configured")


def _database_url_finding(environ: Mapping[str, str]) -> ReleaseFinding:
    """Validate production database URL shape without exposing credentials."""
    database_url = environ.get("MULLUSI_DATABASE_URL", "").strip()
    if not database_url:
        return ReleaseFinding("database_url", "fail", "missing")

    parsed = urlparse(database_url)
    if parsed.scheme not in {"postgresql", "postgres"}:
        return ReleaseFinding("database_url", "fail", "invalid_scheme")
    if not parsed.hostname:
        return ReleaseFinding("database_url", "fail", "missing_host")
    if parsed.hostname.lower() in LOCAL_HOSTS:
        return ReleaseFinding("database_url", "fail", "local_host_forbidden")
    if any(value in database_url for value in PLACEHOLDER_VALUES):
        return ReleaseFinding("database_url", "fail", "placeholder_value")
    return ReleaseFinding("database_url", "pass", "remote_postgresql_configured")


def _persistence_policy_finding(environ: Mapping[str, str]) -> ReleaseFinding:
    """Validate that production storage is fail-closed."""
    settings = runtime_settings_from_env(environ)
    if not settings.require_persistence:
        return ReleaseFinding("persistence_policy", "fail", "MULLUSI_REQUIRE_PERSISTENCE_not_true")
    return ReleaseFinding("persistence_policy", "pass", "required")


def _allowed_origins_finding(environ: Mapping[str, str]) -> ReleaseFinding:
    """Validate public CORS origins for production."""
    settings = runtime_settings_from_env(environ)
    if not settings.allowed_origins:
        return ReleaseFinding("allowed_origins", "fail", "missing")

    invalid_origins: list[str] = []
    for origin in settings.allowed_origins:
        parsed = urlparse(origin)
        hostname = (parsed.hostname or "").lower()
        if parsed.scheme != "https":
            invalid_origins.append(origin)
            continue
        if hostname not in PUBLIC_ORIGIN_HOSTS:
            invalid_origins.append(origin)

    if invalid_origins:
        return ReleaseFinding("allowed_origins", "fail", f"invalid_count:{len(invalid_origins)}")
    return ReleaseFinding("allowed_origins", "pass", f"count:{len(settings.allowed_origins)}")


def _database_schema_finding(persistence_checker: Callable[[], PersistenceCheck]) -> ReleaseFinding:
    """Validate live database schema readiness through the shared persistence check."""
    check = persistence_checker()
    if check.state != "ready":
        return ReleaseFinding("database_schema", "fail", check.detail)
    return ReleaseFinding("database_schema", "pass", check.detail)


def evaluate_release_preflight(
    environ: Mapping[str, str],
    persistence_checker: Callable[[], PersistenceCheck],
) -> ReleasePreflight:
    """Evaluate release readiness from explicit environment and persistence witness inputs."""
    missing_keys = [key for key in REQUIRED_ENVIRONMENT_KEYS if not environ.get(key, "").strip()]
    findings = [
        ReleaseFinding("required_environment", "pass" if not missing_keys else "fail", ",".join(missing_keys) or "complete"),
        _secret_finding(environ, "MULLUSI_DEV_API_KEY", 32),
        _secret_finding(environ, "MULLUSI_PROOF_SIGNING_KEY", 32),
        _database_url_finding(environ),
        _persistence_policy_finding(environ),
        _allowed_origins_finding(environ),
        _database_schema_finding(persistence_checker),
    ]
    state = "ready" if all(finding.state == "pass" for finding in findings) else "blocked"
    return ReleasePreflight(state=state, findings=tuple(findings))


def main() -> int:
    preflight = evaluate_release_preflight(os.environ, check_persistence)
    print(f"release_preflight state={preflight.state}")
    for finding in preflight.findings:
        print(f"finding name={finding.name} state={finding.state} detail={finding.detail}")
    return 0 if preflight.state == "ready" else 1


if __name__ == "__main__":
    raise SystemExit(main())
