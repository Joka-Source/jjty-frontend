# receipt B4-RETURN — reading continuity returned

Repository `/Users/apple/projects/blitz/b4-return` · branch
`blitz/b4-return` · starting/main SHA
`44ca6f7e570a478c21078d3a24ee0e0f9c1bab95` · baseline 44/44.

## Result

B4-RETURN is implemented as one reading-continuity path rather than a second
bookmark system:

1. **Per-document position memory.** IndexedDB version 3 adds `positions`,
   keyed by document id. Each row carries revision, zero-based block index,
   block count, and update time. Tap and matcher updates pass through
   `createPositionMemory`, whose independent per-document timers coalesce rapid
   updates and keep the newest block. Pending values are also readable before
   disk write and flush when the page hides.
2. **Visible return.** Opening a remembered document restores `currentBlock`,
   returns the existing reading marker, glides the viewport with jt-water, and
   briefly places `you were here` beside the block. `createReturnMotion` samples
   both travel and fade from jt-water. The return path uses browser scroll
   behavior `auto`; `.return-marker` defines no CSS transition.
3. **Home continuity.** Every document card says `block N of M · <relative
   time>` using one-based human block numbers, or `not started` when there is no
   honest position. Pending and persisted positions use the same formatter.
4. **Voice return.** The vendored jt-speech lexicon/parser now emits local
   `document.return` intents for `take me back`, `where was I`, and `go back to
   <document name>`. Exact normalized titles win. Containment and edit
   similarity handle imperfect names. Close ties—including duplicate exact
   titles—show titled choices and open nothing until a person chooses.
5. **Lightweight paired record.** Successful returns call
   `engine.recordReturn`, which uses `makeReturnEntry`; that factory composes the
   existing cursor and proof factories. The cursor carries internal state
   `return`, both records validate against existing contracts, and the wrapper
   is visible in both histories/export without undo or send controls.

## Product decisions recorded

- Position storage is hot lightweight state; only successful returns produce
  paired records. Continuous reading does not flood history.
- Stored indices survive revisions and clamp to the current last block. This
  preserves a meaningful place across append-only changes without inventing a
  content remapping algorithm.
- Storage stays zero-based to match the matcher and records; all visible block
  numbers are one-based.
- A current-document return with no open document or no remembered place says
  so and writes no record.
- A named return with a close title tie shows every candidate and waits. The
  ambiguity itself writes no return.
- Positions are included in the existing JSON export and disappear with the
  existing delete-all database removal.

## Vendored jt-speech note for upstream

Upstream the `document.return` intent, triggers `take me back`, `where was I`,
and `go back to`, and optional `documentName` argument from:

- `vendor/jt-speech/lexicon.js`
- `vendor/jt-speech/segmenter.js`
- `vendor/jt-speech/types.d.ts`

Keep document-library ranking in jt-web (or another consumer), because
jt-speech correctly has no access to application document state.

## Files

- `orders/B4-RETURN.md` — fixed scope, architecture, decisions, upstream note
- `src/position.js` — normalization, throttling, relative time, name ranking
- `src/db.js` — IndexedDB v3 positions store/read/write/export adapter
- `src/motion.js` — pure water return trajectory and DOM return driver
- `src/records.js` — schema-valid non-undoable return pair factory
- `src/acts.js` — return persistence through the existing engine/history
- `src/intents.js` — jt-speech return command adapter and descriptions
- `src/main.js` — tap/matcher memory, restore, voice matching, ambiguity, hooks
- `src/shell.js` — home continuity and exported positions
- `src/style.css` — restrained return marker and card metadata
- `vendor/jt-speech/{lexicon.js,segmenter.js,types.d.ts}` — local return intent
- `test/position.test.mjs` — position store, normalization, time, fuzzy ranking
- `test/return.e2e.test.mjs` — reload, home, water marker, voice, record, tie
- `test/{intents,motion,records}.test.mjs` — focused return regressions

## TDD evidence

The first focused run failed on the missing `src/position.js`, absent return
factory, and unparsed return phrases. The motion test then failed on missing
`createReturnMotion`. The exact-duplicate-title regression later failed with
actual `match` versus expected `ambiguous`. Each passed after the corresponding
minimal implementation. Final focused position output:

```text
✔ position memory coalesces rapid writes per document and keeps the newest block (2.671208ms)
✔ position normalization rejects broken rows and clamps a surviving place (0.123875ms)
✔ relative read time stays plain and relative (0.116666ms)
✔ document-name matching chooses exact titles, exposes ties, and rejects weak guesses (1.65175ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 75.414375
```

## Full verification — verbatim test output

Command: `npm test`

