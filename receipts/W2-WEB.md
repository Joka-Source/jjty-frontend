# receipt W2-WEB — proof of work

Repo: `/Users/apple/projects/jt-web` · branch `wo/w2-web` off `main` (main was 9/9).

All five integrations landed fully. The original 9 tests are still green
(one — the command-grammar test — now exercises the jt-speech path that
replaced the ad-hoc grammar, as ordered); 18 new tests were added: 27 total.

## What was fused

1. **jt-speech** (vendored `dist/` → `vendor/jt-speech/`) — `src/commands.js`
   deleted; every final transcript segment goes through `IntentStream.push`
   (`src/intents.js` adapter). All 8 intents wired to the act engine:
   highlight.this, highlight.range (two-anchor, with head/tail fallback for
   anchors that straddle a paragraph break), annotate.this, mark.important,
   undo, acts.show, document.open, send.to. **Ambiguity is asked, never
   guessed**: an `AmbiguousResult` opens a "did you mean…" prompt listing
   every candidate in plain words plus "none of these"; nothing is performed
   until the person chooses. Proven end-to-end (see e2e below).
2. **jt-connectors** (compiled isomorphic surface → `vendor/jt-connectors/`)
   — text/md/paste enter through `ingestText`/`ingestPaste`; PDFs (picked or
   dropped) through pdfjs-dist in the browser (`src/ingest.js`,
   `ingestPdfBrowser`, same per-page block + `page:N` locator shape as the
   node connector, assembled with the vendored `makeResult`). Provenance
   (sourceKind, sha-256 contentDigest of the raw bytes, byteSize, capture
   time, pageCount) is stored with the document in IndexedDB and shown under
   each document in the library panel.
3. **jt-water** (vendored `dist/` → `vendor/jt-water/`) — the marker's
   top/height are driven by `glide` samplers on rAF (`src/motion.js`); the
   CSS top/height transition was removed. Act confirmation is a small
   `disturb` ripple on the acted block. Node tests assert the water
   guarantees through the app's own adapter: monotonic approach, zero
   overshoot, retarget-from-flight, strictly decaying ripple energy,
   `comeToRest` at the predictable point.
4. **jt-core wasm** — rebuilt with `wasm-pack build --target web`
   (`PATH=/opt/homebrew/opt/rustup/bin:$PATH`), pkg vendored →
   `vendor/jt-core/`. `src/engine.js` exposes one interface with two
   implementations; `test/parity.test.mjs` drives the sim's exact word feed
   (misheard readings + commands + the ambiguous range phrase) through both
   and asserts identical block sequences and **bit-identical** confidence
   scores. Parity passed, so the default engine is now **wasm**
   (`?engine=js` opts back; automatic fallback to js if wasm fails to load,
   said aloud in the status line). The browser e2e runs on the wasm default.
5. **jt-sync** (compiled browser-safe client → `vendor/jt-sync/`) — "send
   this to <three words>" and a send button on every kept act. Pairing is by
   the three-spoken-word code only (no QR anything). The relay runs as a
   separate node process from jt-sync. Received moments land in an "arrived
   from other devices" inbox with provenance, the receipt's plain-words
   result, a hash-verified badge, and the full envelope inspectable.

## Verify — full suite (verbatim)

Command: `npm test` (includes both headless e2e tests; Chrome required)

```
> jt-web@0.1.0 test
> node --test test/*.test.mjs

✔ sim replay: records created, schema-valid, undo works (4819.784375ms)
✔ text ingestion returns blocks with provenance (digest + byte size) (6.246625ms)
✔ paste ingestion carries provenance too (1.071541ms)
✔ pdf page text assembly matches the node connector's algorithm (0.674917ms)
✔ pdf ingestion: per-page blocks, page locators, provenance from raw bytes (1.533ms)
✔ all eight jt-speech intents map onto app commands (14.906417ms)
✔ plain prose stays reading — no phantom commands (3.707417ms)
✔ ambiguity maps to ask and never to an act (0.792208ms)
✔ evidence rides along on every intent (0.913125ms)
✔ matcher finds a read passage despite mishearings (3.834125ms)
✔ command grammar (jt-speech intents) (7.358417ms)
✔ glide approaches the target monotonically and never overshoots (0.791084ms)
✔ retargeting mid-flight re-glides from the current position (0.202792ms)
✔ confirmation ripple energy strictly decays — the water always calms (0.146958ms)
✔ comeToRest stops at the predictable resting point (0.106875ms)
✔ parity: JS matcher and wasm engine emit identical block sequences (68.953875ms)
✔ parity: wasm cursor record validators agree with the vendored schemas (1.711417ms)
✔ golden cursor fixtures validate (1.778417ms)
✔ golden receipt fixtures validate (0.869292ms)
✔ makeCursor output validates against cursor.schema.json (1.095ms)
✔ makeReceipt output validates against receipt.schema.json (0.139459ms)
✔ every act kind produces a valid cursor + receipt pair (0.417834ms)
✔ undo entries reference the reversed act (0.172709ms)
✔ moment-send: pair two pages by spoken words, send a kept act, verify (5539.270625ms)
✔ spoken recipient words become a valid pair code — or honestly nothing (0.538791ms)
✔ a kept act becomes a full moment: blocks, records, provenance (3.262541ms)
✔ without stored provenance the digest is computed, never omitted (7.700083ms)
ℹ tests 27
ℹ suites 0
ℹ pass 27
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 5818.972083
```

