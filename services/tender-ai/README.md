# JJTY service platform and tender intelligence

This service prepares source-grounded findings for the browser tender workspace.
It is advisory: it cannot sign, pay, alter the original BOQ, or submit a bid.

The same backend now hosts a service-neutral case engine under `/v1/platform`.
Tender and visa are the first immutable, versioned service packs. Their screens
are declarative data from a trusted component catalog; the backend never emits
executable UI code.

The first working slice uses [Docling](https://github.com/docling-project/docling)
locally to recover page structure and text. Every source file receives a SHA-256
receipt. A reasoning provider may return a finding only when its quoted evidence
exists on the referenced page of the referenced receipt.

## Local proof

```sh
uv sync --project services/tender-ai --python 3.12
uv run --project services/tender-ai python -m unittest discover -s services/tender-ai/tests -v
```

The first run downloads the open document models. No tender file is retained by
the analysis core or sent to a hosted model during this proof.

## Run the service

Start the local parser and advisory API:

```sh
uv run --project services/tender-ai \
  uvicorn tender_ai.api:app --host 127.0.0.1 --port 8788
```

Opening `/health` initializes Docling before it reports ready. The Kothali
workspace checks this endpoint, but uploads nothing until the user presses
**Review added documents**. The API accepts PDF, DOCX, XLSX, PPTX, HTML,
Markdown, text, CSV and common image formats. Legacy `.xls` BOQs and archives
remain in the browser workspace and are not sent to Docling.

Without model configuration, the service performs local extraction and returns
no proposed findings. To use a hosted or self-hosted JSON chat-completion
endpoint, configure all three server-side values:

```sh
export TENDER_AI_BASE_URL='https://provider.example/v1'
export TENDER_AI_MODEL='open-model-name'
export TENDER_AI_API_KEY='read-from-a-secret-store'
```

Production deployments must also configure a separate document API token. It
protects both the compatibility tender route and the generic document routes:

```sh
export TENDER_AI_DOCUMENT_API_TOKEN='read-from-a-secret-store'
```

Clients send it as `Authorization: Bearer ...`. An unset token keeps deliberate
loopback development compatible; never expose that configuration publicly.

When provider prices are known, configure all three rates in USD per million
tokens. The processing receipt then records token counts and calculated cost:

```sh
export TENDER_AI_INPUT_COST_PER_MILLION='0.10'
export TENDER_AI_CACHED_INPUT_COST_PER_MILLION='0.003'
export TENDER_AI_OUTPUT_COST_PER_MILLION='0.50'
```

The API key never enters browser storage. `TENDER_AI_ALLOWED_ORIGINS` may contain
a comma-separated allow-list and defaults to the two local workspace origins on
port 8793.

For a containerized deployment:

```sh
docker build --platform linux/amd64 -t jjty-tender-ai services/tender-ai
docker run --rm -p 127.0.0.1:8788:8788 \
  -e TENDER_AI_DOCUMENT_API_TOKEN \
  jjty-tender-ai
```

The image contains CPU-only PyTorch and prefetches its open Docling/RapidOCR
assets during the build. It runs as an unprivileged user. Docling receives
temporary files during conversion and the service removes them when parsing
finishes. The compatibility tender response contains only document receipts and
source-linked findings; its extracted page text is not returned to the browser.

## Generic document runs

`GET /v1/documents/recipes` lists trusted, versioned processing recipes.
`POST /v1/documents/runs` accepts `multipart/form-data` with `recipe_id` and one
or more `files`. Its `jjty-document-run-v1` response separates source-object,
canonical-document, structural-node, and run identities. It includes Docling
block selectors, evidence links, parser/model versions, token and cost usage,
and a deterministic SHA-256 processing receipt. The route is advisory and never
authorizes an external action.

`POST /v1/tenders/analyze` remains available as the existing compatibility
contract.

## Service platform

The platform API is enabled only when all three values are configured:

```sh
export SERVICE_PLATFORM_DYNAMODB_TABLE='jjty-service-platform'
export SERVICE_PLATFORM_API_TOKEN='read-from-a-secret-store'
export SERVICE_PLATFORM_HUMAN_APPROVAL_TOKEN='use-a-separate-protected-secret'
```

Every request under `/v1/platform` requires an `Authorization: Bearer` token,
`X-JJTY-Actor`, and `X-JJTY-Actor-Kind` (`human`, `ai`, `worker`, or `system`).
Case creation and capability requests additionally require `Idempotency-Key`.
Mutations carry `expected_revision`; stale writes return HTTP 409.

Human-gate confirmation also requires `X-JJTY-Human-Approval`. The approval
credential is deliberately different from the ordinary platform token. A
caller identifying as AI or worker is refused even if it somehow presents the
approval credential.

Platform endpoints:

- `GET /v1/platform/service-packs`
- `GET /v1/platform/service-packs/{pack_id}?version=1.0.0`
- `POST /v1/platform/cases`
- `GET /v1/platform/cases/{case_id}`
- `POST /v1/platform/cases/{case_id}/artifacts`
- `POST /v1/platform/cases/{case_id}/evidence`
- `POST /v1/platform/cases/{case_id}/steps/{step_id}/complete`
- `POST /v1/platform/cases/{case_id}/capability-runs`
- `POST /v1/platform/cases/{case_id}/human-gates/{step_id}/confirm`
- `GET /v1/platform/cases/{case_id}/events`

The DynamoDB store writes each updated case and its audit event in one
transaction. Case creation atomically records its idempotency key. Artifacts
are metadata receipts; raw files belong in an encrypted object store and the
backend accepts only their opaque storage reference and SHA-256.

## Intended boundaries

- Browser: originals, bid state, approvals, offline use, and the visible evidence trail.
- Parser worker: Docling, with PaddleOCR for difficult scans and Indian scripts.
- Reasoner adapter: a replaceable HTTP provider or a private Qwen3-VL/vLLM deployment.
- Retrieval worker: BGE-M3 when the tender corpus is large enough to need semantic search.
- Windows desk: MahaTenders, the physical DSC, payment, and final human submission.
