# FIX-FLAGSHIP completion record

Repository: `/Users/apple/projects/blitz/fix-highlight`  
Branch: `blitz/fix-highlight`  
Starting SHA: `9e77e282b29dbde0dc4bf6b894e17a4741dc983a`  
Date: 13 August 2026  
Order: `orders/FIX-FLAGSHIP.md`

## Outcome

The flagship interaction now carries the matcher's exact token range through
matching, target choice, durable storage, reload resolution, inline painting,
and the moving guide. A trustworthy match paints only its characters. The
whole block is retained only as the visibly different approximate fallback.

Stored acts now carry
`{blockIndex, tokenStart, tokenEnd, quotedText, prefix, suffix, docDigest}`.
Reload verifies the quote in place, uniquely refinds it with context, or marks
it lost without painting a different passage. Old ordinal rows are tagged
`migration: "legacy"` and use the approximate treatment. Arrival is restricted
to `exact | refound | approximate | lost`; the record factory throws if a
caller omits it instead of silently inventing `exact`.

The uncertainty policy is centralized at acceptance `0.62`, ask ceiling
`0.78`, and close-score gap `0.05`. The existing choice surface shows exact
candidate spans with nearby words, delays the write until a choice, and keeps
the ask reason, candidates, and chosen span as evidence.

The ordinary `?sim=1&fast=1` path completes without a harness flag, creates
four expected records, and emits `#jt-report`. The failure was command words
being fed through the interim matcher and replacing the reading target before
the final intent ran. Final reading segments now freeze the last reading match;
commands act on that frozen target. Report creation is in `finally`, with any
failure serialized before it is rethrown.

## Confirmed root causes

1. The guide gained class `on`, but its first geometry write happened only in
   `requestAnimationFrame`. A throttled or absent first frame left the CSS
   defaults at zero height and zero opacity. The driver now owns top, left,
   width, and height and performs the first write synchronously.
2. `blockForRange()` selected a paragraph and discarded `{start,end}`. The
   engine now returns the global token range and ranked alternatives; the app
   maps it to block-local tokens and uses a DOM `Range` plus semantic `mark`.
3. Ordinal-only anchors could silently drift. The new pure anchor module stores
   exact quote, local tokens, bounded context, and document digest, then
   resolves explicitly to exact, refound, or lost.
4. The proof factory defaulted every arrival to exact. Callers must now supply
   an actual resolution, and unanchored block fallbacks become approximate.
5. There was no uncertainty decision between matching and committing. A pure
   decision layer now asks for low-confidence or close different-block spans.
6. The scripted session's command interim text overwrote the passage target,
   causing later acts and reporting to stall. Reading-target freeze plus
   fail-safe report emission removes that browser-only divergence.

## Visible behavior and copy

- Exact highlight: translucent inline `mark.jt-highlight`, with the guide
  fitted to its rendered range.
- Approximate fallback: lighter dashed block outline, never styled as exact.
- History wording: `exact text found`, `text found again after it moved`,
  `whole block used because the exact words were unavailable`, or
  `this text may have moved/changed`.
- The internal wire field keeps its contract name, but expanded UI records
  label it `proof`; no prohibited product/UI nouns were added.

## Files

- Added: `src/anchors.js`, `src/highlight.js`, `src/targeting.js`.
- Reworked: `src/match.js`, `src/engine.js`, `src/motion.js`, `src/acts.js`,
  `src/records.js`, `src/main.js`, `src/style.css`, `src/shell.js`.
- Contract: `contracts/receipt.schema.json` and its full fixture.
- Tests: new anchor and targeting units; stronger match, record, sim,
  durability, target-choice, and 375/1280 rendered-geometry assertions.
- Runner: `npm test` is serial because the browser files own fixed local
  servers and concurrent Node test workers caused real port/listener races.

## Test corrections

No honest existing assertion was weakened. Whole-paragraph assertions were
replaced by what a person sees: rendered guide and inline-mark rectangles must
have height greater than zero and computed opacity greater than zero at 375px
and 1280px; a mid-block mark must be narrower than its paragraph. Added browser
proofs cover unique refinding after a prepended paragraph, lost text after
tampering, no wrong repaint, close-span choice and stored evidence, and an
ordinary non-harness scripted run with four records and `#jt-report`.

