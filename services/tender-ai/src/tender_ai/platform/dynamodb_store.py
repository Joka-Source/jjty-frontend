from __future__ import annotations

import json
from typing import Any

from .store import AuditEvent, CaseRecord, PlatformStoreConflict


class DynamoDBPlatformStore:
    """Single-table durable store using conditional, atomic case mutations."""

    def __init__(self, client: Any, table_name: str) -> None:
        if not table_name.strip():
            raise ValueError("DynamoDB table name is required")
        self.client = client
        self.table_name = table_name.strip()

    @classmethod
    def from_environment(cls, table_name: str) -> "DynamoDBPlatformStore":
        import boto3

        return cls(boto3.client("dynamodb"), table_name)

    @staticmethod
    def _case_key(case_id: str) -> dict[str, dict[str, str]]:
        return {"pk": {"S": f"CASE#{case_id}"}, "sk": {"S": "CASE"}}

    @staticmethod
    def _case_item(case: CaseRecord) -> dict[str, dict[str, str]]:
        return {
            "pk": {"S": f"CASE#{case.id}"},
            "sk": {"S": "CASE"},
            "entity": {"S": "case"},
            "revision": {"N": str(case.revision)},
            "payload": {"S": case.model_dump_json()},
        }

    @staticmethod
    def _event_item(event: AuditEvent) -> dict[str, dict[str, str]]:
        return {
            "pk": {"S": f"CASE#{event.case_id}"},
            "sk": {"S": f"EVENT#{event.sequence:012d}"},
            "entity": {"S": "event"},
            "payload": {"S": event.model_dump_json()},
        }

    @staticmethod
    def _error_code(error: Exception) -> str | None:
        response = getattr(error, "response", None)
        if isinstance(response, dict):
            details = response.get("Error")
            if isinstance(details, dict):
                return details.get("Code")
        return None

    def create_case(
        self,
        case: CaseRecord,
        event: AuditEvent,
        idempotency_key: str,
    ) -> CaseRecord:
        idempotency_pk = f"IDEMPOTENCY#{idempotency_key}"
        try:
            self.client.transact_write_items(
                TransactItems=[
                    {
                        "Put": {
                            "TableName": self.table_name,
                            "Item": self._case_item(case),
                            "ConditionExpression": "attribute_not_exists(pk)",
                        }
                    },
                    {
                        "Put": {
                            "TableName": self.table_name,
                            "Item": self._event_item(event),
                            "ConditionExpression": "attribute_not_exists(pk)",
                        }
                    },
                    {
                        "Put": {
                            "TableName": self.table_name,
                            "Item": {
                                "pk": {"S": idempotency_pk},
                                "sk": {"S": "CASE"},
                                "entity": {"S": "idempotency"},
                                "case_id": {"S": case.id},
                            },
                            "ConditionExpression": "attribute_not_exists(pk)",
                        }
                    },
                ]
            )
            return case
        except Exception as error:
            if self._error_code(error) != "TransactionCanceledException":
                raise
            response = self.client.get_item(
                TableName=self.table_name,
                Key={"pk": {"S": idempotency_pk}, "sk": {"S": "CASE"}},
                ConsistentRead=True,
            )
            existing_id = response.get("Item", {}).get("case_id", {}).get("S")
            if not existing_id:
                raise PlatformStoreConflict("Case creation transaction conflicted") from error
            existing = self.get_case(existing_id)
            if existing is None:
                raise PlatformStoreConflict("Idempotent case record is unavailable") from error
            return existing

    def get_case(self, case_id: str) -> CaseRecord | None:
        response = self.client.get_item(
            TableName=self.table_name,
            Key=self._case_key(case_id),
            ConsistentRead=True,
        )
        payload = response.get("Item", {}).get("payload", {}).get("S")
        if not payload:
            return None
        return CaseRecord.model_validate_json(payload)

    def save_case(
        self,
        case: CaseRecord,
        *,
        expected_revision: int,
        event: AuditEvent,
    ) -> CaseRecord:
        try:
            self.client.transact_write_items(
                TransactItems=[
                    {
                        "Put": {
                            "TableName": self.table_name,
                            "Item": self._case_item(case),
                            "ConditionExpression": "revision = :expected",
                            "ExpressionAttributeValues": {
                                ":expected": {"N": str(expected_revision)}
                            },
                        }
                    },
                    {
                        "Put": {
                            "TableName": self.table_name,
                            "Item": self._event_item(event),
                            "ConditionExpression": "attribute_not_exists(pk)",
                        }
                    },
                ]
            )
            return case
        except Exception as error:
            if self._error_code(error) == "TransactionCanceledException":
                raise PlatformStoreConflict(
                    f"Case revision changed from expected revision {expected_revision}"
                ) from error
            raise

    def list_events(self, case_id: str) -> list[AuditEvent]:
        items: list[dict[str, Any]] = []
        request: dict[str, Any] = {
            "TableName": self.table_name,
            "KeyConditionExpression": "pk = :pk AND begins_with(sk, :event)",
            "ExpressionAttributeValues": {
                ":pk": {"S": f"CASE#{case_id}"},
                ":event": {"S": "EVENT#"},
            },
            "ConsistentRead": True,
            "ScanIndexForward": True,
        }
        while True:
            response = self.client.query(**request)
            items.extend(response.get("Items", ()))
            last_key = response.get("LastEvaluatedKey")
            if not last_key:
                break
            request["ExclusiveStartKey"] = last_key
        events = [
            AuditEvent.model_validate_json(item["payload"]["S"])
            for item in items
            if item.get("payload", {}).get("S")
        ]
        return sorted(events, key=lambda event: event.sequence)
