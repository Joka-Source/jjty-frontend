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
                json={
                    "choices": [{"message": {"content": json.dumps(content)}}],
                    "usage": {
                        "prompt_tokens": 120,
                        "completion_tokens": 30,
                        "prompt_tokens_details": {"cached_tokens": 20},
                    },
                },
            )

        reasoner = HTTPJSONReasoner(
            base_url="https://models.example.test/v1",
            model="open-model",
            api_key="secret-test-value",
            input_cost_per_million="0.10",
            cached_input_cost_per_million="0.003",
            output_cost_per_million="0.50",
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
        self.assertEqual(
            result["_usage"],
            {
                "input_tokens": 120,
                "output_tokens": 30,
                "cached_input_tokens": 20,
                "cost_usd": "0.00002506",
            },
        )

    def test_reports_provider_usage_without_inventing_an_unconfigured_cost(self) -> None:
        response_body = {
            "choices": [
                {"message": {"content": json.dumps({"summary": "", "findings": []})}}
            ],
            "usage": {"prompt_tokens": 7, "completion_tokens": 2},
        }
        reasoner = HTTPJSONReasoner(
            base_url="https://models.example.test/v1",
            model="open-model",
            api_key="secret-test-value",
            client=httpx.Client(
                transport=httpx.MockTransport(
                    lambda _request: httpx.Response(200, json=response_body)
                )
            ),
        )

        result = reasoner([])

        self.assertEqual(
            result["_usage"],
            {"input_tokens": 7, "output_tokens": 2, "cached_input_tokens": 0},
        )

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

    def test_rejects_invalid_usage_and_negative_pricing_as_bounded_errors(self) -> None:
        with self.assertRaisesRegex(ValueError, "non-negative"):
            HTTPJSONReasoner(
                base_url="https://models.example.test",
                model="open-model",
                api_key="secret-test-value",
                input_cost_per_million="-1",
                cached_input_cost_per_million="0",
                output_cost_per_million="0",
            )

        response_body = {
            "choices": [
                {"message": {"content": json.dumps({"summary": "", "findings": []})}}
            ],
            "usage": {
                "prompt_tokens": 4,
                "completion_tokens": 1,
                "prompt_tokens_details": {"cached_tokens": 8},
            },
        }
        reasoner = HTTPJSONReasoner(
            base_url="https://models.example.test",
            model="open-model",
            api_key="secret-test-value",
            client=httpx.Client(
                transport=httpx.MockTransport(
                    lambda _request: httpx.Response(200, json=response_body)
                )
            ),
        )

        with self.assertRaisesRegex(AnalysisError, "invalid token usage"):
            reasoner([])


if __name__ == "__main__":
    unittest.main()
