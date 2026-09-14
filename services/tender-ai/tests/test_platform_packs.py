from __future__ import annotations

import unittest

from pydantic import ValidationError

from tender_ai.platform.models import ServicePack
from tender_ai.platform.packs import ServicePackRegistry


class ServicePackRegistryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.registry = ServicePackRegistry.default()

    def test_exposes_versioned_tender_and_visa_packs(self) -> None:
        summaries = self.registry.list()

        self.assertEqual(
            [(item.id, item.version) for item in summaries],
            [("tender", "1.0.0"), ("visa", "1.0.0")],
        )
        tender = self.registry.get("tender", "1.0.0")
        visa = self.registry.get("visa", "1.0.0")
        self.assertEqual(tender.steps[0].id, "intake")
        self.assertEqual(visa.steps[0].id, "trip-and-applicant")

    def test_tender_signature_payment_and_submission_are_human_gated(self) -> None:
        tender = self.registry.get("tender", "1.0.0")
        steps = {step.id: step for step in tender.steps}

        for step_id in ("dsc-signing", "payment", "final-submission"):
            self.assertTrue(steps[step_id].human_gate)
            self.assertEqual(steps[step_id].human_gate.actor_kind, "human")
            self.assertTrue(steps[step_id].human_gate.acknowledgement)

    def test_rejects_untrusted_components_and_capabilities(self) -> None:
        base = self.registry.get("tender", "1.0.0").model_dump(mode="json")
        base["id"] = "unsafe"
        base["steps"][0]["surface"][0]["type"] = "javascript"
        with self.assertRaises(ValidationError):
            ServicePack.model_validate(base)

        base = self.registry.get("tender", "1.0.0").model_dump(mode="json")
        base["id"] = "unsafe-capability"
        base["capabilities"].append("shell.execute")
        with self.assertRaises(ValidationError):
            ServicePack.model_validate(base)


if __name__ == "__main__":
    unittest.main()
