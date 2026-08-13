# order FIX-FLAGSHIP — visible, exact, durable targeting

Repository `/Users/apple/projects/blitz/fix-highlight` · branch
`blitz/fix-highlight` · starting SHA
`9e77e282b29dbde0dc4bf6b894e17a4741dc983a`.

The untouched baseline build succeeded on 13 August 2026. Its full test run
reported 55/56 because `test/return.e2e.test.mjs` hit an inherited transient
clickability failure at line 71; every other test passed. FIX-FLAGSHIP must
finish with a fresh green full run, including this inherited red evidence.

## Fixed product decisions

This order is the approved design. No additional product question is needed.

- Exact matcher output remains an exact text target all the way through the
  act engine. A highlight paints only the matched characters using semantic
  inline `mark` elements. The moving guide glides to the measured text span,
  including a synchronous first placement so visibility never depends on the
  browser delivering an animation frame.
- A whole-block highlight is allowed only when no trustworthy text range
  exists. It uses an outlined, lower-emphasis fallback treatment and records
  `approximate`; it must not look like an exact highlight.
- A durable anchor is stored on every new act as
  `{blockIndex, tokenStart, tokenEnd, quotedText, prefix, suffix, docDigest}`.
  Token offsets are block-local and inclusive. Prefix and suffix keep at most
  40 source characters each. `quotedText` preserves the exact source spelling.
- Resolution first checks the quote at the stored token range. If that fails,
  it searches exact quote occurrences and ranks context agreement. One unique
  context-consistent result is `refound`; a block-only fallback is
  `approximate`; absent or tied results are `lost`. A lost act is not replayed
  against document text.
- Old rows are migrated in memory when read. They retain their old paired
  contract records, gain a wrapper anchor where possible, and are explicitly
  tagged `legacy`; they never masquerade as newly exact evidence.
- Arrival is one of `exact`, `refound`, `approximate`, or `lost` in the app
  entry and proof record. The vendored proof schema is widened to these four
  values so validation and product truth agree. History says in plain words:
  exact text found, text found again after moving, whole block used because
  the exact words were unavailable, or `this text may have moved/changed`.
- Target uncertainty thresholds live in one exported policy object:
  acceptance floor `0.62`, ask ceiling `0.78`, and close-candidate gap `0.05`.
  A score in `[0.62, 0.78)` or two different-block candidates within `0.05`
  asks before an act is written. Candidate buttons show the quote plus nearby
  words. A choice stores the ask reason, candidates, and chosen span on the
  resulting wrapper and in cursor history.
- The scripted run remains the ordinary live transcript/intent/act path. It
  runs at 375px and 1280px without a test-only runtime flag, resolves its
  target-choice prompt as a person would, reaches the expected record count,
  and always emits `#jt-report`. Per-step failures are captured in the report
  before being rethrown so a browser never leaves an unexplained partial run.

## Architecture and interfaces

`src/match.js` adds character-preserving token spans and ranked matches while
retaining the current best-match API. `src/engine.js` keeps `{start,end}` and
candidate ranges on both JS and wasm paths; wasm remains authoritative for its
best score, with the JS reference supplying ambiguity candidates.

`src/anchors.js` is a pure module. It builds anchors from block text, resolves
them against current blocks, migrates legacy wrappers, and returns
`{arrival, anchor, blockIndex, tokenStart, tokenEnd}` without touching DOM or
storage.

`src/highlight.js` maps block-local token spans to DOM text ranges, wraps exact
text in `mark.jt-highlight`, removes wraps on undo, and measures the visible
client rectangles used by the guide. `src/motion.js` owns the four-dimensional
water guide (`top`, `left`, `width`, `height`) and writes a non-zero first
placement synchronously.

`src/acts.js` resolves every loaded row before replay, persists migrated rows,
applies exact inline highlights or the distinct fallback, and never applies a
lost highlight. `src/records.js` accepts anchor, arrival, and target-choice
evidence rather than inventing `exact`. `src/main.js` carries full match state,
routes uncertain acts through the existing ask surface, renders arrival copy,
and makes the scripted run deterministic in ordinary browser conditions.

## Test-first execution plan

### Task 1 — exact visible geometry

- Add browser assertions at 375x812 and 1280x800 for guide and inline mark
  `getBoundingClientRect().height > 0` and computed opacity greater than zero.
- Add a mid-block phrase assertion that the marked range is narrower than its
  paragraph. Run it against the current build and record the expected failure.
- Implement character token spans, DOM range wrapping, synchronous guide
  placement, and four-dimensional water travel. Re-run focused browser tests.

### Task 2 — durable honest anchors

- Add pure tests for exact resolution, refinding after a prepended paragraph,
  tied/absent tampering returning `lost`, and legacy migration.
- Add an end-to-end history assertion that a prepended paragraph yields
  `refound` and tampered text visibly says it may have moved or changed.
- Implement anchor build/resolve/migration, load-time persistence, replay and
  undo behavior, then update the proof schema and validation expectations.

### Task 3 — uncertain target choice

- Add ranked-match tests for an uncertain score and close occurrences in
  different blocks.
- Add a browser test proving the target ask is visible, contains surrounding
  words, writes nothing before choice, and stores ask plus chosen-span evidence
  after tap.
- Implement the centralized target policy, target ask rendering/resolution,
  and record evidence.

### Task 4 — scripted-run completion

- Change the phone proof to exactly 375px and assert no harness-only global is
  present, the expected record count is reached, and `#jt-report` is emitted.
- Make the script explicitly answer target asks, await persisted writes, and
  emit a diagnostic report on failure. Keep the final command ambiguity as an
  honest unresolved command ask only if it is part of the expected report.

### Task 5 — verification and handoff

- Run focused unit/browser tests after each red-green cycle, then `npm test`
  and `npm run build` fresh on the final tree.
- Inspect screenshots at 375px and 1280px, audit user-facing prohibited words,
  run `git diff --check`, and review the exact diff against every defect.
- Write `receipts/FIX-FLAGSHIP.md` with product decisions, root causes, changed
  files, red-green evidence, and verbatim final outputs. Commit the reviewed
  files on `blitz/fix-highlight` if git permits; do not push.

## Visual direction

Keep the existing jt palette, Charter reading face, system utility face, and
three-column/phone-sheet layouts. The signature interaction is the existing
water guide now hugging the actual spoken words. Exact text uses the current
accent as a quiet translucent inline wash; fallback uses a dashed outline and
lighter fill. This is a precision repair, not a generic visual redesign.

## Verification contract

- Every changed behavior has a test that failed for the intended missing or
  dishonest behavior before production code changes.
- Guide and span are visibly measurable at both required viewports.
- Mid-block exact highlight is narrower than its paragraph.
- Prepended content resolves uniquely as `refound`; tampered/ambiguous content
  resolves as `lost` and is disclosed without painting the wrong text.
- Uncertain and close target matches ask and store the person’s choice.
- The ordinary real-browser scripted path reaches its expected record count
  and emits `#jt-report` at 375px.
- The full suite and standalone production build exit zero; the final commit
  contains the order and proof file and excludes unrelated files.