The untouched baseline was not the claimed 56/56 in this checkout. Its first
actual run was 55/56 because the inherited return-browser clickability test
failed once. Serializing the stateful browser suite removed that race.

## Red-green evidence

- Exact matcher-span tests first failed because `tokenizeWithSpans` and
  `findMatches` did not exist; focused green was 6/6 including wasm parity.
- Anchor/record tests first failed five assertions because there was no anchor
  API or stored anchor; focused green was 14/14.
- New browser geometry tests first failed at both widths because no exact
  inline mark existed; after implementation the full checkpoint was 63/63.
- Target-policy tests first failed three assertions because `decideTarget` did
  not exist. After implementation they passed, then the browser run exposed
  the scripted command-overwrite stall. Freezing the last reading match made
  the serial full checkpoint 67/67.
- A later record-factory test proves omission cannot masquerade as exact; the
  final focused anchor/match/parity/record/target run is 22/22.

## Verbatim verification outputs

Successful real-Google-Chrome serial checkpoint, after all six behavioral
fixes and all requested browser assertions:

```text
▶ sim replay: records created, schema-valid, undo works
  ✔ close target spans ask, show context, and store the chosen evidence (53.237167ms)
  ✔ math voice sim enters mode, keeps in history, and validates (201.416208ms)
✔ sim replay: records created, schema-valid, undo works (5673.03025ms)
✔ phone viewport: full-width document, sheet panels, 44px targets, no sideways scroll (4841.384042ms)
✔ desktop viewport: three-column layout intact, no bottom bar, no sideways scroll (4143.438ms)
✔ reading place survives reload; home, water return, voice, and ambiguity stay honest (6566.23975ms)
✔ moment-send: pair two pages by spoken words, send a kept act, verify (5977.650625ms)
ℹ tests 67
ℹ pass 67
ℹ fail 0
ℹ duration_ms 54865.130625
```

Final-tree non-browser suite:

```text
ℹ tests 54
ℹ suites 0
ℹ pass 54
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1115.617833
```

Final production build:

```text
> jt-web@0.1.0 build
> vite build

vite v8.2.1 building client environment for production...
transforming...✓ 159 modules transformed.
rendering chunks...
computing gzip size...
dist/assets/index-D5s-70Bn.css                           50.32 kB │ gzip:  12.84 kB
dist/assets/jt_core-CtLh492r.js                           5.71 kB │ gzip:   2.12 kB
dist/assets/pdf-CDEm5Snh.js                             427.30 kB │ gzip: 127.39 kB
dist/assets/index-BP7YM1al.js                           513.85 kB │ gzip: 155.42 kB
✓ built in 390ms
```

The build also repeats two pre-existing non-fatal warnings: the spoken-math
module is both statically and dynamically imported, and one minified chunk is
larger than 500 kB.

Final whitespace and prohibited UI-string audit produced no output:

```text
$ git diff --check
$ rg -n -i '(textContent|innerHTML|setStatus).*(["`])[^"`]*(qr|margin|locus|settle|receipt|sea|drops|shells)' index.html src
```

## Environment evidence after the green checkpoint

A subsequent final `npm test` retry did not reach any browser assertions. The
sandbox began denying every local listener across unchanged sim, mobile, PWA,
return, shell, spaces, and sync tests. Representative verbatim errors:

```text
Error: listen EPERM: operation not permitted /var/folders/s7/znml9m8n6gbf39yvp53fbnwm0000gn/T/tsx-501/76830.pipe
Error: server never came up at http://127.0.0.1:4931/
Error: vite preview exited early
```

That retry reported 54 passing tests and 12 listener failures. A direct Chrome
launch was denied as well, so no later screenshot artifact was fabricated.
The successful 67/67 checkpoint above is the browser evidence; final source,
contract, unit, build, copy, and diff checks were then rerun independently.

## Git

The requested staging/commit attempt was made on `blitz/fix-highlight`, but the
sandbox exposes `.git` read-only. Verbatim output:

```text
fatal: Unable to create '/Users/apple/projects/blitz/fix-highlight/.git/index.lock': Operation not permitted
```

No index lock was created, nothing was staged, no commit was made, and nothing
was pushed. The working tree contains only the scoped FIX-FLAGSHIP changes
listed above and is ready for an authorized `git add` and commit.