27 = the original 9 (with the grammar test moved onto jt-speech) + 18 new.

### Parity result

`✔ parity: JS matcher and wasm engine emit identical block sequences` — the
sim's exact word feed produces the same emission count, the same block at
every emission, and `assert.equal` on the raw f64 confidence at every
emission (bit-identical, jt-core's determinism claim). The test also
asserts the feed traverses blocks 3 and 4, so it cannot pass vacuously.
This test is the gate that flipped the default engine to wasm.

### Two-page sync e2e

`✔ moment-send: pair two pages by spoken words, send a kept act, verify` —
what it does and asserts, in order:

- boots `jt-sync`'s relay as a real node process (`npx tsx src/relay-main.ts 0`,
  port parsed from its announcement line)
- page A runs the sim (kept acts exist), page B is a plain second page
- A `syncOpen()` → three-word code asserted to be spoken-shaped
  (`/^[a-z]+-[a-z]+-[a-z]+$/`); B joins with the words as spoken
  ("amber brook cedar", spaces not dashes)
- A sends its latest kept act; asserts `delivered === true` and
  `hashMatch === true` (receiver's recomputed sha-256 over the full
  envelope equals the sender's)
- B's inbox holds the moment: `verified === true`, content hash equals the
  sender's local hash, blocks non-empty, provenance carries the source
  digest and title
- the intention record survived transit: the arrived cursor and receipt
  both validate against the vendored jt-contracts schemas with ajv, and
  `capturedEvidence` is intact
- B's inbox UI shows the plain-words `verified` badge

### Browser e2e (extended sim replay)

The original sim-replay test now additionally asserts: engine is `wasm`;
the sim document carries jt-connectors provenance (`sha256:…`, byteSize);
the final ambiguous utterance ("highlight from rent is due to the deposit
to the final inspection", two valid splits) surfaced as an **ask** with ≥2
candidates and **no act was performed**; the "did you mean…" prompt is
visible; choosing a candidate then — and only then — performs the range
highlight (blocks 3–4), whose cursor and receipt validate; the prompt
clears.

## Build (verbatim)

Command: `npx vite build`

```
vite v8.2.1 building client environment for production...
transforming...✓ 46 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                              2.83 kB │ gzip:   1.14 kB
dist/assets/jt_core_bg-DllRKYj6.wasm       333.17 kB │ gzip: 157.32 kB
dist/assets/pdf.worker.min-CHFwMXne.mjs  1,262.39 kB
dist/assets/index-BOcyNph0.css               6.47 kB │ gzip:   1.93 kB
dist/assets/jt_core_bg-CJHBLLcm.js           0.06 kB │ gzip:   0.08 kB
dist/assets/pdf.worker.min-C8Ts8bNu.js       0.06 kB │ gzip:   0.08 kB
dist/assets/jt_core-CtLh492r.js              5.71 kB │ gzip:   2.12 kB
dist/assets/index-_8QLfDK6.js               47.95 kB │ gzip:  17.56 kB
dist/assets/pdf-BRN4rsFP.js                427.30 kB │ gzip: 127.39 kB

✓ built in 184ms
```

(pdfjs and its worker are lazy chunks — loaded only when a PDF arrives.)

## Vendoring (no registry publishes)

- `vendor/jt-speech/` — jt-speech `npm run build` output (tsc dist)
- `vendor/jt-connectors/` — tsc-compiled isomorphic surface only
  (`src/core`, `src/connectors`, `src/index.ts`); node-only connectors not
  shipped to the browser
- `vendor/jt-water/` — jt-water dist
- `vendor/jt-core/` — freshly rebuilt `wasm-pack build --target web` pkg
- `vendor/jt-sync/` — tsc-compiled browser-safe files (client, envelope,
  hash, log, pairing, protocol); the relay stays a node process in jt-sync

## Notes and honest edges

- Ambiguous range anchors may straddle paragraph breaks ("rent is due to
  the deposit"); anchor resolution retries with the phrase head/tail
  (≥3 words) before giving up aloud ("couldn't find those words").
- The inbox persists to IndexedDB (`inbox` store, DB v2); channel state is
  per-session (v0, one channel at a time).
- `document.open` matches by title substring against the library.
- Banned-vocabulary sweep done on UI copy: history is "what happened",
  records are shown as "full record", sync copy says "share with another
  device" / "arrived from other devices"; wire names (cursor/receipt/
  moment) appear only in records people ask to inspect, matching S1's
  precedent. Pairing is spoken words only; nothing QR-shaped exists.
