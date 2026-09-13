from __future__ import annotations

from collections.abc import Callable
from typing import Any, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, ConfigDict, Field

from .engine import (
    PlatformConflict,
    PlatformEngine,
    PlatformNotFound,
    PlatformValidation,
)
from .security import PlatformSecurity
from .store import Actor


class StrictRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CaseCreateRequest(StrictRequest):
    pack_id: str = Field(min_length=1, max_length=80)
    pack_version: str = Field(pattern=r"^\d+\.\d+\.\d+$")


class StepCompleteRequest(StrictRequest):
    expected_revision: int = Field(ge=1)
    data: dict[str, Any] = Field(default_factory=dict)


class ArtifactCreateRequest(StrictRequest):
    expected_revision: int = Field(ge=1)
    name: str
    media_type: str
    size: int
    sha256: str
    classification: Literal["public", "firm-confidential", "personal-sensitive"]
    storage_ref: str


class EvidenceCreateRequest(StrictRequest):
    expected_revision: int = Field(ge=1)
    artifact_sha256: str
    page: int
    quote: str
    label: str
    value: str | None = None


class CapabilityRequest(StrictRequest):
    expected_revision: int = Field(ge=1)
    name: str
    parameters: dict[str, Any] = Field(default_factory=dict)


class HumanGateRequest(StrictRequest):
    expected_revision: int = Field(ge=1)
    acknowledgement: bool


def _invoke(call: Callable[[], Any]) -> Any:
    try:
        return call()
    except PlatformNotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except PlatformConflict as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except PlatformValidation as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except (OSError, TimeoutError) as error:
        raise HTTPException(status_code=503, detail="Platform storage is unavailable") from error


def create_platform_router(
    engine: PlatformEngine,
    *,
    token: str,
    human_approval_token: str,
) -> APIRouter:
    router = APIRouter(prefix="/v1/platform", tags=["service-platform"])
    security = PlatformSecurity(token, human_approval_token)
    bearer = security.bearer()

    async def actor_dependency(
        credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
        actor_id: str | None = Header(default=None, alias="X-JJTY-Actor"),
        actor_kind: str | None = Header(default=None, alias="X-JJTY-Actor-Kind"),
    ) -> Actor:
        return await security.actor(credentials, actor_id, actor_kind)

    @router.get("/service-packs")
    def list_service_packs(_actor: Actor = Depends(actor_dependency)):
        return engine.registry.list()

    @router.get("/service-packs/{pack_id}")
    def get_service_pack(
        pack_id: str,
        version: str = "1.0.0",
        _actor: Actor = Depends(actor_dependency),
    ):
        return _invoke(lambda: engine._pack(pack_id, version))

    @router.post("/cases", status_code=status.HTTP_201_CREATED)
    def create_case(
        request: CaseCreateRequest,
        actor: Actor = Depends(actor_dependency),
        idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    ):
        if not idempotency_key:
            raise HTTPException(status_code=400, detail="Idempotency-Key is required")
        return _invoke(
            lambda: engine.create_case(
                pack_id=request.pack_id,
                pack_version=request.pack_version,
                actor=actor,
                idempotency_key=idempotency_key,
            )
        )

    @router.get("/cases/{case_id}")
    def get_case(case_id: str, _actor: Actor = Depends(actor_dependency)):
        return _invoke(lambda: engine.get_case(case_id))

    @router.post("/cases/{case_id}/steps/{step_id}/complete")
    def complete_step(
        case_id: str,
        step_id: str,
        request: StepCompleteRequest,
        actor: Actor = Depends(actor_dependency),
    ):
        return _invoke(
            lambda: engine.complete_step(
                case_id,
                step_id,
                data=request.data,
                actor=actor,
                expected_revision=request.expected_revision,
            )
        )

    @router.post("/cases/{case_id}/artifacts")
    def register_artifact(
        case_id: str,
        request: ArtifactCreateRequest,
        actor: Actor = Depends(actor_dependency),
    ):
        return _invoke(
            lambda: engine.add_artifact(
                case_id,
                name=request.name,
                media_type=request.media_type,
                size=request.size,
                sha256=request.sha256,
                classification=request.classification,
                storage_ref=request.storage_ref,
                actor=actor,
                expected_revision=request.expected_revision,
            )
        )

    @router.post("/cases/{case_id}/evidence")
    def register_evidence(
        case_id: str,
        request: EvidenceCreateRequest,
        actor: Actor = Depends(actor_dependency),
    ):
        return _invoke(
            lambda: engine.add_evidence(
                case_id,
                artifact_sha256=request.artifact_sha256,
                page=request.page,
                quote=request.quote,
                label=request.label,
                value=request.value,
                actor=actor,
                expected_revision=request.expected_revision,
            )
        )

    @router.post("/cases/{case_id}/capability-runs", status_code=status.HTTP_201_CREATED)
    def request_capability(
        case_id: str,
        request: CapabilityRequest,
        actor: Actor = Depends(actor_dependency),
        idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    ):
        if not idempotency_key:
            raise HTTPException(status_code=400, detail="Idempotency-Key is required")
        return _invoke(
            lambda: engine.request_capability(
                case_id,
                name=request.name,
                parameters=request.parameters,
                actor=actor,
                expected_revision=request.expected_revision,
                idempotency_key=idempotency_key,
            )
        )

    @router.post("/cases/{case_id}/human-gates/{step_id}/confirm")
    def confirm_human_gate(
        case_id: str,
        step_id: str,
        request: HumanGateRequest,
        actor: Actor = Depends(actor_dependency),
        approval: str | None = Header(default=None, alias="X-JJTY-Human-Approval"),
    ):
        security.confirm_human_approval(approval)
        return _invoke(
            lambda: engine.confirm_human_gate(
                case_id,
                step_id,
                acknowledgement=request.acknowledgement,
                actor=actor,
                expected_revision=request.expected_revision,
            )
        )

    @router.get("/cases/{case_id}/events")
    def list_events(case_id: str, _actor: Actor = Depends(actor_dependency)):
        return _invoke(lambda: engine.events(case_id))

    return router
