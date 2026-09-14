from __future__ import annotations

import json
from collections.abc import Callable
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from .packs import ServicePackRegistry
from .store import (
    Actor,
    ArtifactRecord,
    AuditEvent,
    CapabilityRun,
    CaseRecord,
    EvidenceRecord,
    HumanGateConfirmation,
    PlatformStore,
    PlatformStoreConflict,
)


class PlatformError(RuntimeError):
    pass


class PlatformNotFound(PlatformError):
    pass


class PlatformConflict(PlatformError):
    pass


class PlatformValidation(PlatformError):
    pass


_SENSITIVE_KEYS = {
    "api_key",
    "card_number",
    "credential",
    "credentials",
    "cvv",
    "dsc_pin",
    "otp",
    "password",
    "pin",
    "secret",
    "token",
}


def _contains_sensitive_key(value: Any) -> bool:
    if isinstance(value, dict):
        for key, child in value.items():
            normalized = str(key).strip().lower().replace("-", "_")
            if normalized in _SENSITIVE_KEYS or _contains_sensitive_key(child):
                return True
    elif isinstance(value, (list, tuple)):
        return any(_contains_sensitive_key(child) for child in value)
    return False


class PlatformEngine:
    def __init__(
        self,
        registry: ServicePackRegistry,
        store: PlatformStore,
        *,
        clock: Callable[[], datetime] | None = None,
        id_factory: Callable[[], str] | None = None,
    ) -> None:
        self.registry = registry
        self.store = store
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self.id_factory = id_factory or (lambda: uuid4().hex)

    def _now(self) -> str:
        return self.clock().astimezone(timezone.utc).isoformat().replace("+00:00", "Z")

    def _id(self, prefix: str) -> str:
        return f"{prefix}_{self.id_factory()}"

    @staticmethod
    def _require_text(value: str, name: str, *, maximum: int = 240) -> str:
        cleaned = value.strip()
        if not cleaned or len(cleaned) > maximum:
            raise PlatformValidation(f"{name} must contain 1 to {maximum} characters")
        return cleaned

    def _pack(self, pack_id: str, pack_version: str):
        try:
            return self.registry.get(pack_id, pack_version)
        except KeyError as error:
            raise PlatformNotFound(str(error)) from error

    def get_case(self, case_id: str) -> CaseRecord:
        case = self.store.get_case(case_id)
        if case is None:
            raise PlatformNotFound(f"Unknown case {case_id}")
        return case

    def events(self, case_id: str) -> list[AuditEvent]:
        self.get_case(case_id)
        return self.store.list_events(case_id)

    def create_case(
        self,
        *,
        pack_id: str,
        pack_version: str,
        actor: Actor,
        idempotency_key: str,
    ) -> CaseRecord:
        key = self._require_text(idempotency_key, "Idempotency key", maximum=200)
        pack = self._pack(pack_id, pack_version)
        now = self._now()
        case = CaseRecord(
            id=self._id("case"),
            pack_id=pack.id,
            pack_version=pack.version,
            owner=actor,
            status="awaiting_human" if pack.steps[0].human_gate else "in_progress",
            current_step_id=pack.steps[0].id,
            revision=1,
            created_at=now,
            updated_at=now,
        )
        event = AuditEvent(
            id=self._id("event"),
            case_id=case.id,
            sequence=1,
            type="case.created",
            actor=actor,
            occurred_at=now,
            payload={"pack_id": pack.id, "pack_version": pack.version},
        )
        return self.store.create_case(case, event, key)

    def _current_step(self, case: CaseRecord):
        pack = self._pack(case.pack_id, case.pack_version)
        if case.current_step_id is None:
            raise PlatformConflict("Case is already complete")
        for index, step in enumerate(pack.steps):
            if step.id == case.current_step_id:
                return pack, index, step
        raise PlatformConflict("Case references a step absent from its pinned pack")

    @staticmethod
    def _check_revision(case: CaseRecord, expected_revision: int) -> None:
        if case.revision != expected_revision:
            raise PlatformConflict(
                f"Case revision is {case.revision}; expected revision {expected_revision}"
            )

    def _save(
        self,
        previous: CaseRecord,
        updated: CaseRecord,
        *,
        event_type: str,
        actor: Actor,
        payload: dict[str, Any],
    ) -> CaseRecord:
        event = AuditEvent(
            id=self._id("event"),
            case_id=updated.id,
            sequence=updated.revision,
            type=event_type,
            actor=actor,
            occurred_at=updated.updated_at,
            payload=payload,
        )
        try:
            return self.store.save_case(
                updated,
                expected_revision=previous.revision,
                event=event,
            )
        except PlatformStoreConflict as error:
            raise PlatformConflict(str(error)) from error

    def _advanced_values(self, case: CaseRecord, step_index: int, pack) -> dict[str, Any]:
        next_index = step_index + 1
        if next_index >= len(pack.steps):
            return {"current_step_id": None, "status": "complete"}
        next_step = pack.steps[next_index]
        return {
            "current_step_id": next_step.id,
            "status": "awaiting_human" if next_step.human_gate else "in_progress",
        }

    def complete_step(
        self,
        case_id: str,
        step_id: str,
        *,
        data: dict[str, Any],
        actor: Actor,
        expected_revision: int,
    ) -> CaseRecord:
        case = self.get_case(case_id)
        self._check_revision(case, expected_revision)
        pack, step_index, step = self._current_step(case)
        if step_id != step.id:
            raise PlatformConflict(f"{step_id} is not the current step")
        if step.human_gate:
            raise PlatformConflict(f"{step.id} is human-gated")
        bindings = {component.binding for component in step.surface if component.binding}
        unknown = set(data) - bindings
        if unknown:
            raise PlatformValidation(f"Unknown fields for {step.id}: {sorted(unknown)}")
        missing = [
            field
            for field in step.required_fields
            if field not in data or data[field] is None or data[field] == "" or data[field] == []
        ]
        if missing:
            raise PlatformValidation(f"Missing required fields: {', '.join(missing)}")
        if _contains_sensitive_key(data):
            raise PlatformValidation("Credentials, PINs, OTPs, and payment secrets are not accepted")
        now = self._now()
        answers = {**case.answers, step.id: data}
        advanced = self._advanced_values(case, step_index, pack)
        updated = case.model_copy(
            update={
                **advanced,
                "answers": answers,
                "completed_steps": (*case.completed_steps, step.id),
                "revision": case.revision + 1,
                "updated_at": now,
            }
        )
        return self._save(
            case,
            updated,
            event_type="step.completed",
            actor=actor,
            payload={"step_id": step.id, "fields": sorted(data)},
        )

    def add_artifact(
        self,
        case_id: str,
        *,
        name: str,
        media_type: str,
        size: int,
        sha256: str,
        classification: str,
        storage_ref: str,
        actor: Actor,
        expected_revision: int,
    ) -> CaseRecord:
        case = self.get_case(case_id)
        self._check_revision(case, expected_revision)
        if any(artifact.sha256 == sha256 for artifact in case.artifacts):
            raise PlatformConflict(f"Artifact receipt {sha256} is already registered")
        now = self._now()
        try:
            artifact = ArtifactRecord(
                id=self._id("artifact"),
                name=self._require_text(name, "Artifact name", maximum=500),
                media_type=self._require_text(media_type, "Media type", maximum=200),
                size=size,
                sha256=sha256,
                classification=classification,
                storage_ref=self._require_text(storage_ref, "Storage reference", maximum=1000),
                created_at=now,
                actor=actor,
            )
        except ValueError as error:
            raise PlatformValidation(str(error)) from error
        updated = case.model_copy(
            update={
                "artifacts": (*case.artifacts, artifact),
                "revision": case.revision + 1,
                "updated_at": now,
            }
        )
        return self._save(
            case,
            updated,
            event_type="artifact.registered",
            actor=actor,
            payload={"artifact_id": artifact.id, "sha256": artifact.sha256},
        )

    def add_evidence(
        self,
        case_id: str,
        *,
        artifact_sha256: str,
        page: int,
        quote: str,
        label: str,
        value: str | None,
        actor: Actor,
        expected_revision: int,
    ) -> CaseRecord:
        case = self.get_case(case_id)
        self._check_revision(case, expected_revision)
        if not any(artifact.sha256 == artifact_sha256 for artifact in case.artifacts):
            raise PlatformValidation("Evidence must reference a known artifact receipt")
        now = self._now()
        try:
            evidence = EvidenceRecord(
                id=self._id("evidence"),
                artifact_sha256=artifact_sha256,
                page=page,
                quote=quote.strip(),
                label=label.strip(),
                value=value.strip() if value else None,
                created_at=now,
                actor=actor,
            )
        except ValueError as error:
            raise PlatformValidation(str(error)) from error
        updated = case.model_copy(
            update={
                "evidence": (*case.evidence, evidence),
                "revision": case.revision + 1,
                "updated_at": now,
            }
        )
        return self._save(
            case,
            updated,
            event_type="evidence.registered",
            actor=actor,
            payload={"evidence_id": evidence.id, "artifact_sha256": artifact_sha256, "page": page},
        )

    def request_capability(
        self,
        case_id: str,
        *,
        name: str,
        parameters: dict[str, Any],
        actor: Actor,
        expected_revision: int,
        idempotency_key: str,
    ) -> CaseRecord:
        case = self.get_case(case_id)
        key = self._require_text(idempotency_key, "Idempotency key", maximum=200)
        if any(run.idempotency_key == key for run in case.capability_runs):
            return case
        self._check_revision(case, expected_revision)
        _pack, _step_index, step = self._current_step(case)
        if name not in step.capabilities:
            raise PlatformConflict(f"Capability {name} is not allowed on the current step")
        if _contains_sensitive_key(parameters):
            raise PlatformValidation("Capability parameters cannot contain credentials or secrets")
        try:
            encoded = json.dumps(parameters, ensure_ascii=False, separators=(",", ":"))
        except (TypeError, ValueError) as error:
            raise PlatformValidation("Capability parameters must be JSON values") from error
        if len(encoded) > 16_384:
            raise PlatformValidation("Capability parameters exceed 16384 characters")
        now = self._now()
        run = CapabilityRun(
            id=self._id("run"),
            name=name,
            step_id=step.id,
            parameters=parameters,
            idempotency_key=key,
            requested_at=now,
            actor=actor,
        )
        updated = case.model_copy(
            update={
                "capability_runs": (*case.capability_runs, run),
                "revision": case.revision + 1,
                "updated_at": now,
            }
        )
        return self._save(
            case,
            updated,
            event_type="capability.requested",
            actor=actor,
            payload={"run_id": run.id, "name": run.name, "step_id": run.step_id},
        )

    def confirm_human_gate(
        self,
        case_id: str,
        step_id: str,
        *,
        acknowledgement: bool,
        actor: Actor,
        expected_revision: int,
    ) -> CaseRecord:
        case = self.get_case(case_id)
        self._check_revision(case, expected_revision)
        pack, step_index, step = self._current_step(case)
        if step_id != step.id:
            raise PlatformConflict(f"{step_id} is not the current step")
        if step.human_gate is None:
            raise PlatformConflict(f"{step.id} is not a human gate")
        if actor.kind != "human":
            raise PlatformConflict("A human actor must confirm this gate")
        if acknowledgement is not True:
            raise PlatformValidation("Human gate acknowledgement must be true")
        now = self._now()
        confirmation = HumanGateConfirmation(
            step_id=step.id,
            acknowledged_at=now,
            actor=actor,
        )
        advanced = self._advanced_values(case, step_index, pack)
        updated = case.model_copy(
            update={
                **advanced,
                "completed_steps": (*case.completed_steps, step.id),
                "human_gates": (*case.human_gates, confirmation),
                "revision": case.revision + 1,
                "updated_at": now,
            }
        )
        return self._save(
            case,
            updated,
            event_type="human_gate.confirmed",
            actor=actor,
            payload={"step_id": step.id},
        )


__all__ = [
    "Actor",
    "PlatformConflict",
    "PlatformEngine",
    "PlatformError",
    "PlatformNotFound",
    "PlatformValidation",
]
