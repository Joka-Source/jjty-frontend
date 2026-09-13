# JJTY Service Platform Backend Design

## Purpose

JJTY is a service workspace. Tendering is its first production proving pack, not the product boundary. The backend must support document-heavy services such as tenders and visas through versioned service packs, persistent cases, trusted dynamic-screen contracts, capability requests, evidence receipts, human gates, and immutable audit history.

This change is backend-only. It does not modify browser, workspace, UI, style, or frontend-test files.

## Deployment shape

The first production shape is a modular monolith inside the existing FastAPI container. Domain modules have explicit interfaces but share one deployment, one authentication boundary, and one DynamoDB table. This avoids network and operational overhead while the contracts are still settling. Modules can later be separated without changing their public schemas.

The existing tender document-analysis endpoint remains available and unchanged. Platform endpoints live under `/v1/platform`. The AWS deployment uses DynamoDB for durable case state and audit events. Tests use an in-memory implementation of the same store protocol.

## Security boundary

All platform endpoints require `Authorization: Bearer <SERVICE_PLATFORM_API_TOKEN>`. The token is read only from server-side configuration and stored in AWS Secrets Manager in production. Requests also require `X-JJTY-Actor` and `X-JJTY-Actor-Kind`, recorded on every mutation.

The API never accepts executable UI code, shell commands, arbitrary browser scripts, credentials, DSC PINs, OTPs, or payment secrets. A service pack may reference only component types and capability names present in the server-owned catalogs.

Human-gated steps cannot be completed through the generic step-completion endpoint. They require the human-gate endpoint with an explicit acknowledgement and a separate `SERVICE_PLATFORM_HUMAN_APPROVAL_TOKEN`. AI and worker actors cannot confirm a human gate even if they present that credential. DSC signing, payment confirmation, and final submission are human-gated in the tender pack.

## Service packs

A service pack is immutable, versioned JSON with:

- `id`, `version`, `title`, and `description`.
- An ordered list of steps.
- Each step's trusted component surface, required fields, allowed capabilities, and optional human-gate policy.
- Pack-level allowed capabilities.

The initial registry contains:

- `tender@1.0.0`: intake, notice review, eligibility, documents, pricing, portal upload, DSC signing, payment, and final submission.
- `visa@1.0.0`: trip and applicant intake, eligibility, documents, appointment, payment, biometrics, and passport return.

The visa pack proves that the contracts are service-neutral. It does not implement a live visa-provider integration in this change.

Surfaces use a small declarative catalog: `heading`, `text`, `text_input`, `date_input`, `choice`, `document_request`, `checklist`, `money`, `evidence_list`, `capability_status`, and `human_gate`. The backend validates every bundled pack at startup.

## Case model and workflow

A case pins a service-pack version at creation. It stores the current step, completed steps, answers by step, artifact metadata, evidence metadata, capability runs, human-gate confirmations, status, timestamps, actor ownership, and a monotonically increasing revision.

Mutations use optimistic concurrency. The caller provides the current revision; stale requests return a conflict instead of overwriting newer work. Case creation requires an `Idempotency-Key`; repeating the same key returns the original case.

Normal steps advance only when all declared required fields contain non-empty values. When the next step is human-gated, the case enters `awaiting_human`. A successful human confirmation advances the workflow. Completing the last step moves the case to `complete`.

## Evidence and artifacts

The backend records metadata and receipts, not raw document bytes:

- Artifacts: name, media type, byte size, SHA-256, classification, and an opaque storage reference.
- Evidence: artifact SHA-256, page, exact quote, label, and optional structured value.

Evidence pages are one-based. SHA-256 values must be lowercase 64-character hexadecimal strings. The current tender-analysis service continues to perform page-grounding validation before findings can become evidence inputs.

## Capabilities

A capability request is a typed intent, not arbitrary code. A request contains a catalogued capability name, bounded JSON parameters, case revision, actor, and idempotency key. The engine checks that the current step and pinned pack allow the capability, then records a `queued` run.

Initial catalog:

- `document.review`
- `document.generate`
- `portal.navigate`
- `portal.upload`
- `appointment.search`
- `appointment.reserve`
- `payment.prepare`
- `signature.prepare`
- `notification.send`

This change records and exposes capability runs. External workers will claim and complete runs in a later separately authenticated worker API. No capability in this change pays, signs, books, uploads, or submits anything.

## Audit history

Every mutation appends an event containing event id, case id, sequence/revision, event type, actor, timestamp, and a bounded payload. Events are append-only through the store interface. The API exposes ordered case events to authorized callers.

## API

- `GET /v1/platform/service-packs`
- `GET /v1/platform/service-packs/{pack_id}?version=1.0.0`
- `POST /v1/platform/cases`
- `GET /v1/platform/cases/{case_id}`
- `POST /v1/platform/cases/{case_id}/artifacts`
- `POST /v1/platform/cases/{case_id}/evidence`
- `POST /v1/platform/cases/{case_id}/steps/{step_id}/complete`
- `POST /v1/platform/cases/{case_id}/human-gates/{step_id}/confirm`
- `POST /v1/platform/cases/{case_id}/capability-runs`
- `GET /v1/platform/cases/{case_id}/events`

All mutation responses return the updated case and revision.

## Failure behavior

- Invalid authentication: `401`.
- Missing actor: `400`.
- Unknown pack, case, step, or capability: `404`.
- Invalid or missing required data: `422`.
- Step order, stale revision, duplicate receipt, or human-gate violation: `409`.
- Storage failures: bounded `503` without secrets or internal exception text.

## Verification

Unit tests cover pack validation, workflow order, required fields, human gates, capability allowlists, artifact and evidence validation, idempotency, optimistic concurrency, and audit ordering. API tests exercise authentication and a complete tender case journey against the real FastAPI router and in-memory store. DynamoDB serialization is tested without AWS calls. The existing tender-intelligence tests remain green.

Production verification creates the DynamoDB table and token secret, grants the App Runner role access to only those resources, deploys the exact image, exercises an authenticated synthetic tender case, confirms an AI actor cannot pass a human gate, and verifies the persisted event history.
