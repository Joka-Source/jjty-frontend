from __future__ import annotations

import os
from collections.abc import Callable
from pathlib import Path
from typing import Any, Protocol

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .analysis import AnalysisError, analyze_documents

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

    return HTTPJSONReasoner(base_url=base_url, model=model, api_key=api_key)


def create_app(
    *,
    parser: Parser | None = None,
    reasoner: Callable[[list[dict[str, Any]]], dict[str, Any]] | None = None,
    max_file_bytes: int = 50 * 1024 * 1024,
    max_documents: int = 20,
    platform_engine: "PlatformEngine | None" = None,
    platform_token: str | None = None,
    human_approval_token: str | None = None,
) -> FastAPI:
    selected_parser = parser or LazyDoclingParser()
    selected_reasoner = reasoner or _reasoner_from_environment()
    application = FastAPI(
        title="JJTY tender intelligence",
        version="0.1.0",
        description="Self-hosted, source-grounded advisory analysis for tender documents.",
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
    async def analyze(files: list[UploadFile] = File(...)) -> dict[str, Any]:
        if not files:
            raise HTTPException(status_code=400, detail="At least one tender document is required")
        if len(files) > max_documents:
            raise HTTPException(
                status_code=400,
                detail=f"Choose no more than {max_documents} documents at once",
            )

        sources: list[tuple[str, bytes]] = []
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

            return analyze_documents(
                sources,
                parse=parse_source,
                reason=selected_reasoner,
            )
        except AnalysisError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error

    return application


app = create_app()
