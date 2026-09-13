# JJTY Service Platform Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add and deploy the backend service-platform core for versioned service packs, durable cases, evidence, artifacts, capability intents, human gates, and audit history without changing frontend files.

**Architecture:** Extend the existing FastAPI deployment as a modular monolith. Pure domain and workflow modules depend on a store protocol; tests use memory and AWS uses a DynamoDB implementation. A bearer-token boundary protects every new endpoint.

**Tech Stack:** Python 3.12, FastAPI, Pydantic, boto3, DynamoDB, AWS App Runner, AWS Secrets Manager, unittest.

**Spec:** `docs/superpowers/specs/2026-09-14-service-platform-backend-design.md`

## Global Constraints

- Do not modify frontend, workspace, UI, CSS, browser-test, or JavaScript files.
- Keep `/v1/tenders/analyze` behavior compatible.
- Never accept or persist credentials, DSC PINs, OTPs, or payment secrets.
- Human-gated steps cannot be completed by AI or worker actors.
- Every mutation requires actor identity, idempotency where declared, and optimistic revision checks.
- Every accepted mutation appends one immutable audit event.

---

### Task 1: Versioned service-pack registry

**Files:**
- Create: `services/tender-ai/src/tender_ai/platform/models.py`
- Create: `services/tender-ai/src/tender_ai/platform/packs.py`
- Create: `services/tender-ai/src/tender_ai/platform/__init__.py`
- Test: `services/tender-ai/tests/test_platform_packs.py`

**Interfaces:**
- Produces: `ServicePack`, `ServiceStep`, `SurfaceComponent`, `ServicePackRegistry.get(pack_id, version)`, and `ServicePackRegistry.list()`.
- Consumes: Pydantic only.

- [ ] Write tests that load `tender@1.0.0` and `visa@1.0.0`, reject unknown component and capability types, and prove that tender signing/payment/submission steps are human-gated.
- [ ] Run the focused tests and observe failure because `tender_ai.platform` does not exist.
- [ ] Implement immutable Pydantic models, trusted catalogs, startup validation, and the two built-in packs.
- [ ] Run the focused tests and confirm they pass.
- [ ] Commit the registry and tests.

### Task 2: Case engine, evidence, capabilities, and audit

**Files:**
- Create: `services/tender-ai/src/tender_ai/platform/store.py`
- Create: `services/tender-ai/src/tender_ai/platform/engine.py`
- Test: `services/tender-ai/tests/test_platform_engine.py`

**Interfaces:**
- Consumes: `ServicePackRegistry` from Task 1.
- Produces: `PlatformEngine`, `MemoryPlatformStore`, `CaseRecord`, `AuditEvent`, `ArtifactRecord`, `EvidenceRecord`, and `CapabilityRun`.

- [ ] Write tests for idempotent creation, required-field validation, ordered advancement, stale-revision rejection, SHA-256 evidence validation, capability allowlists, human-actor enforcement, and ordered audit events.
- [ ] Run the focused tests and observe failures because the engine and store are missing.
- [ ] Implement the in-memory store protocol and case engine with one revision increment and audit event per accepted mutation.
- [ ] Run the focused tests and confirm they pass.
- [ ] Commit the engine, store, and tests.

### Task 3: Authenticated FastAPI contract

**Files:**
- Create: `services/tender-ai/src/tender_ai/platform/api.py`
- Create: `services/tender-ai/src/tender_ai/platform/security.py`
- Modify: `services/tender-ai/src/tender_ai/api.py`
- Test: `services/tender-ai/tests/test_platform_api.py`

**Interfaces:**
- Consumes: `PlatformEngine` and `MemoryPlatformStore` from Task 2.
- Produces: `create_platform_router(engine, token)` and optional environment-driven platform mounting in `create_app`.

- [ ] Write API tests for missing/invalid bearer tokens, missing actors, pack retrieval, idempotent case creation, step completion, artifact/evidence recording, capability creation, human-gate refusal for AI actors, human confirmation, revision conflicts, and event retrieval.
- [ ] Run the focused tests and observe endpoint-not-found failures.
- [ ] Implement security dependencies, request models, error translation, routes, and optional mounting controlled by `SERVICE_PLATFORM_API_TOKEN`.
- [ ] Run focused platform and existing tender API tests.
- [ ] Commit the API and tests.

### Task 4: DynamoDB persistence and exact AWS deployment

**Files:**
- Modify: `services/tender-ai/pyproject.toml`
- Modify: `services/tender-ai/uv.lock`
- Create: `services/tender-ai/src/tender_ai/platform/dynamodb_store.py`
- Modify: `services/tender-ai/Dockerfile`
- Modify: `services/tender-ai/README.md`
- Test: `services/tender-ai/tests/test_dynamodb_store.py`

**Interfaces:**
- Consumes: platform record models and store protocol from Task 2.
- Produces: `DynamoDBPlatformStore`, selected when `SERVICE_PLATFORM_DYNAMODB_TABLE` is set.

- [ ] Write serialization and conditional-write tests with a recording DynamoDB client; assert case, idempotency, and event keys and stale-revision conditions.
- [ ] Run the focused test and observe failure because the DynamoDB store does not exist.
- [ ] Implement the DynamoDB store and environment selection without performing AWS calls during module import.
- [ ] Lock dependencies and run all Python tests.
- [ ] Build and smoke-test the container as its unprivileged user.
- [ ] Commit and push the exact source SHA.
- [ ] Create the DynamoDB table and service API token in AWS Secrets Manager; grant the App Runner runtime role access only to the table and the new secret.
- [ ] Build and push an immutable ECR image tagged with the source SHA, update App Runner, and wait for `RUNNING`.
- [ ] Exercise the complete authenticated synthetic tender case, prove an AI actor receives a human-gate refusal, retrieve its persisted audit history, and verify the existing grounded analysis endpoint.
- [ ] Confirm `git status` is clean and origin, local HEAD, App Runner image tag, and ECR digest identify the exact deployed artifacts.
