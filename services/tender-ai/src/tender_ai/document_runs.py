from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any, Callable, Iterable

from .analysis import AnalysisError, analyze_documents


class DocumentRunError(AnalysisError):
    pass


@dataclass(frozen=True)
class DocumentRecipe:
    id: str
    version: str
    purpose: str
    reasoner_profile: str

    def public(self) -> dict[str, str]:
        return {"id": self.id, "version": self.version, "purpose": self.purpose}


class RecipeRegistry:
    def __init__(self, recipes: Iterable[DocumentRecipe]) -> None:
        self._recipes = {recipe.id: recipe for recipe in recipes}

    @classmethod
    def default(cls) -> "RecipeRegistry":
        return cls(
            [
                DocumentRecipe(
                    id="document-review-v1",
                    version="1.0.0",
                    purpose="Extract source-grounded advisory findings from documents.",
                    reasoner_profile="general-document-review-v1",
                ),
                DocumentRecipe(
                    id="tender-review-v1",
                    version="1.0.0",
                    purpose="Prepare source-grounded tender findings for human review.",
                    reasoner_profile="public-works-tender-review-v1",
                ),
            ]
        )

    def get(self, recipe_id: str) -> DocumentRecipe:
        try:
            return self._recipes[recipe_id]
        except KeyError as error:
            raise DocumentRunError(f"Unknown document recipe: {recipe_id}") from error

    def list(self) -> list[dict[str, str]]:
        return [self._recipes[key].public() for key in sorted(self._recipes)]


def _adapter_receipt(adapter: object) -> dict[str, str]:
    receipt = {
        "id": str(getattr(adapter, "adapter_id", adapter.__class__.__name__)),
        "version": str(getattr(adapter, "adapter_version", "unversioned")),
    }
    model = getattr(adapter, "model", None)
    if model:
        receipt["model"] = str(model)
    return receipt


def _canonical_hash(value: object) -> str:
    encoded = json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


class DocumentRunner:
    def __init__(
        self,
        *,
        recipes: RecipeRegistry,
        parser: object,
        reasoner: Callable[[list[dict[str, Any]]], dict[str, Any]],
    ) -> None:
        self.recipes = recipes
        self.parser = parser
        self.reasoner = reasoner

    def run(
        self,
        *,
        recipe_id: str,
        files: Iterable[tuple[str, bytes]],
    ) -> dict[str, Any]:
        recipe = self.recipes.get(recipe_id)
        sources = list(files)
        parsed_by_digest: dict[str, list[dict[str, Any]]] = {}

        def parse(name: str, data: bytes) -> list[dict[str, Any]]:
            try:
                pages = self.parser.parse(name, data)
            except AnalysisError:
                raise
            except Exception as error:
                raise DocumentRunError(f"Document parser could not read {name}") from error
            parsed_by_digest[hashlib.sha256(data).hexdigest()] = pages
            return pages

        proposed_usage: dict[str, Any] = {}

        def reason(documents: list[dict[str, Any]]) -> dict[str, Any]:
            recipe_reasoner = getattr(self.reasoner, "reason_for_recipe", None)
            result = (
                recipe_reasoner(documents, recipe)
                if callable(recipe_reasoner)
                else self.reasoner(documents)
            )
            if not isinstance(result, dict):
                raise DocumentRunError("Reasoner must return a JSON object")
            usage = result.get("_usage", {})
            if isinstance(usage, dict):
                proposed_usage.update(usage)
            return {key: value for key, value in result.items() if not key.startswith("_")}

        analysis = analyze_documents(sources, parse=parse, reason=reason)
        inputs: list[dict[str, Any]] = []
        documents: list[dict[str, Any]] = []
        node_lookup: dict[tuple[str, int], list[dict[str, Any]]] = {}
        page_node_lookup: dict[tuple[str, int], dict[str, Any]] = {}

        for name, data in sources:
            digest = hashlib.sha256(data).hexdigest()
            source_id = f"sha256:{digest}"
            document_id = f"document:{source_id}"
            inputs.append(
                {
                    "name": name,
                    "size": len(data),
                    "sha256": digest,
                    "source_object_id": source_id,
                }
            )
            nodes: list[dict[str, Any]] = []
            for page_value in parsed_by_digest[digest]:
                page = int(page_value["page"])
                blocks = page_value.get("blocks")
                if not isinstance(blocks, list) or not blocks:
                    blocks = [{"kind": "page_text", "text": page_value["text"]}]
                page_nodes: list[dict[str, Any]] = []
                for index, block in enumerate(blocks, start=1):
                    text = block.get("text", "") if isinstance(block, dict) else ""
                    selector: dict[str, Any] = {"page": page}
                    bbox = block.get("bbox") if isinstance(block, dict) else None
                    if isinstance(bbox, list) and len(bbox) == 4:
                        selector["bbox"] = bbox
                    node = {
                        "node_id": f"{document_id}:page:{page}:block:{index}",
                        "kind": (
                            str(block.get("kind", "text"))
                            if isinstance(block, dict)
                            else "text"
                        ),
                        "text": str(text),
                        "selector": selector,
                        "derived_from": source_id,
                    }
                    nodes.append(node)
                    page_nodes.append(node)
                page_node = {
                    "node_id": f"{document_id}:page:{page}",
                    "kind": "page",
                    "text": str(page_value["text"]),
                    "selector": {"page": page},
                    "derived_from": source_id,
                }
                nodes.append(page_node)
                node_lookup[(digest, page)] = page_nodes
                page_node_lookup[(digest, page)] = page_node
            documents.append(
                {
                    "document_version_id": document_id,
                    "source_object_id": source_id,
                    "name": name,
                    "nodes": nodes,
                }
            )

        findings: list[dict[str, Any]] = []
        for finding in analysis["findings"]:
            evidence = dict(finding["evidence"])
            candidates = node_lookup[(evidence["document_sha256"], evidence["page"])]
            matched = next(
                (node for node in candidates if evidence["quote"] in node["text"]),
                page_node_lookup[(evidence["document_sha256"], evidence["page"])],
            )
            evidence["node_id"] = matched["node_id"]
            evidence["selector"] = matched["selector"]
            findings.append({**finding, "evidence": evidence})

        run_material = {
            "recipe": {"id": recipe.id, "version": recipe.version},
            "inputs": inputs,
            "parser": _adapter_receipt(self.parser),
            "reasoner": _adapter_receipt(self.reasoner),
            "findings": findings,
            "usage": proposed_usage,
            "documents": documents,
            "summary": analysis["summary"],
            "state": analysis["state"],
            "authority": "advisory_only",
            "external_action_allowed": False,
        }
        run_sha256 = _canonical_hash(run_material)
        return {
            "schema": "jjty-document-run-v1",
            "run_id": f"run:sha256:{run_sha256}",
            "recipe": {"id": recipe.id, "version": recipe.version},
            "state": analysis["state"],
            "summary": analysis["summary"],
            "inputs": inputs,
            "documents": documents,
            "findings": findings,
            "receipt": {
                "run_sha256": run_sha256,
                "parser": _adapter_receipt(self.parser),
                "reasoner": _adapter_receipt(self.reasoner),
                "usage": proposed_usage,
            },
            "authority": "advisory_only",
            "external_action_allowed": False,
        }
