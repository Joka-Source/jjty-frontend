# Shared server integration

`src/server.js` speaks the existing backend application contract, version 1.3.
It is a transport client, not an alternative action engine. The PDF reader now
has an explicit server connection panel. Local IndexedDB receipts do not
establish server work.

A PDF goes through authenticated upload and attach. Upload and attachment
hashes must match the input SHA-256. The returned context is used unchanged.
Reader viewport/selection updates must replace that context with the returned
version before contextual commands. Submission may already apply a deterministic
reversible action; other outcomes must be shown explicitly. Render server work
from the revision-qualified projection, using PDF-user-space geometry.
Undo uses the projection's operation and work version, then reads it again.

The client retains the complete request envelope in memory. `retry(requestId)`
replays that exact snapshot, including the deadline and scene. Reusing the ID
with a changed instruction/context fails locally. `forgetRequest` releases a
settled request. The UI saves the complete pending envelope with the local
document before sending. Reconnecting after reload offers an explicit retry of
that envelope. Expired deadlines retain their original value and return the
server result; retries never silently create a new instruction.

Credentials are caller-supplied, kept in the client closure, and sent only to
the configured origin. Redirects are rejected. Remote origins require HTTPS;
HTTP is allowed only on loopback. Nothing is uploaded automatically by importing
the module. The connection UI names the server and document before an explicit
upload click. It stores the remote object identity, never the token. Reopening
that copy verifies its source digest. Commands explicitly select a whole PDF
page; local text selections and local notes are not sent. Proposals show the
quoted target and require Apply or Cancel. Server marks render from authoritative
revision-qualified geometry; undo reads the resulting projection again.

## Local verification

The sibling backend must be running with isolated test storage and its documented
development identity (actor-1 / tenant-1 / project-1). The proof script enforces
loopback and requires an explicitly supplied fixture and token:

```sh
JETT_SERVER_TOKEN=jtty-local-development node scripts/verify-server.mjs \
  http://127.0.0.1:8000 ../backend/tests/fixtures/frontier-gdp-evidence-brief.pdf
```

The supplied fixture is synthetic. The script requires no existing annotations,
verifies downloaded original bytes, applies one mark, retries without duplication,
reattaches, reads geometry, undoes and checks the source remains unchanged.
An interrupted failed proof can leave a synthetic mark; inspect and undo that
specific operation before rerunning. Never clear unrelated work to pass a test.

## Current limits

The backend production composition refuses to start without admitted production
adapters. Its deterministic development credentials are not account support.
Only PDF attach is supported. Markdown/image sync, accounts, cross-device
synchronization and self-hosted production setup remain outstanding. This is an
advanced connection panel, not account onboarding or a background sync service.
A recovered proposal without its full target evidence can only be cancelled.
The pending journal currently retains one request per document/server link.

The transport proof covers same-process reattach. Separate backend tests exercise
actual domain-process restart and recovery, but no browser-restart-to-server
journey was covered by the browser proof below. This does not establish recovery
of every operation across a simultaneous browser and backend process restart. An initial live runtime exit was observed once;
subsequent direct and HTTP runs passed. Its root cause remains unproven, and
normal structured logs currently omit the child runtime's diagnostic detail.

## Browser evidence

`node scripts/verify-server-ui.mjs` uses a private browser and synthetic PDF.
It verifies no automatic upload, explicit upload, original hash validation,
visible server geometry, a lost response followed by reload and exact retry
without duplication, reconnect readback, undo, no persisted token, and a narrow
mobile viewport. `node scripts/verify-server-proposal.mjs` generates a unique
synthetic PDF and verifies quoted proposal review, no premature mark, Apply,
Undo and Cancel without an effect. Both passed against the isolated local API.
These are local HTTP/browser proofs, not physical microphone or production proof.
