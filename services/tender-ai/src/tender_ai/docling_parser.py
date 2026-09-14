from __future__ import annotations

from collections import defaultdict
from importlib.metadata import version
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any


class DoclingParser:
    adapter_id = "docling"
    adapter_version = version("docling")

    def __init__(self, *, converter: Any | None = None) -> None:
        from docling.datamodel.base_models import InputFormat

        if converter is None:
            from docling.document_converter import DocumentConverter

            converter = DocumentConverter()
        self._converter = converter
        self._converter.initialize_pipeline(InputFormat.PDF)

    def parse(self, name: str, data: bytes) -> list[dict[str, Any]]:
        suffix = Path(name).suffix or ".pdf"
        with TemporaryDirectory(prefix="jjty-tender-") as directory:
            source = Path(directory) / f"source{suffix}"
            source.write_bytes(data)
            converted = self._converter.convert(source)

        page_text: dict[int, list[str]] = defaultdict(list)
        page_blocks: dict[int, list[dict[str, Any]]] = defaultdict(list)
        for item, _level in converted.document.iterate_items():
            provenance = getattr(item, "prov", None) or []
            page = provenance[0].page_no if provenance else 1
            if hasattr(item, "export_to_markdown"):
                text = item.export_to_markdown(doc=converted.document)
            else:
                text = getattr(item, "text", "")
            if isinstance(text, str) and text.strip():
                normalized_text = text.strip()
                page_number = int(page)
                page_text[page_number].append(normalized_text)
                label = getattr(item, "label", "text")
                block: dict[str, Any] = {
                    "kind": str(getattr(label, "value", label)),
                    "text": normalized_text,
                }
                bbox = getattr(provenance[0], "bbox", None) if provenance else None
                coordinates = [
                    getattr(bbox, attribute, None)
                    for attribute in ("l", "t", "r", "b")
                ]
                if bbox is not None and all(
                    isinstance(value, (int, float)) for value in coordinates
                ):
                    block["bbox"] = [float(value) for value in coordinates]
                page_blocks[page_number].append(block)

        return [
            {
                "page": page,
                "text": "\n\n".join(parts),
                "blocks": page_blocks[page],
            }
            for page, parts in sorted(page_text.items())
        ]
