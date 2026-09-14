from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


TRUSTED_COMPONENT_TYPES = frozenset(
    {
        "heading",
        "text",
        "text_input",
        "date_input",
        "choice",
        "document_request",
        "checklist",
        "money",
        "evidence_list",
        "capability_status",
        "human_gate",
    }
)

TRUSTED_CAPABILITIES = frozenset(
    {
        "document.review",
        "document.generate",
        "portal.navigate",
        "portal.upload",
        "appointment.search",
        "appointment.reserve",
        "payment.prepare",
        "signature.prepare",
        "notification.send",
    }
)


class SurfaceComponent(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    id: str = Field(min_length=1, max_length=80, pattern=r"^[a-z][a-z0-9-]*$")
    type: str
    label: str = Field(min_length=1, max_length=200)
    binding: str | None = Field(default=None, max_length=120)
    properties: dict[str, Any] = Field(default_factory=dict)

    @field_validator("type")
    @classmethod
    def validate_type(cls, value: str) -> str:
        if value not in TRUSTED_COMPONENT_TYPES:
            raise ValueError(f"Untrusted surface component type: {value}")
        return value


class HumanGatePolicy(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    actor_kind: Literal["human"] = "human"
    acknowledgement: Literal[True] = True
    prompt: str = Field(min_length=1, max_length=500)


class ServiceStep(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    id: str = Field(min_length=1, max_length=80, pattern=r"^[a-z][a-z0-9-]*$")
    title: str = Field(min_length=1, max_length=160)
    summary: str = Field(min_length=1, max_length=500)
    surface: tuple[SurfaceComponent, ...]
    required_fields: tuple[str, ...] = ()
    capabilities: tuple[str, ...] = ()
    human_gate: HumanGatePolicy | None = None

    @field_validator("capabilities")
    @classmethod
    def validate_capabilities(cls, values: tuple[str, ...]) -> tuple[str, ...]:
        unknown = set(values) - TRUSTED_CAPABILITIES
        if unknown:
            raise ValueError(f"Untrusted capabilities: {sorted(unknown)}")
        if len(values) != len(set(values)):
            raise ValueError("Step capabilities must be unique")
        return values

    @model_validator(mode="after")
    def validate_surface(self) -> "ServiceStep":
        component_ids = [component.id for component in self.surface]
        if not component_ids:
            raise ValueError("Every step requires a surface")
        if len(component_ids) != len(set(component_ids)):
            raise ValueError("Surface component ids must be unique within a step")
        bindings = {component.binding for component in self.surface if component.binding}
        missing_bindings = set(self.required_fields) - bindings
        if missing_bindings:
            raise ValueError(
                f"Required fields need surface bindings: {sorted(missing_bindings)}"
            )
        return self


class ServicePack(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    id: str = Field(min_length=1, max_length=80, pattern=r"^[a-z][a-z0-9-]*$")
    version: str = Field(pattern=r"^\d+\.\d+\.\d+$")
    title: str = Field(min_length=1, max_length=160)
    description: str = Field(min_length=1, max_length=500)
    capabilities: tuple[str, ...] = ()
    steps: tuple[ServiceStep, ...]

    @field_validator("capabilities")
    @classmethod
    def validate_capabilities(cls, values: tuple[str, ...]) -> tuple[str, ...]:
        unknown = set(values) - TRUSTED_CAPABILITIES
        if unknown:
            raise ValueError(f"Untrusted capabilities: {sorted(unknown)}")
        if len(values) != len(set(values)):
            raise ValueError("Pack capabilities must be unique")
        return values

    @model_validator(mode="after")
    def validate_steps(self) -> "ServicePack":
        step_ids = [step.id for step in self.steps]
        if not step_ids:
            raise ValueError("Every service pack requires at least one step")
        if len(step_ids) != len(set(step_ids)):
            raise ValueError("Service step ids must be unique")
        allowed = set(self.capabilities)
        for step in self.steps:
            unavailable = set(step.capabilities) - allowed
            if unavailable:
                raise ValueError(
                    f"Step {step.id} uses capabilities absent from its pack: "
                    f"{sorted(unavailable)}"
                )
        return self


class ServicePackSummary(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    id: str
    version: str
    title: str
    description: str
