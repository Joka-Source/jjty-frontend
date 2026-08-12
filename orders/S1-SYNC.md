# Order S1-SYNC — Moment-send v0

Sprint: 1.5h build agent sprint. Repo: `/Users/apple/projects/jt-sync`, branch `wo/s1-sync`.

## Mission

jt's core claim: what travels between people and devices is the *moment* —
a document act with its context, evidence and intention record — never a bare
file. "Downloading a file strips the file of intention." Build the transport
that preserves it.

## Scope shipped

1. **Moment envelope** (`src/envelope.ts`) — `Moment` = { document blocks,
   CursorRecord + ReceiptRecord that produced it, provenance (source id /
   title / digest / revision, author, created-at), transport metadata }.
   Cursor and receipt records conform to `jt-contracts/cursor/v0.1.0` and
   `jt-contracts/receipt/v0.1.0`; validated with ajv against the schema files
   and cross-checked against the golden fixtures in tests.
2. **Single-writer log + delivery proof** (`src/log.ts`, `src/log-file.ts`) —
   append-only JSON-lines per-device log; exclusive lock file enforces one
   writer per log; every append acknowledged with a `DeliveryRecord` carrying
   a SHA-256 content hash over the FULL envelope (canonical JSON), so the
   intention record cannot be stripped or altered without detection.
3. **Device-to-device transport v0** (`src/relay.ts`, `src/client.ts`,
   `src/pairing.ts`, `src/protocol.ts`) — WebSocket relay pairs two devices
   by a three-word spoken-friendly code (no QR — founder ruling); relay
   forwards frames verbatim, never rewrites; verification is end-to-end at
   the receiver. Client library uses only global `WebSocket`, Web Crypto and
   a pluggable log store — no node-only APIs, browser-ready.
4. **Round-trip proof** (`test/roundtrip.test.ts`) — relay booted in a
   separate OS process, two clients paired over localhost, 3 moments A→B
   (one with the full 10-state cursor lifecycle), asserting hash equality
   sender↔receiver, log ordering, byte-identical intention-record
   reconstruction (re-validated against the cursor schema on arrival),
   tamper rejection, and out-of-order replay rejection.

## Deviations / self-resolved blockers

- Order said schemas live at `jt-contracts/contracts/`; actual path is
  `jt-contracts/schemas/` (fixtures at `jt-contracts/fixtures/`). Used the
  actual path, overridable via `JT_CONTRACTS_DIR`.
- `settlement` appears in code only as a lifecycle enum value required by the
  jt-contracts cursor schema — wire-internal contract vocabulary, not UI copy.

## Definition of done

`npm test` green (10/10), `tsc --noEmit` clean, receipts/S1-SYNC.md carries
verify commands with verbatim output, all committed on `wo/s1-sync`.