```text
▶ sim replay: records created, schema-valid, undo works
  ✔ math voice sim enters mode, keeps in history, and validates (624.972834ms)
✔ sim replay: records created, schema-valid, undo works (9103.924708ms)
✔ text ingestion returns blocks with provenance (digest + byte size) (13.729667ms)
✔ paste ingestion carries provenance too (0.605042ms)
✔ pdf page text assembly matches the node connector's algorithm (0.39075ms)
✔ pdf ingestion: per-page blocks, page locators, provenance from raw bytes (1.88225ms)
✔ all eight jt-speech intents map onto app commands (19.546791ms)
✔ plain prose stays reading — no phantom commands (6.715166ms)
✔ ambiguity maps to ask and never to an act (2.035209ms)
✔ evidence rides along on every intent (0.326125ms)
✔ return phrases map to current and named document commands (0.673625ms)
✔ matcher finds a read passage despite mishearings (12.189333ms)
✔ command grammar (jt-speech intents) (15.491458ms)
✔ math controls enter, keep, and exit without becoming expressions (2.958292ms)
✔ spoken transcript becomes LaTeX and a valid durable math record pair (2.661583ms)
✔ spoken mathematics document is created once and appends expression blocks (7.918166ms)
✔ a sent math moment carries the expression rather than only surrounding prose (0.286583ms)
✔ phone viewport: full-width document, sheet panels, 44px targets, no sideways scroll (9423.944041ms)
✔ desktop viewport: three-column layout intact, no bottom bar, no sideways scroll (4099.138375ms)
✔ glide approaches the target monotonically and never overshoots (0.923334ms)
✔ retargeting mid-flight re-glides from the current position (0.259667ms)
✔ confirmation ripple energy strictly decays — the water always calms (0.690708ms)
✔ comeToRest stops at the predictable resting point (0.47ms)
✔ reading return travel and marker fade are both sampled from water (2.862542ms)
✔ org store: institution -> space -> membership, all schema-valid (1.620375ms)
✔ org store: the contract rejects bad records before they are kept (0.365375ms)
✔ org store: persistence round-trips through Storage and survives garbage (0.321208ms)
✔ org store: schema enums are exported for the UI, not retyped (0.234208ms)
✔ parity: JS matcher and wasm engine emit identical block sequences (147.984792ms)
✔ parity: wasm cursor record validators agree with the vendored schemas (1.497625ms)
✔ position memory coalesces rapid writes per document and keeps the newest block (2.347375ms)
✔ position normalization rejects broken rows and clamps a surviving place (0.124167ms)
✔ relative read time stays plain and relative (0.100042ms)
✔ document-name matching chooses exact titles, exposes ties, and rejects weak guesses (4.221833ms)
✔ pwa manifest is linked, standalone, and carries generated maskable 192/512 icons (6398.181792ms)
✔ production app registers and activates its service worker (4914.780083ms)
✔ offline navigation serves the shell and reopens an IndexedDB document (3044.2475ms)
✔ manual install help is platform-specific and the installable hint appears once (3348.280667ms)
✔ golden cursor fixtures validate (7.411041ms)
✔ golden receipt fixtures validate (3.985541ms)
✔ makeCursor output validates against cursor.schema.json (4.012292ms)
✔ makeReceipt output validates against receipt.schema.json (0.319541ms)
✔ every act kind produces a valid cursor + receipt pair (0.409709ms)
✔ undo entries reference the reversed act (0.153916ms)
✔ a return is a valid lightweight non-undoable record pair (0.157792ms)
✔ reading place survives reload; home, water return, voice, and ambiguity stay honest (10834.763833ms)
✔ desktop shell walk: first-run once, every surface, settings persist, export, spaces, delete-all (9862.801958ms)
✔ phone shell walk: bottom bar reaches everything, sheets, 44px targets, no overflow anywhere (4341.472167ms)
✔ moment-send: pair two pages by spoken words, send a kept act, verify (8977.074125ms)
✔ spoken recipient words become a valid pair code — or honestly nothing (0.559167ms)
✔ a kept act becomes a full moment: blocks, records, provenance (2.820042ms)
✔ without stored provenance the digest is computed, never omitted (7.81175ms)
ℹ tests 52
ℹ suites 0
ℹ pass 52
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 18213.913958
```

Build in that command: `✓ 155 modules transformed`, `✓ built in 253ms`.

Standalone command: `npm run build`

```text
✓ 155 modules transformed.
dist/index.html                                          17.44 kB │ gzip:   4.88 kB
dist/assets/index-pnp1Uiuw.css                           47.45 kB │ gzip:  12.24 kB
dist/assets/index-g2LJSVZm.js                           493.00 kB │ gzip: 149.24 kB
✓ built in 189ms
```

Both builds retain the pre-existing benign notice that the local spoken-math
module is imported both dynamically and statically; no failure or new warning
was introduced.

## Final audits

- `git diff --check` — exit 0, no whitespace errors.
- User-facing vocabulary sweep — no banned product/UI nouns introduced. Wire
  names remain inside source comments, JSON, tests, order, and this proof file.
- Motion sweep — the B4 return path contains no smooth browser behavior and no
  CSS transition; jt-water owns both moving values.
- `.DS_Store` was present before the order, remains untracked, and is excluded
  from B4 staging.

## Blockers

None.
