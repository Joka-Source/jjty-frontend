# JJTY tender intelligence

This service prepares source-grounded findings for the browser tender workspace.
It is advisory: it cannot sign, pay, alter the original BOQ, or submit a bid.

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

## Intended boundaries

- Browser: originals, bid state, approvals, offline use, and the visible evidence trail.
- Parser worker: Docling, with PaddleOCR for difficult scans and Indian scripts.
- Reasoner adapter: a replaceable HTTP provider or a private Qwen3-VL/vLLM deployment.
- Retrieval worker: BGE-M3 when the tender corpus is large enough to need semantic search.
- Windows desk: MahaTenders, the physical DSC, payment, and final human submission.
