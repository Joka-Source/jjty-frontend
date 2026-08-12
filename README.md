# jt-connectors

Connector library for jt. Every way material enters jt goes through a connector, and every
connector returns the same shape: an `IngestResult` — content blocks plus a non-optional
provenance record (source kind, uri/name, sha-256 content digest, byte size, capture time,
title) and any warnings raised on the way in.

Nothing enters jt as a stripped file. Provenance is the point.

## Connectors

| Connector | Runs in | Entry |
|---|---|---|
| Plain text / Markdown | browser + node | `src/connectors/text.ts` |
| Paste (text/html, text/plain) | browser + node | `src/connectors/paste.ts` |
| PDF (per-page blocks) | node | `src/node/pdf.ts` |
| URL → readable article | node | `src/node/url.ts` |
| .docx | node | `src/node/docx.ts` |

Isomorphic connectors live in `src/connectors/` and `src/core/` (no node builtins beyond
WebCrypto, which browsers also provide). Node-only connectors live in `src/node/`.

## Shape

Every connector resolves to an `IngestResult` that validates against
`src/schema/ingestresult.schema.json` (JSON Schema draft 2020-12, same conventions as
jt-contracts). The conformance test enforces this for every connector.

## Use

```bash
npm install
npm test
npx tsx src/cli.ts <path-or-url>   # prints the IngestResult as JSON
```
