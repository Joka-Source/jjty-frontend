# receipt S1-WEB — proof of work

Repo: `/Users/apple/projects/jt-web` · branch `wo/s1-web` (skeleton on `main`).

## Build (verbatim)

Command: `npm run build`

```
> jt-web@0.1.0 build
> vite build

vite v8.2.1 building client environment for production...
transforming...✓ 11 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                  2.04 kB │ gzip: 0.93 kB
dist/assets/index-CcosITvE.css   4.72 kB │ gzip: 1.62 kB
dist/assets/index-BcIPQleS.js   15.65 kB │ gzip: 6.26 kB

✓ built in 102ms
```

## Test run (verbatim)

Command: `npm test`

```
> jt-web@0.1.0 test
> node --test test/*.test.mjs

✔ sim replay: records created, schema-valid, undo works (7465.879375ms)
✔ matcher finds a read passage despite mishearings (12.052834ms)
✔ command grammar (0.867583ms)
✔ golden cursor fixtures validate (3.892792ms)
✔ golden receipt fixtures validate (2.361792ms)
✔ makeCursor output validates against cursor.schema.json (2.168917ms)
✔ makeReceipt output validates against receipt.schema.json (0.586541ms)
✔ every act kind produces a valid cursor + receipt pair (0.448458ms)
✔ undo entries reference the reversed act (0.310041ms)
ℹ tests 9
ℹ suites 0
ℹ pass 9
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 7905.778
```

## What the headless act-replay asserts (test/e2e.test.mjs)

Serves `dist/` via `vite preview --host 127.0.0.1 --port 4931`, drives the
installed Google Chrome headless with puppeteer-core at
`/?sim=1&fast=1`, waits for `#jt-report`, then asserts:

- transcript matches > 0; blocks 3 and 4 both reached by the glide despite
  scripted mishearings ("grays" for grace, "the posit" for deposit,
  "inspections" for inspection)
- spoken commands recognized in order: `highlight`, `note`, `important`, `undo`
- exactly 3 act entries + 1 undo entry persisted
- the `important` act is marked undone; the undo entry's `undoes` field equals
  its id; survivors are `highlight` and `note`
- highlight landed on block 3, note on block 4; match confidence on the
  highlight act > 0.6; every entry carries spoken evidence
- every cursor and every receipt in the replay validates against the vendored
  jt-contracts schemas with ajv (draft 2020-12, formats on)

Golden fixtures from jt-contracts (`contracts/fixtures/`) validate under the
same compiled validators, so our validators match upstream's expectations.

## Visual verification (dev server, `?sim=1`, real time)

Watched in the browser: marker glided to "Rent is due on the first…" during
the read; "highlight this" left a persistent highlight with a history entry
showing heard/matched text and 72% match; note attached under the deposit
block; "mark this important" then "undo" produced a struck-through entry plus
an "undone — block 4 · reverses evt-…" entry. Reloading the page re-applied
surviving effects from IndexedDB.

## Blockers hit and resolved (depth ≤ 2)

1. `vite preview` (vite 8) binds only `localhost`/IPv6 by default — headless
   fetch of `127.0.0.1` failed. Fixed by passing `--host 127.0.0.1`.
2. Chrome `--dump-dom --virtual-time-budget` dumped before the sim finished:
   virtual time does not wait on IndexedDB's real async completion, so boot
   never progressed. Replaced the dump-dom approach with puppeteer-core
   driving the installed Chrome and an explicit `waitForSelector("#jt-report")`.

## Not tested (stated honestly)

Live microphone input cannot be exercised headlessly; the mic path is the
same `onInterim`/`onFinalSegment` pipeline the sim drives, but ASR quality in
the wild is unverified in this sprint.
