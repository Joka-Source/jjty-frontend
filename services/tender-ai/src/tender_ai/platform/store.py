from __future__ import annotations

from threading import RLock
from typing import Any, Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field


ActorKind = Literal["human", "ai", "worker", "system"]
CaseStatus = Literal["in_progress", "awaiting_human", "complete"]


class Actor(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    id: str = Field(min_length=1, max_length=160)
    kind: ActorKind


class ArtifactRecord(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    id: str
    name: str
    media_type: str
    size: int = Field(ge=1, le=5 * 1024 * 1024 * 1024)
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    classification: Literal["public", "firm-confidential", "personal-sensitive"]
    storage_ref: str
    created_at: str
    actor: Actor


class EvidenceRecord(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    id: str
    artifact_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    page: int = Field(ge=1)
    quote: str = Field(min_length=1, max_length=4000)
    label: str = Field(min_length=1, max_length=240)
    value: str | None = Field(default=None, max_length=1000)
    created_at: str
    actor: Actor


class CapabilityRun(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    id: str
    name: str
    step_id: str
    status: Literal["queued", "running", "succeeded", "failed"] = "queued"
    parameters: dict[str, Any]
    idempotency_key: str
    requested_at: str
    actor: Actor


class HumanGateConfirmation(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    step_id: str
    acknowledged_at: str
    actor: Actor


class CaseRecord(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    id: str
    pack_id: str
    pack_version: str
    owner: Actor
    status: CaseStatus
    current_step_id: str | None
    completed_steps: tuple[str, ...] = ()
    answers: dict[str, dict[str, Any]] = Field(default_factory=dict)
    artifacts: tuple[ArtifactRecord, ...] = ()
    evidence: tuple[EvidenceRecord, ...] = ()
    capability_runs: tuple[CapabilityRun, ...] = ()
    human_gates: tuple[HumanGateConfirmation, ...] = ()
    revision: int = Field(ge=1)
    created_at: str
    updated_at: str


class AuditEvent(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    id: str
    case_id: str
    sequence: int = Field(ge=1)
    type: str
    actor: Actor
    occurred_at: str
    payload: dict[str, Any] = Field(default_factory=dict)


class PlatformStoreConflict(RuntimeError):
    pass


class PlatformStore(Protocol):
    def create_case(
        self,
        case: CaseRecord,
        event: AuditEvent,
        idempotency_key: str,
    ) -> CaseRecord: ...

    def get_case(self, case_id: str) -> CaseRecord | None: ...

    def save_case(
        self,
        case: CaseRecord,
        *,
        expected_revision: int,
        event: AuditEvent,
    ) -> CaseRecord: ...

    def list_events(self, case_id: str) -> list[AuditEvent]: ...


class MemoryPlatformStore:
    def __init__(self) -> None:
        self._cases: dict[str, CaseRecord] = {}
        self._create_keys: dict[str, str] = {}
        self._events: dict[str, list[AuditEvent]] = {}
        self._lock = RLock()

    def create_case(
        self,
        case: CaseRecord,
        event: AuditEvent,
        idempotency_key: str,
    ) -> CaseRecord:
        with self._lock:
            existing_id = self._create_keys.get(idempotency_key)
            if existing_id:
                return self._cases[existing_id]
            self._cases[case.id] = case
            self._create_keys[idempotency_key] = case.id
            self._events[case.id] = [event]
            return case

    def get_case(self, case_id: str) -> CaseRecord | None:
        with self._lock:
            return self._cases.get(case_id)

    def save_case(
        self,
        case: CaseRecord,
        *,
        expected_revision: int,
        event: AuditEvent,
    ) -> CaseRecord:
        with self._lock:
            current = self._cases.get(case.id)
            if current is None:
                raise KeyError(case.id)
            if current.revision != expected_revision:
                raise PlatformStoreConflict(
                    f"Case revision changed from {expected_revision} to {current.revision}"
                )
            if case.revision != expected_revision + 1 or event.sequence != case.revision:
                raise ValueError("Case and event revisions must advance exactly once")
            self._cases[case.id] = case
            self._events[case.id].append(event)
            return case

    def list_events(self, case_id: str) -> list[AuditEvent]:
        with self._lock:
            return list(self._events.get(case_id, ()))
