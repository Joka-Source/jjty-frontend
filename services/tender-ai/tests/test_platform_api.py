from __future__ import annotations

import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from tender_ai.api import create_app
from tender_ai.platform.engine import PlatformEngine
from tender_ai.platform.dynamodb_store import DynamoDBPlatformStore
from tender_ai.platform.packs import ServicePackRegistry
from tender_ai.platform.store import MemoryPlatformStore


class StaticParser:
    def parse(self, _name: str, data: bytes):
        return [{"page": 1, "text": data.decode(errors="ignore")}]


class PlatformAPITests(unittest.TestCase):
    def setUp(self) -> None:
        store = MemoryPlatformStore()
        engine = PlatformEngine(ServicePackRegistry.default(), store)
        self.client = TestClient(
            create_app(
                parser=StaticParser(),
                reasoner=lambda _documents: {"summary": "", "findings": []},
                platform_engine=engine,
                platform_token="platform-secret-test-value",
                human_approval_token="human-secret-test-value",
            )
        )
        self.human_headers = {
            "Authorization": "Bearer platform-secret-test-value",
            "X-JJTY-Actor": "founder",
            "X-JJTY-Actor-Kind": "human",
        }

    def post(self, path: str, body: dict, headers: dict | None = None):
        return self.client.post(path, json=body, headers=headers or self.human_headers)

    def create_case(self):
        response = self.client.post(
            "/v1/platform/cases",
            json={"pack_id": "tender", "pack_version": "1.0.0"},
            headers={**self.human_headers, "Idempotency-Key": "kothali-case-1"},
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def test_platform_endpoints_require_valid_bearer_and_actor(self) -> None:
        self.assertEqual(self.client.get("/v1/platform/service-packs").status_code, 401)
        self.assertEqual(
            self.client.get(
                "/v1/platform/service-packs",
                headers={"Authorization": "Bearer wrong"},
            ).status_code,
            401,
        )
        response = self.client.get(
            "/v1/platform/service-packs",
            headers={"Authorization": "Bearer platform-secret-test-value"},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("X-JJTY-Actor", response.json()["detail"])

        response = self.client.get(
            "/v1/platform/service-packs",
            headers=self.human_headers,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual([pack["id"] for pack in response.json()], ["tender", "visa"])

    def test_cors_preflight_allows_platform_contract_headers(self) -> None:
        response = self.client.options(
            "/v1/platform/cases",
            headers={
                "Origin": "http://127.0.0.1:8793",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": (
                    "authorization,idempotency-key,x-jjty-actor,x-jjty-actor-kind,"
                    "x-jjty-human-approval,content-type"
                ),
            },
        )

        self.assertEqual(response.status_code, 200, response.text)
        allowed = response.headers["access-control-allow-headers"].lower()
        for header in (
            "authorization",
            "idempotency-key",
            "x-jjty-actor",
            "x-jjty-actor-kind",
            "x-jjty-human-approval",
        ):
            self.assertIn(header, allowed)

    def test_case_creation_is_idempotent_and_stale_updates_conflict(self) -> None:
        first = self.create_case()
        repeated = self.create_case()
        self.assertEqual(first["id"], repeated["id"])

        completed = self.post(
            f"/v1/platform/cases/{first['id']}/steps/intake/complete",
            {
                "expected_revision": first["revision"],
                "data": {
                    "project_name": "Kothali concrete road and gutter",
                    "department": "PWD",
                    "district": "Jalgaon",
                },
            },
        )
        self.assertEqual(completed.status_code, 200, completed.text)
        stale = self.post(
            f"/v1/platform/cases/{first['id']}/steps/notice-review/complete",
            {"expected_revision": first["revision"], "data": {}},
        )
        self.assertEqual(stale.status_code, 409)

    def test_artifact_evidence_capability_and_human_gate_journey(self) -> None:
        case = self.create_case()
        digest = "a" * 64
        response = self.post(
            f"/v1/platform/cases/{case['id']}/artifacts",
            {
                "expected_revision": case["revision"],
                "name": "Tendernotice_1.pdf",
                "media_type": "application/pdf",
                "size": 818,
                "sha256": digest,
                "classification": "firm-confidential",
                "storage_ref": "s3://jjty-artifacts/kothali/Tendernotice_1.pdf",
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        case = response.json()
        response = self.post(
            f"/v1/platform/cases/{case['id']}/evidence",
            {
                "expected_revision": case["revision"],
                "artifact_sha256": digest,
                "page": 1,
                "quote": "Earnest money deposit: INR 50,000.",
                "label": "Earnest money deposit",
                "value": "INR 50,000",
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        case = response.json()

        step_data = [
            ("intake", {"project_name": "Kothali", "department": "PWD", "district": "Jalgaon"}),
            ("notice-review", {}),
            ("eligibility", {"eligibility_reviewed": ["PWD registration"]}),
            ("documents", {}),
            ("pricing", {"reviewed_bid_amount": "1250000"}),
            ("portal-upload", {}),
        ]
        for index, (step_id, data) in enumerate(step_data):
            if step_id == "notice-review":
                requested = self.client.post(
                    f"/v1/platform/cases/{case['id']}/capability-runs",
                    json={
                        "expected_revision": case["revision"],
                        "name": "document.review",
                        "parameters": {"artifact_sha256": digest},
                    },
                    headers={**self.human_headers, "Idempotency-Key": "review-kothali-1"},
                )
                self.assertEqual(requested.status_code, 201, requested.text)
                case = requested.json()
            completed = self.post(
                f"/v1/platform/cases/{case['id']}/steps/{step_id}/complete",
                {"expected_revision": case["revision"], "data": data},
            )
            self.assertEqual(completed.status_code, 200, f"{step_id}: {completed.text}")
            case = completed.json()

        self.assertEqual(case["current_step_id"], "dsc-signing")
        ai_headers = {
            "Authorization": "Bearer platform-secret-test-value",
            "X-JJTY-Actor": "qwen",
            "X-JJTY-Actor-Kind": "ai",
            "X-JJTY-Human-Approval": "human-secret-test-value",
        }
        refused = self.post(
            f"/v1/platform/cases/{case['id']}/human-gates/dsc-signing/confirm",
            {"expected_revision": case["revision"], "acknowledgement": True},
            headers=ai_headers,
        )
        self.assertEqual(refused.status_code, 409)

        confirmed = self.post(
            f"/v1/platform/cases/{case['id']}/human-gates/dsc-signing/confirm",
            {"expected_revision": case["revision"], "acknowledgement": True},
            headers={
                **self.human_headers,
                "X-JJTY-Human-Approval": "human-secret-test-value",
            },
        )
        self.assertEqual(confirmed.status_code, 200, confirmed.text)
        self.assertEqual(confirmed.json()["current_step_id"], "payment")

        events = self.client.get(
            f"/v1/platform/cases/{case['id']}/events",
            headers=self.human_headers,
        )
        self.assertEqual(events.status_code, 200)
        payload = events.json()
        self.assertEqual([event["sequence"] for event in payload], list(range(1, len(payload) + 1)))
        self.assertIn("human_gate.confirmed", [event["type"] for event in payload])

    def test_environment_mounts_the_dynamodb_platform(self) -> None:
        with (
            patch.dict(
                "os.environ",
                {
                    "SERVICE_PLATFORM_DYNAMODB_TABLE": "jjty-service-platform",
                    "SERVICE_PLATFORM_API_TOKEN": "platform-secret-test-value",
                    "SERVICE_PLATFORM_HUMAN_APPROVAL_TOKEN": "human-secret-test-value",
                },
                clear=False,
            ),
            patch.object(
                DynamoDBPlatformStore,
                "from_environment",
                return_value=MemoryPlatformStore(),
            ) as factory,
        ):
            client = TestClient(
                create_app(
                    parser=StaticParser(),
                    reasoner=lambda _documents: {"summary": "", "findings": []},
                )
            )

        response = client.get("/v1/platform/service-packs", headers=self.human_headers)
        self.assertEqual(response.status_code, 200, response.text)
        factory.assert_called_once_with("jjty-service-platform")


if __name__ == "__main__":
    unittest.main()
