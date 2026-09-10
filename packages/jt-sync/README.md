# jt-sync

Moment transport v0 for jt.

jt's core claim: what travels between people and devices is the **moment** — a
document act with its context, evidence and intention record — never a bare
file. Downloading a file strips the file of intention. This repo is the
transport that preserves it.

## What is here

- `src/envelope.ts` — the Moment envelope: document blocks + the CursorRecord
  and ReceiptRecord that produced them + provenance + transport metadata.
  Records conform to the schemas in `jt-contracts`.
- `src/hash.ts` — canonical JSON + SHA-256 over the full envelope (Web Crypto,
  browser-safe).
- `src/log.ts` — append-only per-device moment log (JSON lines), single-writer
  discipline, every append acknowledged with a delivery record carrying the
  content hash.
- `src/relay.ts` — small WebSocket relay. Two devices pair with a short
  spoken-friendly word code; moments sent from A appear in B's log with
  verified hashes.
- `src/client.ts` — client library. No node-only APIs: global `WebSocket`,
  `crypto.subtle`, and a pluggable log store, so the same code runs in a
  browser.

## Run

```sh
npm install
npm test
```

The round-trip test boots the relay in a separate OS process, pairs two
clients over localhost, sends three moments (one with a full cursor
lifecycle), and proves hash verification, ordering, intention-record
reconstruction, and tamper rejection.
## Reconnect and delivery boundary

Paired clients resume an in-process relay session after an unplanned WebSocket
loss using the same device identity and spoken pairing code. A prepared moment
keeps one ID, sequence and hash across retries, and duplicate delivery is
idempotent. The web application persists prepared moments in a device-
partitioned IndexedDB outbox before transport and removes them only after the
receiver returns a matching verified delivery record.

The relay is localhost-only and keeps sessions only in memory. Browser reload
preserves the outbox but does not yet restore pairing automatically. A deployed
relay still needs authenticated resume credentials, bounded session expiry,
durable relay coordination and multi-instance tests.
