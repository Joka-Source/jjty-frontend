from __future__ import annotations

import os
import hmac
from importlib.metadata import version
from collections.abc import Callable
from pathlib import Path
from typing import Any, Protocol

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool

from .analysis import AnalysisError, analyze_documents
from .document_runs import DocumentRunner, RecipeRegistry

if False:  # pragma: no cover - typing-only import without eager platform setup
    from .platform.engine import PlatformEngine


SUPPORTED_SUFFIXES = {
    ".pdf", ".docx", ".xlsx", ".pptx", ".html", ".md", ".txt", ".csv",
    ".png", ".jpg", ".jpeg", ".tif", ".tiff",
}


class Parser(Protocol):
    def parse(self, name: str, data: bytes) -> list[dict[str, Any]]: ...


class LazyDoclingParser:
    """Delay model loading until the first deliberate analysis request."""

    adapter_id = "docling"
    adapter_version = version("docling")

    def __init__(self) -> None:
        self._parser: Parser | None = None

    def parse(self, name: str, data: bytes) -> list[dict[str, Any]]:
        self.ready()
        assert self._parser is not None
        return self._parser.parse(name, data)

    def ready(self) -> None:
        if self._parser is None:
            from .docling_parser import DoclingParser

            self._parser = DoclingParser()


def parser_only_reasoner(_documents: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "summary": (
            "Document text was extracted locally. Configure a reasoner to propose "
            "source-linked checks."
        ),
        "findings": [],
    }


parser_only_reasoner.adapter_id = "parser-only"  # type: ignore[attr-defined]
parser_only_reasoner.adapter_version = "1.0.0"  # type: ignore[attr-defined]


def _callable_name(value: object) -> str:
    return getattr(value, "__name__", value.__class__.__name__)


def _reasoner_from_environment() -> Callable[[list[dict[str, Any]]], dict[str, Any]]:
    base_url = os.getenv("TENDER_AI_BASE_URL", "").strip()
    model = os.getenv("TENDER_AI_MODEL", "").strip()
    api_key = os.getenv("TENDER_AI_API_KEY", "").strip()
    configured = [base_url, model, api_key]
    if not any(configured):
        return parser_only_reasoner
    if not all(configured):
        raise RuntimeError(
            "TENDER_AI_BASE_URL, TENDER_AI_MODEL, and TENDER_AI_API_KEY "
            "must be configured together"
        )
    from .reasoner import HTTPJSONReasoner

    rate_names = (
        "TENDER_AI_INPUT_COST_PER_MILLION",
        "TENDER_AI_CACHED_INPUT_COST_PER_MILLION",
        "TENDER_AI_OUTPUT_COST_PER_MILLION",
    )
    rates = [os.getenv(name, "").strip() for name in rate_names]
    if any(rates) and not all(rates):
        raise RuntimeError(f"{', '.join(rate_names)} must be configured together")
    return HTTPJSONReasoner(
        base_url=base_url,
        model=model,
        api_key=api_key,
        input_cost_per_million=rates[0] or None,
        cached_input_cost_per_million=rates[1] or None,
        output_cost_per_million=rates[2] or None,
    )


