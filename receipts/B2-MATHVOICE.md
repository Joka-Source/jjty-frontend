# receipt B2-MATHVOICE — spoken mathematics kept as real jt acts

Repo: `/Users/apple/projects/blitz/b2-mathvoice` · branch
`blitz/b2-mathvoice` · start
`635fb3272b0c468d2bd7f1a0e76cb10f7ff6b081` (35/35).

Result at verification: **40/40 tests pass** — all 35 starting tests, four new
math unit tests, and one named math-voice e2e subtest inside the established
real sim journey. Production build exits 0.

## Decision record

- With no document open, the first keep creates `spoken mathematics`; later
  keeps reuse it. Provenance is `sourceKind: "spoken"`, `createdBy: "voice"`,
  with a fresh SHA-256 content digest and byte size. Appends increment the
  document revision while preserving the original capture time.
- With a reading document open, keep requires the current block and anchors
  there. It never silently chooses block zero.
- Math is `act: "math"` through the existing `makeActEntry` and act engine,
  not a parallel store and not a mislabeled note. The wrapper keeps exact
  speech, LaTeX, and unparsed words; the existing cursor and receipt remain
  schema-pure.
- `math mode` / `start math mode` enter by voice; `exit math mode` / `stop math
  mode` / `leave math mode` leave. The same visible button toggles mode.
- While active, every final segment is intercepted before `IntentStream` and
  goes through the vendored `spokenMathToLatex`. Interim math speech does not
  move the reading marker.
- `keep that` and `keep expression` use the same `keepMath` path. Voice keeps
  have voice modality; taps have pointer modality.
- A partial parse may be kept, but every unknown word stays visible and is
  persisted. Empty translations cannot be kept.
- The session strip is intentionally ephemeral; IndexedDB records are the
  durable authority.
- The plain disclosure is exact: `rule-based translator; 65k dataset untouched
  pending provenance.` No dataset was read, copied, transformed, or trained on.

## What shipped

1. **Voice math mode and workbench.** The reading surface has a persistent
   start/leave control. Active mode shows input words and a real KaTeX result
   side by side (stacked on phones), raw LaTeX, honest unparsed words, keep
   control, and the kept-this-session strip. Typed input remains editable;
   recognized final speech writes the exact captured segment into the input.
2. **Durable math acts.** `makeActEntry` now produces `act: "math"` cursor and
   receipt pairs. The act engine renders/removes anchored KaTeX annotations,
   replays surviving annotations on document load, and uses the existing undo
   record path.
3. **Existing-system integration.** Reading history and full history show the
   math evidence; export includes structured wrapper fields; send emits a math
   moment block with LaTeX, spoken evidence, unparsed words, anchor, cursor,
   receipt, and document provenance.
4. **Spoken local document.** `src/math.js` creates/reuses the source with
   honest voice provenance and expression blocks; the library and reading
   provenance disclosure both say `created by voice`.
5. **Local KaTeX.** KaTeX 0.16.47 distribution, fonts, license, and package
   metadata are vendored under `vendor/katex/`. Vite emits only local hashed
   assets; there is no runtime CDN import.

## Files

- `orders/B2-MATHVOICE.md` — approved behavior and implementation calls
- `docs/superpowers/plans/2026-08-12-b2-mathvoice.md` — execution plan
- `src/math.js` — controls, translation wrapper, spoken-document builder
- `src/records.js` — math cursor/receipt semantics and wrapper evidence
- `src/acts.js` — apply/replay/reverse math annotations
- `src/main.js` — mode UI, final-segment routing, keep/session/history wiring
- `src/sync.js` — math moment blocks
- `index.html`, `src/style.css` — accessible responsive workbench and copy
- `vendor/katex/` — pinned local KaTeX 0.16.47 (85 files)
- `test/math.test.mjs` — transcript → LaTeX → record, provenance/reuse, send
- `test/e2e.test.mjs` — named voice-math sim subtest on the existing real app

## E2E proof

The named subtest enters with the simulated final segment `math mode`, proves
multi-word typed input and `mystery` as an honestly surfaced unknown, sends the
required final segment `one half plus x squared`, waits for a `.katex` render,
says `keep that`, then proves:

- `\\frac{1}{2} + x^{2}` is the stored LaTeX;
- the session strip and both history surfaces contain the expression;
- export contains the same structured math record;
- cursor and receipt validate against the existing contracts;
- undo marks the math act undone, creates the referencing undo record, and
  removes the anchored annotation.

## Verify — full suite (verbatim)

Command: `npm test`

