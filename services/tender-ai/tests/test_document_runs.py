from __future__ import annotations

import hashlib
import unittest

from tender_ai.document_runs import DocumentRunError, DocumentRunner, RecipeRegistry


class VersionedParser:
    adapter_id = "fixture-parser"
    adapter_version = "2.1.0"

    def parse(self, _name: str, data: bytes):
        return [
            {
                "page": 1,
                "text": data.decode(),
                "blocks": [
                    {
                        "kind": "paragraph",
                        "text": data.decode(),
                        "bbox": [10.0, 20.0, 100.0, 40.0],
                    }
                ],
            }
        ]


class ChangedGraphParser(VersionedParser):
    def parse(self, _name: str, data: bytes):
        pages = super().parse(_name, data)
        pages[0]["blocks"].append(
            {"kind": "footer", "text": "Page 1", "bbox": [1.0, 1.0, 2.0, 2.0]}
        )
        return pages


class VersionedReasoner:
    adapter_id = "fixture-reasoner"
    adapter_version = "1.3.0"
    model = "fixture-model"

    def __call__(self, documents):
        document = documents[0]
        return {
            "summary": "One requirement found.",
            "findings": [
                {
                    "kind": "deadline",
                    "title": "Completion period",
                    "detail": "Confirm before submission.",
                    "evidence": {
                        "document_sha256": document["sha256"],
                        "page": 1,
                        "quote": "Completion period: 90 days",
                    },
                }
            ],
            "_usage": {
                "input_tokens": 120,
                "output_tokens": 30,
                "cached_input_tokens": 20,
                "cost_usd": "0.000026",
            },
        }


class DocumentRunTests(unittest.TestCase):
    def setUp(self):
        self.registry = RecipeRegistry.default()
        self.runner = DocumentRunner(
            recipes=self.registry,
            parser=VersionedParser(),
            reasoner=VersionedReasoner(),
        )

    def test_produces_versioned_document_graph_and_provenance_receipt(self):
        source = b"Completion period: 90 days"
        digest = hashlib.sha256(source).hexdigest()

        run = self.runner.run(
            recipe_id="tender-review-v1",
            files=[("notice.pdf", source)],
        )

        self.assertEqual(run["schema"], "jjty-document-run-v1")
        self.assertEqual(run["recipe"], {"id": "tender-review-v1", "version": "1.0.0"})
        self.assertEqual(run["inputs"][0]["source_object_id"], f"sha256:{digest}")
        self.assertEqual(run["documents"][0]["document_version_id"], f"document:sha256:{digest}")
        node = run["documents"][0]["nodes"][0]
        self.assertEqual(node["node_id"], f"document:sha256:{digest}:page:1:block:1")
        self.assertEqual(node["selector"]["bbox"], [10.0, 20.0, 100.0, 40.0])
        self.assertEqual(
            run["findings"][0]["evidence"]["node_id"],
            node["node_id"],
        )
        self.assertEqual(run["receipt"]["parser"]["id"], "fixture-parser")
        self.assertEqual(run["receipt"]["reasoner"]["model"], "fixture-model")
        self.assertEqual(run["receipt"]["usage"]["input_tokens"], 120)
        self.assertEqual(run["receipt"]["usage"]["cost_usd"], "0.000026")
        self.assertEqual(len(run["receipt"]["run_sha256"]), 64)
        self.assertEqual(run["authority"], "advisory_only")
        self.assertFalse(run["external_action_allowed"])

    def test_run_identity_is_deterministic_for_same_inputs_and_recipe(self):
        files = [("notice.pdf", b"Completion period: 90 days")]

        first = self.runner.run(recipe_id="tender-review-v1", files=files)
        second = self.runner.run(recipe_id="tender-review-v1", files=files)

        self.assertEqual(first["run_id"], second["run_id"])
        self.assertEqual(first["receipt"]["run_sha256"], second["receipt"]["run_sha256"])

    def test_receipt_changes_when_the_parsed_graph_changes(self):
        files = [("notice.pdf", b"Completion period: 90 days")]
        changed_runner = DocumentRunner(
            recipes=self.registry,
            parser=ChangedGraphParser(),
            reasoner=VersionedReasoner(),
        )

        original = self.runner.run(recipe_id="tender-review-v1", files=files)
        changed = changed_runner.run(recipe_id="tender-review-v1", files=files)

        self.assertNotEqual(
            original["receipt"]["run_sha256"], changed["receipt"]["run_sha256"]
        )

    def test_cross_block_quote_uses_page_selector_instead_of_false_block(self):
        class CrossBlockParser(VersionedParser):
            def parse(self, _name, _data):
                return [
                    {
                        "page": 1,
                        "text": "Completion period: 90 days",
                        "blocks": [
                            {"kind": "text", "text": "Completion period:"},
                            {"kind": "text", "text": "90 days"},
                        ],
                    }
                ]

        run = DocumentRunner(
            recipes=self.registry,
            parser=CrossBlockParser(),
            reasoner=VersionedReasoner(),
        ).run(
            recipe_id="tender-review-v1",
            files=[("notice.pdf", b"Completion period: 90 days")],
        )

        evidence = run["findings"][0]["evidence"]
        self.assertTrue(evidence["node_id"].endswith(":page:1"))
        self.assertEqual(evidence["selector"], {"page": 1})

    def test_rejects_unknown_recipe_before_processing_documents(self):
        with self.assertRaisesRegex(DocumentRunError, "Unknown document recipe"):
            self.runner.run(recipe_id="missing", files=[("notice.pdf", b"source")])

    def test_default_registry_is_service_neutral_and_versioned(self):
        recipes = self.registry.list()

        self.assertEqual(
            [recipe["id"] for recipe in recipes],
            ["document-review-v1", "tender-review-v1"],
        )
        self.assertTrue(all(recipe["version"] == "1.0.0" for recipe in recipes))

    def test_recipe_aware_reasoner_receives_the_executable_recipe(self):
        seen = []

        class RecipeAwareReasoner:
            def reason_for_recipe(self, documents, recipe):
                seen.append((recipe.id, recipe.reasoner_profile, documents[0]["name"]))
                return {"summary": "", "findings": []}

        runner = DocumentRunner(
            recipes=self.registry,
            parser=VersionedParser(),
            reasoner=RecipeAwareReasoner(),
        )

        runner.run(
            recipe_id="document-review-v1",
            files=[("record.txt", b"General record")],
        )

        self.assertEqual(
            seen,
            [("document-review-v1", "general-document-review-v1", "record.txt")],
        )


if __name__ == "__main__":
    unittest.main()
