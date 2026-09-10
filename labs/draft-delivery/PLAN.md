# Draft and delivery interaction lab

Authorized continuation: Human issue #5 and founder request to continue all workstreams, 10 September 2026. This is an original learning implementation alongside the existing JETT application, not a Slack clone or production identity service.

Design: a shared research-note composer with two explicit synthetic participants. A pure Node SQLite store owns notes, per-participant drafts and idempotent append operations. HTTP sessions are generated for fixture personas; the UI explains that choosing a persona is simulated login. The server binds loopback and accepts only same-origin mutation requests. A failed/lost response must never silently duplicate an operation. Version conflict keeps the draft and requires review; retry reuses the same operation ID. A source panel links implementation modules and displays state transitions without private content.

Files: store.mjs (transactions and validation), server.mjs (local HTTP/static files/session adapter), index.html and client.mjs (accessible original UI), test/store.test.mjs and test/server.test.mjs (restart, concurrency, idempotency, permissions, input limits), README.md (exact run/use/limitations).

Acceptance: draft survives SQLite close/reopen; failed or conflicting append preserves draft; exact retry returns the first operation; operation-ID payload mismatch is rejected; fixture participant cannot read another participant's private note; app shows pending/failed/saved distinctly; real browser uses both fixture sessions and tests lost response and stale revision. No remote production service or teammate message is touched.

Product application: retain the existing document-first JETT goal. This lab teaches preservation of intention and explicit confirmed state; adoption into document editing must preserve its source-digest/target validation and existing save queue. Full product integration remains issue #5.
