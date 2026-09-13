from __future__ import annotations

import hashlib
from typing import Any, Callable, Iterable


class AnalysisError(ValueError):
    pass


def analyze_documents(
    files: Iterable[tuple[str, bytes]],
    *,
    parse: Callable[[str, bytes], list[dict[str, Any]]],
    reason: Callable[[list[dict[str, Any]]], dict[str, Any]],
) -> dict[str, Any]:
    documents: list[dict[str, Any]] = []
    pages_by_receipt: dict[tuple[str, int], str] = {}

    for name, data in files:
        if not name or not data:
            raise AnalysisError("Every document requires a name and non-empty source bytes")
        digest = hashlib.sha256(data).hexdigest()
        parsed_pages = parse(name, data)
        pages: list[dict[str, Any]] = []
        for parsed in parsed_pages:
            page = parsed.get("page")
            text = parsed.get("text")
            if not isinstance(page, int) or page < 1 or not isinstance(text, str):
                raise AnalysisError(f"Parser returned an invalid page for {name}")
            pages.append({"page": page, "text": text})
            pages_by_receipt[(digest, page)] = text
        documents.append(
            {"name": name, "sha256": digest, "size": len(data), "pages": pages}
        )

    if not documents:
        raise AnalysisError("At least one tender document is required")

    proposed = reason(documents)
    findings = proposed.get("findings", [])
    if not isinstance(findings, list):
        raise AnalysisError("Reasoner findings must be a list")

    accepted: list[dict[str, Any]] = []
    for finding in findings:
        evidence = finding.get("evidence") if isinstance(finding, dict) else None
        if not isinstance(evidence, dict):
            raise AnalysisError("Every finding requires source evidence")
        digest = evidence.get("document_sha256")
        page = evidence.get("page")
        quote = evidence.get("quote")
        source = pages_by_receipt.get((digest, page))
        if source is None:
            raise AnalysisError("Finding references an unknown document page")
        if not isinstance(quote, str) or not quote.strip() or quote not in source:
            raise AnalysisError("Finding quote is not present on its referenced source page")
        accepted.append(finding)

    summary = proposed.get("summary", "")
    if not isinstance(summary, str):
        raise AnalysisError("Reasoner summary must be text")

    return {
        "schema": "jjty-tender-analysis-v1",
        "state": "ready_for_review",
        "summary": summary,
        "documents": documents,
        "findings": accepted,
        "authority": "advisory_only",
        "submission_allowed": False,
    }
