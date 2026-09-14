from __future__ import annotations

import hashlib
import asyncio
import os
import threading
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
import httpx

from tender_ai.api import LazyDoclingParser, create_app, parser_only_reasoner


class FakeParser:
    def parse(self, _name: str, data: bytes) -> list[dict[str, object]]:
        return [{"page": 1, "text": data.decode("utf-8")}]


class ProbeParser(FakeParser):
    def __init__(self) -> None:
        self.ready_calls = 0

    def ready(self) -> None:
        self.ready_calls += 1


class BrokenParser(FakeParser):
    def parse(self, _name: str, _data: bytes) -> list[dict[str, object]]:
        raise RuntimeError("private parser internals")


class ThreadProbeParser(FakeParser):
    def __init__(self) -> None:
        self.parse_thread = None

    def parse(self, _name: str, data: bytes) -> list[dict[str, object]]:
        self.parse_thread = threading.get_ident()
        return super().parse(_name, data)


def grounded_reasoner(documents: list[dict[str, object]]) -> dict[str, object]:
    document = documents[0]
    return {
        "summary": "One deadline needs human review.",
        "findings": [
            {
                "kind": "deadline",
                "title": "Submission deadline",
                "detail": "Confirm the portal deadline before submitting.",
                "evidence": {
                    "document_sha256": document["sha256"],
                    "page": 1,
                    "quote": "18 September 2026 at 5:00 PM",
                },
            }
        ],
    }


class TenderAnalysisApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(
            create_app(parser=FakeParser(), reasoner=grounded_reasoner)
        )

    def test_health_reports_advisory_service(self) -> None:
        response = self.client.get("/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "status": "ready",
                "parser": "FakeParser",
                "reasoner": "grounded_reasoner",
                "authority": "advisory_only",
            },
        )

    def test_default_adapters_expose_stable_provenance_versions(self) -> None:
        parser = LazyDoclingParser()

        self.assertEqual(parser.adapter_id, "docling")
        self.assertRegex(parser.adapter_version, r"^\d+\.\d+")
        self.assertEqual(parser_only_reasoner.adapter_id, "parser-only")
        self.assertEqual(parser_only_reasoner.adapter_version, "1.0.0")

    def test_health_initializes_the_local_parser_before_reporting_ready(self) -> None:
        parser = ProbeParser()
        client = TestClient(create_app(parser=parser, reasoner=grounded_reasoner))

        response = client.get("/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(parser.ready_calls, 1)

    def test_analysis_returns_exact_source_receipt_and_grounded_finding(self) -> None:
        source = b"Tender closes 18 September 2026 at 5:00 PM."
        response = self.client.post(
            "/v1/tenders/analyze",
            files=[("files", ("Tendernotice_1.pdf", source, "application/pdf"))],
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["documents"][0]["sha256"], hashlib.sha256(source).hexdigest())
        self.assertEqual(body["findings"][0]["evidence"]["quote"], "18 September 2026 at 5:00 PM")
        self.assertEqual(body["authority"], "advisory_only")
        self.assertFalse(body["submission_allowed"])

    def test_generic_document_run_endpoint_returns_recipe_and_graph(self) -> None:
        source = b"Tender closes 18 September 2026 at 5:00 PM."

        response = self.client.post(
            "/v1/documents/runs",
            data={"recipe_id": "tender-review-v1"},
            files=[("files", ("Tendernotice_1.pdf", source, "application/pdf"))],
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["schema"], "jjty-document-run-v1")
        self.assertEqual(body["recipe"]["id"], "tender-review-v1")
        self.assertEqual(body["documents"][0]["nodes"][0]["selector"]["page"], 1)
        self.assertFalse(body["external_action_allowed"])

    def test_lists_trusted_document_recipes(self) -> None:
        response = self.client.get("/v1/documents/recipes")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [recipe["id"] for recipe in response.json()["recipes"]],
            ["document-review-v1", "tender-review-v1"],
        )

    def test_configured_document_token_protects_analysis_and_run_routes(self) -> None:
        client = TestClient(
            create_app(
                parser=FakeParser(),
                reasoner=grounded_reasoner,
                document_token="protected-document-token",
            )
        )
        source = b"Tender closes 18 September 2026 at 5:00 PM."

        for path, data in (
            ("/v1/tenders/analyze", None),
            ("/v1/documents/runs", {"recipe_id": "tender-review-v1"}),
        ):
            with self.subTest(path=path):
                denied = client.post(
                    path,
                    data=data,
                    files=[("files", ("notice.pdf", source, "application/pdf"))],
                )
                allowed = client.post(
                    path,
                    data=data,
                    files=[("files", ("notice.pdf", source, "application/pdf"))],
                    headers={"Authorization": "Bearer protected-document-token"},
                )
                self.assertEqual(denied.status_code, 401)
                self.assertEqual(allowed.status_code, 200)

        recipes_denied = client.get("/v1/documents/recipes")
        recipes_allowed = client.get(
            "/v1/documents/recipes",
            headers={"Authorization": "Bearer protected-document-token"},
        )
        self.assertEqual(recipes_denied.status_code, 401)
        self.assertEqual(recipes_allowed.status_code, 200)

    def test_production_refuses_to_start_without_document_token(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "document API token"):
            create_app(
                parser=FakeParser(),
                reasoner=grounded_reasoner,
                environment="production",
                document_token="",
            )

    def test_generic_run_moves_parser_and_reasoner_work_off_event_loop(self) -> None:
        parser = ThreadProbeParser()
        application = create_app(parser=parser, reasoner=grounded_reasoner)
        event_loop_thread = threading.get_ident()

        async def exercise() -> httpx.Response:
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=application),
                base_url="http://testserver",
            ) as client:
                return await client.post(
                    "/v1/documents/runs",
                    data={"recipe_id": "tender-review-v1"},
                    files={
                        "files": (
                            "notice.pdf",
                            b"Tender closes 18 September 2026 at 5:00 PM.",
                            "application/pdf",
                        )
                    },
                )

        response = asyncio.run(exercise())

        self.assertEqual(response.status_code, 200)
        self.assertNotEqual(parser.parse_thread, event_loop_thread)

    def test_compatibility_analysis_moves_work_off_event_loop(self) -> None:
        parser = ThreadProbeParser()
        application = create_app(parser=parser, reasoner=grounded_reasoner)
        event_loop_thread = threading.get_ident()

        async def exercise() -> httpx.Response:
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=application),
                base_url="http://testserver",
            ) as client:
                return await client.post(
                    "/v1/tenders/analyze",
                    files={
                        "files": (
                            "notice.pdf",
                            b"Tender closes 18 September 2026 at 5:00 PM.",
                            "application/pdf",
                        )
                    },
                )

        response = asyncio.run(exercise())

        self.assertEqual(response.status_code, 200)
        self.assertNotEqual(parser.parse_thread, event_loop_thread)

    def test_empty_and_oversized_uploads_are_rejected(self) -> None:
        empty = self.client.post(
            "/v1/tenders/analyze",
            files=[("files", ("empty.pdf", b"", "application/pdf"))],
        )
        oversized_client = TestClient(
            create_app(
                parser=FakeParser(),
                reasoner=grounded_reasoner,
                max_file_bytes=8,
            )
        )
        oversized = oversized_client.post(
            "/v1/tenders/analyze",
            files=[("files", ("large.pdf", b"123456789", "application/pdf"))],
        )

        self.assertEqual(empty.status_code, 400)
        self.assertIn("non-empty", empty.json()["detail"])
        self.assertEqual(oversized.status_code, 413)
        self.assertIn("8 bytes", oversized.json()["detail"])

    def test_generic_run_rejects_an_oversized_aggregate_request(self) -> None:
        client = TestClient(
            create_app(
                parser=FakeParser(),
                reasoner=grounded_reasoner,
                max_file_bytes=8,
                max_total_file_bytes=10,
            )
        )

        response = client.post(
            "/v1/documents/runs",
            data={"recipe_id": "tender-review-v1"},
            files=[
                ("files", ("one.pdf", b"123456", "application/pdf")),
                ("files", ("two.pdf", b"123456", "application/pdf")),
            ],
        )

        self.assertEqual(response.status_code, 413)
        self.assertIn("10 bytes total", response.json()["detail"])

    def test_archive_and_legacy_workbook_formats_are_not_sent_to_docling(self) -> None:
        for name in ("documents.zip", "BOQ.xls"):
            with self.subTest(name=name):
                response = self.client.post(
                    "/v1/tenders/analyze",
                    files=[("files", (name, b"source", "application/octet-stream"))],
                )
                self.assertEqual(response.status_code, 415)
                self.assertIn("is not supported", response.json()["detail"])

    def test_parser_failure_is_bounded_and_does_not_expose_internals(self) -> None:
        client = TestClient(create_app(parser=BrokenParser(), reasoner=grounded_reasoner))

        response = client.post(
            "/v1/tenders/analyze",
            files=[("files", ("notice.pdf", b"source", "application/pdf"))],
        )

        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["detail"], "Document parser could not read notice.pdf")

    def test_environment_selects_the_provider_neutral_reasoner(self) -> None:
        with patch.dict(
            os.environ,
            {
                "TENDER_AI_BASE_URL": "https://models.example.test/v1",
                "TENDER_AI_MODEL": "open-model",
                "TENDER_AI_API_KEY": "secret-test-value",
            },
            clear=False,
        ):
            client = TestClient(create_app(parser=FakeParser()))

        health = client.get("/health").json()
        self.assertEqual(health["reasoner"], "HTTPJSONReasoner")


if __name__ == "__main__":
    unittest.main()