```text
> jt-web@0.1.0 test
> node --test test/*.test.mjs

▶ sim replay: records created, schema-valid, undo works
  ✔ math voice sim enters mode, keeps in history, and validates (309.539625ms)
✔ sim replay: records created, schema-valid, undo works (5810.510583ms)
✔ text ingestion returns blocks with provenance (digest + byte size) (17.352291ms)
✔ paste ingestion carries provenance too (3.09925ms)
✔ pdf page text assembly matches the node connector's algorithm (0.360625ms)
✔ pdf ingestion: per-page blocks, page locators, provenance from raw bytes (3.671166ms)
✔ all eight jt-speech intents map onto app commands (78.625667ms)
✔ plain prose stays reading — no phantom commands (6.995209ms)
✔ ambiguity maps to ask and never to an act (11.398ms)
✔ evidence rides along on every intent (2.060625ms)
✔ matcher finds a read passage despite mishearings (7.381791ms)
✔ command grammar (jt-speech intents) (11.860625ms)
✔ math controls enter, keep, and exit without becoming expressions (0.544875ms)
✔ spoken transcript becomes LaTeX and a valid durable math record pair (1.660584ms)
✔ spoken mathematics document is created once and appends expression blocks (18.97625ms)
✔ a sent math moment carries the expression rather than only surrounding prose (0.268916ms)
✔ phone viewport: full-width document, sheet panels, 44px targets, no sideways scroll (6131.337625ms)
✔ desktop viewport: three-column layout intact, no bottom bar, no sideways scroll (4546.870708ms)
✔ glide approaches the target monotonically and never overshoots (1.000375ms)
✔ retargeting mid-flight re-glides from the current position (0.280084ms)
✔ confirmation ripple energy strictly decays — the water always calms (0.298583ms)
✔ comeToRest stops at the predictable resting point (0.458792ms)
✔ org store: institution -> space -> membership, all schema-valid (2.429375ms)
✔ org store: the contract rejects bad records before they are kept (0.391541ms)
✔ org store: persistence round-trips through Storage and survives garbage (0.306875ms)
✔ org store: schema enums are exported for the UI, not retyped (0.256083ms)
✔ parity: JS matcher and wasm engine emit identical block sequences (232.248167ms)
✔ parity: wasm cursor record validators agree with the vendored schemas (1.911041ms)
✔ golden cursor fixtures validate (5.479667ms)
✔ golden receipt fixtures validate (0.823792ms)
✔ makeCursor output validates against cursor.schema.json (7.86325ms)
✔ makeReceipt output validates against receipt.schema.json (0.187708ms)
✔ every act kind produces a valid cursor + receipt pair (0.391292ms)
✔ undo entries reference the reversed act (0.144417ms)
✔ desktop shell walk: first-run once, every surface, settings persist, export, spaces, delete-all (7448.81075ms)
✔ phone shell walk: bottom bar reaches everything, sheets, 44px targets, no overflow anywhere (4562.269666ms)
✔ moment-send: pair two pages by spoken words, send a kept act, verify (6819.95725ms)
✔ spoken recipient words become a valid pair code — or honestly nothing (0.876791ms)
✔ a kept act becomes a full moment: blocks, records, provenance (20.541708ms)
✔ without stored provenance the digest is computed, never omitted (10.920584ms)
ℹ tests 40
ℹ suites 0
ℹ pass 40
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 12686.301416
```

## Verify — production build (verbatim tail)

Command: `NO_COLOR=1 npm run build`

```text
dist/assets/jt_core_bg-DllRKYj6.wasm                    333.17 kB │ gzip: 157.32 kB
dist/assets/pdf.worker.min-CHFwMXne.mjs               1,262.39 kB
dist/assets/index-j_ui_R3H.css                           46.27 kB │ gzip:  12.03 kB
dist/assets/jt_core_bg-CJHBLLcm.js                        0.06 kB │ gzip:   0.08 kB
dist/assets/pdf.worker.min-C8Ts8bNu.js                    0.06 kB │ gzip:   0.08 kB
dist/assets/jt_core-CtLh492r.js                           5.71 kB │ gzip:   2.12 kB
dist/assets/pdf-WcWoUVwF.js                             427.30 kB │ gzip: 127.39 kB
dist/assets/index-DLTwxlmp.js                           483.78 kB │ gzip: 146.48 kB

[INEFFECTIVE_DYNAMIC_IMPORT] vendor/jt-speech/math/spokenMathToLatex.js is dynamically imported by src/shell.js but also statically imported by src/math.js, vendor/jt-speech/index.js, dynamic import will not move module into another chunk.

✓ built in 237ms
```

The warning is informational: the same translator is used by the existing
typed room and the new always-available voice path, so it belongs in the main
chunk. It does not create a runtime network import.

## Verify — local KaTeX and source integrity (verbatim)

Cached tarball:

```text
11ea3c62cd5da14d73fb1f0066c3e942efa9fd0719048e4f78ea3b40641dcb6c769b4314fe161a8016c63a65f0af92956c47d5b96bfd2e99d059e7a1a20bab8e  /Users/apple/.npm/_cacache/content-v2/sha512/11/ea/3c62cd5da14d73fb1f0066c3e942efa9fd0719048e4f78ea3b40641dcb6c769b4314fe161a8016c63a65f0af92956c47d5b96bfd2e99d059e7a1a20bab8e
0.16.47
```

Command:
`rg -n -i 'https?://cdn|unpkg\.com|jsdelivr\.net|katex\.org|cdnjs\.cloudflare\.com' dist/index.html dist/assets/index-*.js dist/assets/index-*.css || true`

```text
(no output)
```

Command: `git diff --check`

```text
(no output)
```

## Provenance boundary

- The 65k dataset was not present in this repository and was not accessed.
- KaTeX came from the already-cached `katex-0.16.47.tgz`; no package-registry
  fetch was used. Its license and package metadata are included beside the
  vendored distribution.

## Commit boundary (verbatim)

Command:

```text
git add index.html src/acts.js src/main.js src/math.js src/records.js src/style.css src/sync.js test/e2e.test.mjs test/math.test.mjs vendor/katex orders/B2-MATHVOICE.md receipts/B2-MATHVOICE.md docs/superpowers/plans/2026-08-12-b2-mathvoice.md && git commit -m "feat: complete B2-MATHVOICE"
```

Output, exit 128:

```text
fatal: Unable to create '/Users/apple/projects/blitz/b2-mathvoice/.git/index.lock': Operation not permitted
```

The managed workspace grants read-only access to `.git`, so staging and
committing are impossible from this session. The working tree is complete,
verified, and scoped to B2-MATHVOICE; the precise next action is to run the
command above from a Git-writable checkout or grant this workspace write
access to `.git`, then rerun it unchanged.
