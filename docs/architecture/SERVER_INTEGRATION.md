# Shared server integration

`src/server.js` speaks the existing backend application contract, version 1.3.
It is a transport client, not an alternative action engine. The reader UI is
not connected to it yet. Local IndexedDB receipts do not establish server work.

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
settled request. This is not a durable outbox: browser restart requires a future
persisted request journal and explicit handling of expired deadlines.

Credentials are caller-supplied, kept in the client closure, and sent only to
the configured origin. Redirects are rejected. Remote origins require HTTPS;
HTTP is allowed only on loopback. Nothing is uploaded automatically by importing
the module. A product connection UI must show the chosen server and what document
will leave before upload. Do not silently upload existing library content.

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
Only PDF attach is supported. Markdown/image sync, accounts, remote rendering,
and self-hosted production setup remain outstanding. The web connection needs
explicit upload consent, persisted remote identity, version-qualified geometry,
offline recovery, proposal presentation and honest server-result status.

The transport proof covers same-process reattach. Separate backend tests exercise
actual domain-process restart and recovery, but no browser-restart-to-server
journey has yet been implemented. An initial live runtime exit was observed once;
subsequent direct and HTTP runs passed. Its root cause remains unproven, and
normal structured logs currently omit the child runtime's diagnostic detail.
