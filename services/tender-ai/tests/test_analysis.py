import hashlib
from pathlib import Path
import unittest

from tender_ai.analysis import AnalysisError, analyze_documents
from tender_ai.docling_parser import DoclingParser


class TenderAnalysisTests(unittest.TestCase):
    def test_docling_parser_eagerly_initializes_the_pdf_pipeline(self):
        from docling.datamodel.base_models import InputFormat

        class ProbeConverter:
            def __init__(self) -> None:
                self.initialized_formats = []

            def initialize_pipeline(self, source_format):
                self.initialized_formats.append(source_format)

        converter = ProbeConverter()

        DoclingParser(converter=converter)

        self.assertEqual(converter.initialized_formats, [InputFormat.PDF])

    def test_docling_parser_returns_page_grounded_text_from_a_real_pdf(self):
        fixture = Path(__file__).parents[3] / "test" / "fixtures" / "jett-range.pdf"
        pages = DoclingParser().parse(fixture.name, fixture.read_bytes())

        self.assertGreaterEqual(len(pages), 1)
        self.assertEqual(pages[0]["page"], 1)
        self.assertTrue(pages[0]["text"].strip())

    def test_preserves_receipts_and_accepts_only_grounded_findings(self):
        source = b"Tender 2026_PWR_1337988_1\nCompletion period: 90 days\nEMD: Rs 22000"

        result = analyze_documents(
            [("notice.pdf", source)],
            parse=lambda _name, _data: [
                {"page": 1, "text": source.decode("utf-8")}
            ],
            reason=lambda _documents: {
                "summary": "Road and gutter work",
                "findings": [
                    {
                        "kind": "deadline",
                        "label": "Completion period",
                        "value": "90 days",
                        "evidence": {
                            "document_sha256": hashlib.sha256(source).hexdigest(),
                            "page": 1,
                            "quote": "Completion period: 90 days",
                        },
                    }
                ],
            },
        )

        self.assertEqual(result["state"], "ready_for_review")
        self.assertEqual(result["documents"][0]["sha256"], hashlib.sha256(source).hexdigest())
        self.assertNotIn("pages", result["documents"][0])
        self.assertEqual(result["findings"][0]["evidence"]["page"], 1)

    def test_rejects_a_model_finding_without_exact_source_evidence(self):
        source = b"Completion period: 90 days"

        with self.assertRaisesRegex(AnalysisError, "quote is not present"):
            analyze_documents(
                [("notice.pdf", source)],
                parse=lambda _name, _data: [{"page": 1, "text": source.decode()}],
                reason=lambda _documents: {
                    "summary": "",
                    "findings": [
                        {
                            "kind": "deadline",
                            "label": "Completion period",
                            "value": "60 days",
                            "evidence": {
                                "document_sha256": hashlib.sha256(source).hexdigest(),
                                "page": 1,
                                "quote": "Completion period: 60 days",
                            },
                        }
                    ],
                },
            )


if __name__ == "__main__":
    unittest.main()
