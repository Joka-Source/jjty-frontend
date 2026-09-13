from __future__ import annotations

from collections import defaultdict
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any


class DoclingParser:
    def __init__(self) -> None:
        from docling.document_converter import DocumentConverter

        self._converter = DocumentConverter()

    def parse(self, name: str, data: bytes) -> list[dict[str, Any]]:
        suffix = Path(name).suffix or ".pdf"
        with TemporaryDirectory(prefix="jjty-tender-") as directory:
            source = Path(directory) / f"source{suffix}"
            source.write_bytes(data)
            converted = self._converter.convert(source)

        page_text: dict[int, list[str]] = defaultdict(list)
        for item, _level in converted.document.iterate_items():
            provenance = getattr(item, "prov", None) or []
            page = provenance[0].page_no if provenance else 1
            if hasattr(item, "export_to_markdown"):
                text = item.export_to_markdown(doc=converted.document)
            else:
                text = getattr(item, "text", "")
            if isinstance(text, str) and text.strip():
                page_text[int(page)].append(text.strip())

        return [
            {"page": page, "text": "\n\n".join(parts)}
            for page, parts in sorted(page_text.items())
        ]
