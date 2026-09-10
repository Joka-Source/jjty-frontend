# Upstream provenance

Baseline copied from TrueKrishna/jt-sync at
`ae117a81f279e51175dbfd58254264a11a0e7e19`.

The vendored relay runner now carries the same token-authenticated reconnect and revocation,
idempotent moment, protocol and bounded session-file changes as
`packages/jt-sync/src`. They are kept byte-for-
byte equal and tested from the production bundle because CI cannot assume a
separate sibling checkout. This file no longer claims an unmodified upstream
copy.

Only `src` is vendored. The root jt-web development dependencies provide the
exact tsx and ws versions used to launch the real relay in
test/sync.e2e.test.mjs on a clean hosted runner.
