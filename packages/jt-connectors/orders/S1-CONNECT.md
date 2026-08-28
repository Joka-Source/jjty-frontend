# Order S1-CONNECT

Sprint: 1.5 hours. Founder ask: "all of the connectors and whatever possible" — the ways
documents and material enter jt as moments with provenance, never as stripped files.

## Scope

Ship a connector library where every connector returns the same `IngestResult` shape:

- `blocks`: `[{ text, index, kind }]` (plus an optional locator, e.g. `page:3`)
- `provenance`: source kind, uri/name, sha-256 content digest, byte size,
  captured-at timestamp, title — **non-optional**
- `warnings`: `[]`

Connectors in priority order (ship as many as fully work):

1. Plain text / markdown — string or bytes → blocks; paragraph split, heading detection for md.
2. PDF — pdfjs-dist legacy build in node → per-page text blocks with page locators;
   hermetic test against a PDF generated in-repo by a script.
3. URL → readable article — fetch + @mozilla/readability + jsdom → titled blocks;
   tests use local fixture HTML served from disk, no live network.
4. Clipboard/paste — text/html → cleaned blocks (tags stripped, structure kept);
   text/plain passthrough.
5. .docx (bonus) — mammoth → blocks.

## Cross-cutting requirements

- Every connector unit-tested, including at least one malformed-input test.
- Conformance test: every connector's output validates against a single IngestResult
  JSON Schema (draft 2020-12, jt-contracts conventions) defined in-repo.
- Hashes reproducible: same input → same digest.
- CLI: `npx tsx src/cli.ts <path-or-url>` prints the IngestResult.
- TypeScript; isomorphic where possible; node-only parts clearly separated.
- No pushes to any remote; work on branch `wo/s1-connect`.

## Vocabulary bans (user-facing)

No "Margin" as a name, no "locus", no settle/recede/receipt as UI nouns, no sea/drops/shells
as product nouns, no QR anything.

## Proof of work

`receipts/S1-CONNECT.md` with verify commands and verbatim output: full test run and a CLI
sample run on a real file.
