from __future__ import annotations

from .models import ServicePack, ServicePackSummary


def _component(
    component_id: str,
    component_type: str,
    label: str,
    *,
    binding: str | None = None,
    **properties: object,
) -> dict[str, object]:
    value: dict[str, object] = {
        "id": component_id,
        "type": component_type,
        "label": label,
    }
    if binding:
        value["binding"] = binding
    if properties:
        value["properties"] = properties
    return value


TENDER_PACK = ServicePack.model_validate(
    {
        "id": "tender",
        "version": "1.0.0",
        "title": "Tender application",
        "description": "Prepare, review, and submit a public procurement bid with human approval at every consequential action.",
        "capabilities": [
            "document.review",
            "document.generate",
            "portal.navigate",
            "portal.upload",
            "payment.prepare",
            "signature.prepare",
            "notification.send",
        ],
        "steps": [
            {
                "id": "intake",
                "title": "Project details",
                "summary": "Identify the authority, district, and work before processing documents.",
                "required_fields": ["project_name", "department", "district"],
                "surface": [
                    _component("project-name", "text_input", "Project name", binding="project_name"),
                    _component("department", "text_input", "Department", binding="department"),
                    _component("district", "text_input", "District", binding="district"),
                ],
            },
            {
                "id": "notice-review",
                "title": "Notice review",
                "summary": "Extract deadlines, fees, eligibility conditions, and source-linked risks.",
                "capabilities": ["document.review"],
                "surface": [
                    _component("notice", "document_request", "Tender notice", accepted=["pdf", "docx"]),
                    _component("findings", "evidence_list", "Source-linked findings"),
                    _component("review-state", "capability_status", "Document review"),
                ],
            },
            {
                "id": "eligibility",
                "title": "Eligibility",
                "summary": "Compare mandatory conditions with firm evidence and require human review.",
                "required_fields": ["eligibility_reviewed"],
                "surface": [
                    _component("eligibility-list", "checklist", "Eligibility checklist", binding="eligibility_reviewed"),
                    _component("eligibility-evidence", "evidence_list", "Eligibility evidence"),
                ],
            },
            {
                "id": "documents",
                "title": "Bid documents",
                "summary": "Collect and generate the technical and commercial document set.",
                "capabilities": ["document.review", "document.generate"],
                "surface": [
                    _component("document-set", "document_request", "Required documents", multiple=True),
                    _component("document-status", "capability_status", "Document preparation"),
                ],
            },
            {
                "id": "pricing",
                "title": "Pricing",
                "summary": "Prepare the BOQ and record the reviewed bid amount.",
                "required_fields": ["reviewed_bid_amount"],
                "surface": [
                    _component("bid-amount", "money", "Reviewed bid amount", binding="reviewed_bid_amount", currency="INR"),
                    _component("pricing-checks", "checklist", "Pricing review"),
                ],
            },
            {
                "id": "portal-upload",
                "title": "Portal preparation",
                "summary": "Navigate the portal and prepare uploads while preserving user control.",
                "capabilities": ["portal.navigate", "portal.upload"],
                "surface": [
                    _component("portal-state", "capability_status", "Portal session"),
                    _component("upload-evidence", "evidence_list", "Upload receipts"),
                ],
            },
            {
                "id": "dsc-signing",
                "title": "Digital signature",
                "summary": "Prepare the DSC interaction and hand control to an authorized human.",
                "capabilities": ["signature.prepare"],
                "human_gate": {
                    "prompt": "Confirm that the authorized firm signatory is present and is choosing to use the DSC.",
                },
                "surface": [_component("dsc-gate", "human_gate", "Authorized DSC confirmation")],
            },
            {
                "id": "payment",
                "title": "Tender payment",
                "summary": "Prepare payable fees and require a human to approve the transaction.",
                "capabilities": ["payment.prepare"],
                "human_gate": {"prompt": "Confirm the amount and authorize the tender payment."},
                "surface": [_component("payment-gate", "human_gate", "Payment confirmation")],
            },
            {
                "id": "final-submission",
                "title": "Final submission",
                "summary": "Show the final packet and require an explicit human submission decision.",
                "capabilities": ["notification.send"],
                "human_gate": {"prompt": "Confirm that the final bid packet may be submitted."},
                "surface": [
                    _component("submission-checks", "checklist", "Final checks"),
                    _component("submission-gate", "human_gate", "Submit this bid"),
                ],
            },
        ],
    }
)


