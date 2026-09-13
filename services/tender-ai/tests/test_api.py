from __future__ import annotations

import hashlib
import os
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from tender_ai.api import create_app


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
