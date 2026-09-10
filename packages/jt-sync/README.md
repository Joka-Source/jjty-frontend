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

The relay is localhost-only. With no session-file argument it keeps sessions in
memory. `npm run relay -- 8787 /private/path/sessions.json 86400000` enables an
atomic mode-0600 JSON session file and a bounded TTL. The restart test proves
that fresh clients can resume both sides after the relay OS process is replaced;
expired pairings are rejected in both loaded and long-running processes. The
file contains pairing codes, device IDs and SHA-256 resume-token digests and
must remain outside Git and team-shared documents. Each device receives a
different random 256-bit resume token. The spoken code and device ID alone are
rejected on resume; raw resume tokens are never written to the relay file.
Either authenticated device can revoke the pairing. Revocation removes the
durable relay record, notifies the connected peer, stops automatic reconnect
and invalidates both tokens. The browser's “forget pairing” action confirms
that arrived moments and saved outbox items remain local before doing this.

Browser reload restores the paired device and rebuilds send/receive sequence
counters from its durable log before resuming. A deployed relay still needs
account-bound credentials, encrypted server-side custody,
durable multi-instance coordination and production deployment tests. This
local file is a reliability proof, not production identity or authorization.