def create_app(
    *,
    parser: Parser | None = None,
    reasoner: Callable[[list[dict[str, Any]]], dict[str, Any]] | None = None,
    max_file_bytes: int = 50 * 1024 * 1024,
    max_total_file_bytes: int = 200 * 1024 * 1024,
    max_documents: int = 20,
    platform_engine: "PlatformEngine | None" = None,
    platform_token: str | None = None,
    human_approval_token: str | None = None,
    document_token: str | None = None,
    environment: str | None = None,
) -> FastAPI:
    selected_parser = parser or LazyDoclingParser()
    selected_reasoner = reasoner or _reasoner_from_environment()
    recipes = RecipeRegistry.default()
    document_runner = DocumentRunner(
        recipes=recipes,
        parser=selected_parser,
        reasoner=selected_reasoner,
    )
    selected_document_token = (
        document_token
        if document_token is not None
        else os.getenv("TENDER_AI_DOCUMENT_API_TOKEN", "").strip()
    )
    selected_environment = (
        environment
        if environment is not None
        else os.getenv("TENDER_AI_ENVIRONMENT", "development").strip().lower()
    )
    if selected_environment == "production" and not selected_document_token:
        raise RuntimeError("A document API token is required in production")

    def require_document_access(authorization: str | None) -> None:
        if not selected_document_token:
            return
        expected = f"Bearer {selected_document_token}"
        if authorization is None or not hmac.compare_digest(authorization, expected):
            raise HTTPException(status_code=401, detail="Document API authorization required")
    application = FastAPI(
        title="JJTY service platform",
        version="0.2.0",
        description=(
            "Service-neutral cases and source-grounded advisory document intelligence."
        ),
    )
    allowed_origins = [
        value.strip()
        for value in os.getenv(
            "TENDER_AI_ALLOWED_ORIGINS",
            "http://127.0.0.1:8793,http://localhost:8793",
        ).split(",")
        if value.strip()
    ]
    application.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_methods=["GET", "POST"],
        allow_headers=[
            "Authorization",
            "Content-Type",
            "Idempotency-Key",
            "X-JJTY-Actor",
            "X-JJTY-Actor-Kind",
            "X-JJTY-Human-Approval",
        ],
    )

    if platform_engine is None:
        table_name = os.getenv("SERVICE_PLATFORM_DYNAMODB_TABLE", "").strip()
        configured_platform_token = os.getenv("SERVICE_PLATFORM_API_TOKEN", "").strip()
        configured_human_token = os.getenv(
            "SERVICE_PLATFORM_HUMAN_APPROVAL_TOKEN", ""
        ).strip()
        platform_values = [table_name, configured_platform_token, configured_human_token]
        if any(platform_values):
            if not all(platform_values):
                raise RuntimeError(
                    "SERVICE_PLATFORM_DYNAMODB_TABLE, SERVICE_PLATFORM_API_TOKEN, and "
                    "SERVICE_PLATFORM_HUMAN_APPROVAL_TOKEN must be configured together"
                )
            from .platform.dynamodb_store import DynamoDBPlatformStore
            from .platform.engine import PlatformEngine
            from .platform.packs import ServicePackRegistry

            platform_engine = PlatformEngine(
                ServicePackRegistry.default(),
                DynamoDBPlatformStore.from_environment(table_name),
            )
            platform_token = configured_platform_token
            human_approval_token = configured_human_token

    if platform_engine is not None:
        if not platform_token or not human_approval_token:
            raise RuntimeError(
                "Platform and human approval tokens are required when the platform API is enabled"
            )
        from .platform.api import create_platform_router

        application.include_router(
            create_platform_router(
                platform_engine,
                token=platform_token,
                human_approval_token=human_approval_token,
            )
        )

    @application.get("/health")
    def health() -> dict[str, str]:
        ready = getattr(selected_parser, "ready", None)
        if callable(ready):
            ready()
        return {
            "status": "ready",
            "parser": _callable_name(selected_parser),
            "reasoner": _callable_name(selected_reasoner),
            "authority": "advisory_only",
        }

    @application.post("/v1/tenders/analyze")
    async def analyze(
        files: list[UploadFile] = File(...),
        authorization: str | None = Header(default=None),
    ) -> dict[str, Any]:
        require_document_access(authorization)
        if not files:
            raise HTTPException(status_code=400, detail="At least one tender document is required")
        if len(files) > max_documents:
            raise HTTPException(
                status_code=400,
                detail=f"Choose no more than {max_documents} documents at once",
            )

        sources: list[tuple[str, bytes]] = []
        total_bytes = 0
        for upload in files:
            filename = upload.filename or "document"
            if Path(filename).suffix.lower() not in SUPPORTED_SUFFIXES:
                raise HTTPException(
                    status_code=415,
                    detail=f"{filename} is not supported by the document parser",
                )
            data = await upload.read(max_file_bytes + 1)
            if not data:
                raise HTTPException(
                    status_code=400,
                    detail=f"{upload.filename or 'Every document'} must be non-empty",
                )
            if len(data) > max_file_bytes:
                raise HTTPException(
                    status_code=413,
                    detail=(
                        f"{upload.filename or 'Document'} exceeds the "
                        f"{max_file_bytes} bytes per-file limit"
                    ),
                )
            total_bytes += len(data)
            if total_bytes > max_total_file_bytes:
                raise HTTPException(
                    status_code=413,
                    detail=f"Documents exceed the {max_total_file_bytes} bytes total limit",
                )
            sources.append((filename, data))

        try:
            def parse_source(name: str, data: bytes) -> list[dict[str, Any]]:
                try:
                    return selected_parser.parse(name, data)
                except AnalysisError:
                    raise
                except Exception as error:
                    raise AnalysisError(
                        f"Document parser could not read {name}"
                    ) from error

            return await run_in_threadpool(
                analyze_documents,
                sources,
                parse=parse_source,
                reason=selected_reasoner,
            )
        except AnalysisError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error

    @application.get("/v1/documents/recipes")
    def list_document_recipes(
        authorization: str | None = Header(default=None),
    ) -> dict[str, Any]:
        require_document_access(authorization)
        return {"schema": "jjty-document-recipe-list-v1", "recipes": recipes.list()}

    @application.post("/v1/documents/runs")
    async def create_document_run(
        files: list[UploadFile] = File(...),
        recipe_id: str = Form(...),
        authorization: str | None = Header(default=None),
    ) -> dict[str, Any]:
        require_document_access(authorization)
        if not files:
            raise HTTPException(status_code=400, detail="At least one document is required")
        if len(files) > max_documents:
            raise HTTPException(
                status_code=400,
                detail=f"Choose no more than {max_documents} documents at once",
            )
        sources: list[tuple[str, bytes]] = []
        total_bytes = 0
        for upload in files:
            filename = upload.filename or "document"
            if Path(filename).suffix.lower() not in SUPPORTED_SUFFIXES:
                raise HTTPException(
                    status_code=415,
                    detail=f"{filename} is not supported by the document parser",
                )
            data = await upload.read(max_file_bytes + 1)
            if not data:
                raise HTTPException(status_code=400, detail=f"{filename} must be non-empty")
            if len(data) > max_file_bytes:
                raise HTTPException(
                    status_code=413,
                    detail=f"{filename} exceeds the {max_file_bytes} bytes per-file limit",
                )
            total_bytes += len(data)
            if total_bytes > max_total_file_bytes:
                raise HTTPException(
                    status_code=413,
                    detail=f"Documents exceed the {max_total_file_bytes} bytes total limit",
                )
            sources.append((filename, data))
        try:
            return await run_in_threadpool(
                document_runner.run,
                recipe_id=recipe_id,
                files=sources,
            )
        except AnalysisError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error

    return application


app = create_app()