VISA_PACK = ServicePack.model_validate(
    {
        "id": "visa",
        "version": "1.0.0",
        "title": "Visa application",
        "description": "Prepare a visa case across eligibility, documents, appointments, payment, and passport handling.",
        "capabilities": [
            "document.review",
            "document.generate",
            "portal.navigate",
            "portal.upload",
            "appointment.search",
            "appointment.reserve",
            "payment.prepare",
            "notification.send",
        ],
        "steps": [
            {
                "id": "trip-and-applicant",
                "title": "Trip and applicant",
                "summary": "Collect destination, travel date, and nationality.",
                "required_fields": ["destination", "departure_date", "nationality"],
                "surface": [
                    _component("destination", "choice", "Destination", binding="destination"),
                    _component("departure", "date_input", "Departure date", binding="departure_date"),
                    _component("nationality", "text_input", "Nationality", binding="nationality"),
                ],
            },
            {
                "id": "eligibility",
                "title": "Eligibility",
                "summary": "Assess the route and expose uncertainty for human review.",
                "capabilities": ["document.review"],
                "surface": [
                    _component("route", "text", "Recommended application route"),
                    _component("eligibility-evidence", "evidence_list", "Eligibility sources"),
                ],
            },
            {
                "id": "documents",
                "title": "Documents",
                "summary": "Collect, review, and prepare the required application evidence.",
                "capabilities": ["document.review", "document.generate"],
                "surface": [
                    _component("visa-documents", "document_request", "Required documents", multiple=True),
                    _component("visa-document-state", "capability_status", "Document readiness"),
                ],
            },
            {
                "id": "appointment",
                "title": "Appointment",
                "summary": "Search availability and require human approval before reserving.",
                "capabilities": ["appointment.search", "appointment.reserve", "portal.navigate"],
                "human_gate": {"prompt": "Confirm the selected centre, date, time, and reservation terms."},
                "surface": [
                    _component("appointment-options", "choice", "Available appointments"),
                    _component("appointment-gate", "human_gate", "Reserve this appointment"),
                ],
            },
            {
                "id": "payment",
                "title": "Visa payment",
                "summary": "Prepare the exact fee and require the applicant to approve payment.",
                "capabilities": ["payment.prepare"],
                "human_gate": {"prompt": "Confirm the visa fee and payment recipient."},
                "surface": [_component("visa-payment-gate", "human_gate", "Pay visa fee")],
            },
            {
                "id": "biometrics",
                "title": "Biometrics",
                "summary": "Record the human appointment outcome without storing biometric data.",
                "human_gate": {"prompt": "Confirm attendance; do not upload biometric data."},
                "surface": [_component("biometrics-gate", "human_gate", "Biometrics attended")],
            },
            {
                "id": "passport-return",
                "title": "Passport return",
                "summary": "Track the passport handback and close the case with human confirmation.",
                "capabilities": ["notification.send"],
                "human_gate": {"prompt": "Confirm that the passport has been returned to the applicant."},
                "surface": [_component("passport-gate", "human_gate", "Passport received")],
            },
        ],
    }
)


class ServicePackRegistry:
    def __init__(self, packs: tuple[ServicePack, ...]) -> None:
        self._packs = {(pack.id, pack.version): pack for pack in packs}
        if len(self._packs) != len(packs):
            raise ValueError("Service pack id and version pairs must be unique")

    @classmethod
    def default(cls) -> "ServicePackRegistry":
        return cls((TENDER_PACK, VISA_PACK))

    def list(self) -> list[ServicePackSummary]:
        return [
            ServicePackSummary(
                id=pack.id,
                version=pack.version,
                title=pack.title,
                description=pack.description,
            )
            for pack in sorted(self._packs.values(), key=lambda item: (item.id, item.version))
        ]

    def get(self, pack_id: str, version: str) -> ServicePack:
        try:
            return self._packs[(pack_id, version)]
        except KeyError as error:
            raise KeyError(f"Unknown service pack {pack_id}@{version}") from error
