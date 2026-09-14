from __future__ import annotations

import unittest

from tender_ai.platform.engine import (
    Actor,
    PlatformConflict,
    PlatformEngine,
    PlatformValidation,
)
from tender_ai.platform.packs import ServicePackRegistry
from tender_ai.platform.store import MemoryPlatformStore


DIGEST = "a" * 64


class PlatformEngineTests(unittest.TestCase):
    def setUp(self) -> None:
        self.store = MemoryPlatformStore()
        self.engine = PlatformEngine(ServicePackRegistry.default(), self.store)
        self.human = Actor(id="founder", kind="human")

    def create_tender(self, key: str = "create-tender-1"):
        return self.engine.create_case(
            pack_id="tender",
            pack_version="1.0.0",
            actor=self.human,
            idempotency_key=key,
        )

    def test_case_creation_is_idempotent_and_audited(self) -> None:
        first = self.create_tender()
        repeated = self.create_tender()

        self.assertEqual(first.id, repeated.id)
        self.assertEqual(first.revision, 1)
        self.assertEqual(first.current_step_id, "intake")
        events = self.engine.events(first.id)
        self.assertEqual([event.type for event in events], ["case.created"])
        self.assertEqual(events[0].actor.id, "founder")

    def test_steps_require_declared_fields_order_and_current_revision(self) -> None:
        case = self.create_tender()
        with self.assertRaisesRegex(PlatformValidation, "project_name"):
            self.engine.complete_step(
                case.id,
                "intake",
                data={"department": "PWD", "district": "Jalgaon"},
                actor=self.human,
                expected_revision=case.revision,
            )
        with self.assertRaisesRegex(PlatformConflict, "current step"):
            self.engine.complete_step(
                case.id,
                "eligibility",
                data={"eligibility_reviewed": ["PWD registration"]},
                actor=self.human,
                expected_revision=case.revision,
            )

        advanced = self.engine.complete_step(
            case.id,
            "intake",
            data={
                "project_name": "Kothali concrete road and gutter",
                "department": "PWD",
                "district": "Jalgaon",
            },
            actor=self.human,
            expected_revision=case.revision,
        )
        self.assertEqual(advanced.current_step_id, "notice-review")
        self.assertEqual(advanced.revision, 2)
        with self.assertRaisesRegex(PlatformConflict, "revision"):
            self.engine.complete_step(
                case.id,
                "notice-review",
                data={},
                actor=self.human,
                expected_revision=case.revision,
            )

    def test_artifacts_and_evidence_require_valid_receipts(self) -> None:
        case = self.create_tender()
        case = self.engine.add_artifact(
            case.id,
            name="Tendernotice_1.pdf",
            media_type="application/pdf",
            size=818,
            sha256=DIGEST,
            classification="firm-confidential",
            storage_ref="s3://jjty-artifacts/case/source.pdf",
            actor=self.human,
            expected_revision=case.revision,
        )
        case = self.engine.add_evidence(
            case.id,
            artifact_sha256=DIGEST,
            page=1,
            quote="Earnest money deposit: INR 50,000.",
            label="Earnest money deposit",
            value="INR 50,000",
            actor=self.human,
            expected_revision=case.revision,
        )

        self.assertEqual(case.evidence[0].artifact_sha256, DIGEST)
        self.assertEqual(case.evidence[0].page, 1)
        with self.assertRaisesRegex(PlatformValidation, "known artifact"):
            self.engine.add_evidence(
                case.id,
                artifact_sha256="b" * 64,
                page=1,
                quote="Unknown source",
                label="Unknown",
                value=None,
                actor=self.human,
                expected_revision=case.revision,
            )
        with self.assertRaisesRegex(PlatformConflict, "already registered"):
            self.engine.add_artifact(
                case.id,
                name="copy.pdf",
                media_type="application/pdf",
                size=818,
                sha256=DIGEST,
                classification="firm-confidential",
                storage_ref="s3://jjty-artifacts/case/copy.pdf",
                actor=self.human,
                expected_revision=case.revision,
            )

    def test_capabilities_are_step_scoped_and_idempotent(self) -> None:
        case = self.create_tender()
        with self.assertRaisesRegex(PlatformConflict, "current step"):
            self.engine.request_capability(
                case.id,
                name="document.review",
                parameters={"artifact_sha256": DIGEST},
                actor=self.human,
                expected_revision=case.revision,
                idempotency_key="review-1",
            )
        case = self.engine.complete_step(
            case.id,
            "intake",
            data={"project_name": "Kothali", "department": "PWD", "district": "Jalgaon"},
            actor=self.human,
            expected_revision=case.revision,
        )
        requested = self.engine.request_capability(
            case.id,
            name="document.review",
            parameters={"artifact_sha256": DIGEST},
            actor=self.human,
            expected_revision=case.revision,
            idempotency_key="review-1",
        )
        repeated = self.engine.request_capability(
            case.id,
            name="document.review",
            parameters={"artifact_sha256": DIGEST},
            actor=self.human,
            expected_revision=case.revision,
            idempotency_key="review-1",
        )

        self.assertEqual(len(requested.capability_runs), 1)
        self.assertEqual(requested.capability_runs[0].status, "queued")
        self.assertEqual(requested.revision, repeated.revision)
        self.assertEqual(
            [event.type for event in self.engine.events(case.id)].count("capability.requested"),
            1,
        )

    def test_only_a_human_can_confirm_human_gates(self) -> None:
        case = self.create_tender()
        steps = [
            ("intake", {"project_name": "Kothali", "department": "PWD", "district": "Jalgaon"}),
            ("notice-review", {}),
            ("eligibility", {"eligibility_reviewed": ["PWD registration"]}),
            ("documents", {}),
            ("pricing", {"reviewed_bid_amount": "1250000"}),
            ("portal-upload", {}),
        ]
        for step_id, data in steps:
            case = self.engine.complete_step(
                case.id,
                step_id,
                data=data,
                actor=self.human,
                expected_revision=case.revision,
            )

        self.assertEqual(case.current_step_id, "dsc-signing")
        self.assertEqual(case.status, "awaiting_human")
        with self.assertRaisesRegex(PlatformConflict, "human-gated"):
            self.engine.complete_step(
                case.id,
                "dsc-signing",
                data={},
                actor=self.human,
                expected_revision=case.revision,
            )
        with self.assertRaisesRegex(PlatformConflict, "human actor"):
            self.engine.confirm_human_gate(
                case.id,
                "dsc-signing",
                acknowledgement=True,
                actor=Actor(id="qwen", kind="ai"),
                expected_revision=case.revision,
            )

        confirmed = self.engine.confirm_human_gate(
            case.id,
            "dsc-signing",
            acknowledgement=True,
            actor=self.human,
            expected_revision=case.revision,
        )
        self.assertEqual(confirmed.current_step_id, "payment")
        self.assertEqual(confirmed.status, "awaiting_human")
        events = self.engine.events(case.id)
        self.assertEqual([event.sequence for event in events], list(range(1, len(events) + 1)))


if __name__ == "__main__":
    unittest.main()
