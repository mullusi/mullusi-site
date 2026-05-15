"""
Purpose: exercise Govern Cloud evaluation persistence and proof-stamp verification end to end.
Governance scope: API-key boundary, persisted evaluation write, signed proof stamp, and persisted verification readback.
Dependencies: running backend service, PostgreSQL schema, MULLUSI_DEV_API_KEY, and MULLUSI_API_BASE_URL.
Invariants: probe fails nonzero on missing stamp, unsigned stamp, failed storage, or invalid verification.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from typing import Any


def govern_payload() -> dict[str, Any]:
    return {
        "project_id": "project-alpha",
        "system_id": "govern-cloud-v1",
        "action": {
            "id": "deploy-api-change",
            "kind": "deployment",
            "intent": "release govern evaluation endpoint",
            "authority": "project-admin",
        },
        "symbols": [
            {
                "id": "state_write",
                "kind": "operation",
                "boundary": "api.mullusi.com",
                "invariants": ["authority_required", "trace_required"],
            }
        ],
        "constraints": [
            {
                "id": "authority-required",
                "level": "hard",
                "target": "state_write",
                "rule": {
                    "operator": "requires",
                    "field": "action.authority",
                    "value": "project-admin",
                },
            }
        ],
        "context": {"environment": "production", "trace_required": True},
    }


def request_json(method: str, url: str, api_key: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
    encoded_body = None if body is None else json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=encoded_body,
        method=method,
        headers={
            "Content-Type": "application/json",
            "X-Mullusi-Key": api_key,
        },
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> int:
    base_url = os.getenv("MULLUSI_API_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
    api_key = os.getenv("MULLUSI_DEV_API_KEY", "")
    if not api_key:
        print("probe_failed:MULLUSI_DEV_API_KEY_missing", file=sys.stderr)
        return 1

    try:
        evaluation = request_json(
            "POST",
            f"{base_url}/v1/govern/evaluate",
            api_key,
            govern_payload(),
        )
        stamp = evaluation["proof_stamp"]
        verification = request_json(
            "GET",
            f"{base_url}/v1/proof-stamps/{stamp['id']}",
            api_key,
        )
    except (KeyError, urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as error:
        print(f"probe_failed:{error}", file=sys.stderr)
        return 1

    checks = {
        "verdict": evaluation.get("verdict") == "SolvedVerified",
        "storage": evaluation.get("storage", {}).get("state") == "stored",
        "stamp": stamp.get("state") == "issued",
        "signature": bool(stamp.get("signature")),
        "verification": verification.get("verification_state") == "valid",
    }
    failed = [name for name, passed in checks.items() if not passed]
    if failed:
        print(f"probe_failed:{','.join(failed)}", file=sys.stderr)
        return 1

    print(
        "probe_passed "
        f"evaluation_id={evaluation['evaluation_id']} "
        f"stamp_id={stamp['id']} "
        f"storage={evaluation['storage']['state']} "
        f"verification={verification['verification_state']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
