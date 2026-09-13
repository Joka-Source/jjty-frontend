from __future__ import annotations

import json
import unittest

from tender_ai.platform.dynamodb_store import DynamoDBPlatformStore
from tender_ai.platform.store import Actor, AuditEvent, CaseRecord, PlatformStoreConflict


class RecordingDynamoDB:
    def __init__(self) -> None:
        self.transactions: list[dict] = []
        self.get_responses: list[dict] = []
        self.query_response: dict = {"Items": []}
        self.fail_transactions = False

    def transact_write_items(self, **request):
        self.transactions.append(request)
        if self.fail_transactions:
            error = RuntimeError("transaction cancelled")
            error.response = {"Error": {"Code": "TransactionCanceledException"}}
            raise error
        return {}

    def get_item(self, **_request):
        return self.get_responses.pop(0) if self.get_responses else {}

    def query(self, **_request):
        return self.query_response


def records(revision: int = 1):
    actor = Actor(id="founder", kind="human")
    case = CaseRecord(
        id="case_123",
        pack_id="tender",
        pack_version="1.0.0",
        owner=actor,
        status="in_progress",
        current_step_id="intake",
        revision=revision,
        created_at="2026-09-14T00:00:00Z",
        updated_at="2026-09-14T00:00:00Z",
    )
    event = AuditEvent(
        id=f"event_{revision}",
        case_id=case.id,
        sequence=revision,
        type="case.created" if revision == 1 else "step.completed",
        actor=actor,
        occurred_at="2026-09-14T00:00:00Z",
        payload={},
    )
    return case, event


class DynamoDBPlatformStoreTests(unittest.TestCase):
    def test_create_case_writes_case_event_and_idempotency_atomically(self) -> None:
        client = RecordingDynamoDB()
        store = DynamoDBPlatformStore(client, "jjty-service-platform")
        case, event = records()

        returned = store.create_case(case, event, "create-kothali-1")

        self.assertEqual(returned, case)
        transaction = client.transactions[0]["TransactItems"]
        self.assertEqual(len(transaction), 3)
        case_put, event_put, key_put = [item["Put"] for item in transaction]
        self.assertEqual(case_put["Item"]["pk"], {"S": "CASE#case_123"})
        self.assertEqual(case_put["Item"]["sk"], {"S": "CASE"})
        self.assertEqual(case_put["Item"]["revision"], {"N": "1"})
        self.assertEqual(event_put["Item"]["sk"], {"S": "EVENT#000000000001"})
        self.assertEqual(key_put["Item"]["pk"], {"S": "IDEMPOTENCY#create-kothali-1"})
        self.assertEqual(json.loads(case_put["Item"]["payload"]["S"])["pack_id"], "tender")

    def test_save_uses_revision_condition_and_maps_conflict(self) -> None:
        client = RecordingDynamoDB()
        store = DynamoDBPlatformStore(client, "jjty-service-platform")
        case, event = records(revision=2)

        store.save_case(case, expected_revision=1, event=event)

        case_put = client.transactions[0]["TransactItems"][0]["Put"]
        self.assertEqual(case_put["ConditionExpression"], "revision = :expected")
        self.assertEqual(case_put["ExpressionAttributeValues"], {":expected": {"N": "1"}})

        client.fail_transactions = True
        with self.assertRaisesRegex(PlatformStoreConflict, "revision"):
            store.save_case(case, expected_revision=1, event=event)

    def test_reads_case_and_ordered_events_from_json_payloads(self) -> None:
        client = RecordingDynamoDB()
        store = DynamoDBPlatformStore(client, "jjty-service-platform")
        case, first = records()
        _, second = records(revision=2)
        client.get_responses = [
            {"Item": {"payload": {"S": case.model_dump_json()}}},
        ]
        client.query_response = {
            "Items": [
                {"payload": {"S": second.model_dump_json()}},
                {"payload": {"S": first.model_dump_json()}},
            ]
        }

        self.assertEqual(store.get_case(case.id), case)
        events = store.list_events(case.id)
        self.assertEqual([event.sequence for event in events], [1, 2])


if __name__ == "__main__":
    unittest.main()
