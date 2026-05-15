"""
Purpose: verify FastAPI route behavior for govern evaluation and persistence status.
Governance scope: HTTP contract, key boundary, disabled storage visibility, and fail-closed required persistence.
Dependencies: FastAPI TestClient, environment patching, and Mullusi backend app factory.
Invariants: tests require no PostgreSQL server and each test carries at least three assertions.
"""

import os
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.db.repository import ProofStampRecord
from app.main import create_app


def valid_payload() -> dict:
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


class GovernRouteTests(unittest.TestCase):
    def test_evaluate_route_reports_disabled_storage_without_database_url(self) -> None:
        env = {key: value for key, value in os.environ.items() if not key.startswith("MULLUSI_")}
        env["MULLUSI_DEV_API_KEY"] = "route-test-key"

        with patch.dict(os.environ, env, clear=True):
            client = TestClient(create_app())
            response = client.post(
                "/v1/govern/evaluate",
                json=valid_payload(),
                headers={"X-Mullusi-Key": "route-test-key"},
            )

        body = response.json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(body["verdict"], "SolvedVerified")
        self.assertEqual(body["storage"]["state"], "disabled")
        self.assertEqual(body["proof_stamp"]["state"], "signing_disabled")
        self.assertEqual(len(body["trace"]), 13)

    def test_required_persistence_blocks_route_without_database_url(self) -> None:
        env = {key: value for key, value in os.environ.items() if not key.startswith("MULLUSI_")}
        env["MULLUSI_DEV_API_KEY"] = "route-test-key"
        env["MULLUSI_REQUIRE_PERSISTENCE"] = "true"

        with patch.dict(os.environ, env, clear=True):
            client = TestClient(create_app())
            response = client.post(
                "/v1/govern/evaluate",
                json=valid_payload(),
                headers={"X-Mullusi-Key": "route-test-key"},
            )

        body = response.json()
        self.assertEqual(response.status_code, 503)
        self.assertIn("persistence_unavailable", body["detail"])
        self.assertIn("database_url_missing", body["detail"])
        self.assertNotIn("trace", body)

    def test_verify_stamp_route_reports_persistence_requirement(self) -> None:
        env = {key: value for key, value in os.environ.items() if not key.startswith("MULLUSI_")}
        env["MULLUSI_DEV_API_KEY"] = "route-test-key"

        with patch.dict(os.environ, env, clear=True):
            client = TestClient(create_app())
            response = client.get(
                "/v1/proof-stamps/00000000-0000-0000-0000-000000000000",
                headers={"X-Mullusi-Key": "route-test-key"},
            )

        body = response.json()
        self.assertEqual(response.status_code, 503)
        self.assertIn("persistence_unavailable", body["detail"])
        self.assertIn("database_url_missing", body["detail"])

    def test_verify_stamp_route_returns_signature_state_from_persisted_record(self) -> None:
        env = {key: value for key, value in os.environ.items() if not key.startswith("MULLUSI_")}
        env["MULLUSI_DEV_API_KEY"] = "route-test-key"
        env["MULLUSI_PROOF_SIGNING_KEY"] = "route-proof-key"
        stamp_id = "11111111-1111-5111-8111-111111111111"
        evaluation_id = "22222222-2222-5222-8222-222222222222"
        stamp_hash = "sha256:abc123"

        with patch.dict(os.environ, env, clear=True):
            from app.govern.proof import _sign_stamp

            signature = _sign_stamp(
                signing_key="route-proof-key",
                stamp_id=stamp_id,
                evaluation_id=evaluation_id,
                stamp_hash=stamp_hash,
            )
            record = ProofStampRecord(
                proof_stamp_id=stamp_id,
                evaluation_id=evaluation_id,
                stamp_state="issued",
                stamp_hash=stamp_hash,
                algorithm="HMAC-SHA256",
                signature=signature,
            )
            with patch("app.api.routes_proof.fetch_proof_stamp", return_value=record):
                client = TestClient(create_app())
                response = client.get(
                    f"/v1/proof-stamps/{stamp_id}",
                    headers={"X-Mullusi-Key": "route-test-key"},
                )

        body = response.json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(body["id"], stamp_id)
        self.assertEqual(body["state"], "issued")
        self.assertEqual(body["verification_state"], "valid")
        self.assertEqual(body["signature"], signature)

    def test_cors_preflight_allows_configured_dashboard_origin(self) -> None:
        env = {key: value for key, value in os.environ.items() if not key.startswith("MULLUSI_")}
        env["MULLUSI_ALLOWED_ORIGINS"] = "https://dashboard.mullusi.com"
        env["MULLUSI_ALLOWED_METHODS"] = "GET,POST,OPTIONS"
        env["MULLUSI_ALLOWED_HEADERS"] = "Content-Type,X-Mullusi-Key"

        with patch.dict(os.environ, env, clear=True):
            client = TestClient(create_app())
            response = client.options(
                "/v1/govern/evaluate",
                headers={
                    "Origin": "https://dashboard.mullusi.com",
                    "Access-Control-Request-Method": "POST",
                    "Access-Control-Request-Headers": "X-Mullusi-Key, Content-Type",
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["access-control-allow-origin"], "https://dashboard.mullusi.com")
        self.assertIn("POST", response.headers["access-control-allow-methods"])
        self.assertIn("x-mullusi-key", response.headers["access-control-allow-headers"].lower())


if __name__ == "__main__":
    unittest.main()
