from __future__ import annotations

import json
import unittest

import httpx

from tender_ai.analysis import AnalysisError
from tender_ai.reasoner import HTTPJSONReasoner


class HTTPJSONReasonerTests(unittest.TestCase):
    def test_calls_configured_model_and_returns_strict_json(self) -> None:
        seen: dict[str, object] = {}

        def respond(request: httpx.Request) -> httpx.Response:
            seen["authorization"] = request.headers.get("authorization")
            seen["body"] = json.loads(request.content)
            content = {
                "summary": "Deadline found.",
                "findings": [
                    {
                        "kind": "deadline",
                        "title": "Submission deadline",
                        "detail": "Confirm before submission.",
                        "evidence": {
                            "document_sha256": "abc123",
                            "page": 1,
                            "quote": "18 September 2026",
                        },
                    }
                ],
            }
            return httpx.Response(
                200,
                json={"choices": [{"message": {"content": json.dumps(content)}}]},
            )

        reasoner = HTTPJSONReasoner(
            base_url="https://models.example.test/v1",
            model="open-model",
            api_key="secret-test-value",
            client=httpx.Client(transport=httpx.MockTransport(respond)),
        )
        result = reasoner(
            [
                {
                    "name": "notice.pdf",
                    "sha256": "abc123",
                    "pages": [{"page": 1, "text": "Closes 18 September 2026"}],
                }
            ]
        )

        self.assertEqual(result["summary"], "Deadline found.")
        self.assertEqual(seen["authorization"], "Bearer secret-test-value")
        body = seen["body"]
        self.assertEqual(body["model"], "open-model")
        self.assertEqual(body["response_format"], {"type": "json_object"})
        self.assertIn("abc123", body["messages"][1]["content"])

    def test_rejects_non_json_and_unbounded_inputs(self) -> None:
        invalid = HTTPJSONReasoner(
            base_url="https://models.example.test",
            model="open-model",
            api_key="secret-test-value",
            client=httpx.Client(
                transport=httpx.MockTransport(
                    lambda _request: httpx.Response(
                        200,
                        json={"choices": [{"message": {"content": "not json"}}]},
                    )
                )
            ),
        )
        bounded = HTTPJSONReasoner(
            base_url="https://models.example.test",
            model="open-model",
            api_key="secret-test-value",
            max_source_characters=5,
        )
        documents = [
            {
                "name": "notice.pdf",
                "sha256": "abc123",
                "pages": [{"page": 1, "text": "too much source text"}],
            }
        ]

        with self.assertRaisesRegex(AnalysisError, "valid JSON"):
            invalid(documents)
        with self.assertRaisesRegex(AnalysisError, "source limit"):
            bounded(documents)


if __name__ == "__main__":
    unittest.main()
