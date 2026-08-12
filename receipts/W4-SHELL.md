# receipt W4-SHELL — proof of work

Repo: `/Users/apple/projects/jt-web` · branch `wo/w4-shell` off `main`
(main was 29/29). Result: **35/35** — the 29 existing tests untouched and
green, plus 4 org-store unit tests and 2 shell navigation-walk e2e tests
(desktop 1280x800 and phone 390x844, both run WITHOUT `?sim=1` — the app as
a person meets it).

## What shipped — the complete shell

jt is now a routed application, not a single screen. Every surface is a real
linkable place (`#/home`, `#/read`, `#/history`, `#/share`, `#/spaces`,
`#/settings`, `#/rooms`), reachable from a header nav on desktop and the
bottom bar (+ a "more" sheet) on a phone. Surface changes arrive on
jt-water's glide (`surfaceArrive` in `src/motion.js`) — no CSS easing.

1. **First-run** (`#view-welcome`): one screen of plain words on what jt is,
   then the one microphone question, framed as the door ("from then on
   speaking is the interface", "jt keeps no recordings"). The answer is
   remembered (`jt.welcomed`, `jt.mic`); the welcome never appears again —
   asserted by reload in the e2e. Skipping lands in read-only mode with a
   standing "turn on voice" button in the header and in settings.
2. **Home / library** (`#view-home`): the library as the front door.
   Documents listed with provenance (source kind, pages, bytes, digest);
   file open / paste / drop affordances; a designed empty state that says
   what to do first and offers a sample page (created on request — never
   auto-seeded any more).
3. **The reading surface**: unchanged at its core (matcher, intents, marker,
   acts, sim — all as W2/W3 proved them), now with a document header —
   title plus a tap-to-open provenance disclosure — and a designed empty
   state when nothing is open. The listening indicator is a real state
   machine: listening / paused (pause–resume from the header) / voice off /
   mic blocked / recognition unavailable, each in plain words. The engine
   fallback note behaves as before.
4. **What happened** (`#view-history`): the full record surface — every act
   across every document, filterable by document, each record expandable to
   its full evidence, undo everywhere. Undoing an act of a document that is
   not open writes the same paired records through IndexedDB that the live
   engine writes (marked undone + an undo record), so a later open replays
   truthfully. Same `entryNode` builder as the reading-side panel — one
   visual language, zero duplication.
5. **Sharing** (`#view-share`): the sync surface elevated, with the pairing
   flow explained in plain words (three spoken words you can say across a
   room — no codes to squint at) and a tap-open explainer of the verified
   badge (fingerprint recomputed on arrival and compared). Same live
   `createSyncSurface` wiring as before; the sync e2e still passes
   untouched.
6. **Spaces** (`#view-spaces`, PROVISIONAL and labeled "early — the shape
   may change"): real function. `src/org.js` is a browser port of
   jt-contracts' reference OrgStore; the five org schemas are vendored in
   `contracts/org/` and every record is ajv-validated against them before
   the store accepts it. Create institution → space (schema-enum kinds) →
   member (schema-enum roles, roll number kept verbatim); listing shows the
   real tree; persistence via localStorage survives reload (e2e-asserted).
   Starts honestly empty — the e2e asserts zero institutions before the
   walk creates one. No fake seeded people.
7. **Settings** (`#view-settings`): speech language (feeds `rec.lang`);
   motion intensity calm/usual/lively driving real jt-water parameters
   (marker medium entry/tension + ripple energy — "usual" is exactly the
   shipped W2 feel); engine wasm/js with a live status line (URL param still
   overrides); **export** — one JSON file of documents, records, arrivals,
   spaces, and settings; **delete-all** — two explicit presses, then
   localStorage + the IndexedDB database are really gone and the app starts
   over at first-run (e2e-asserted); about with version from package.json
   and "records stay on this device".
8. **Honest rooms** (`#view-rooms`): spoken mathematics — the jt-speech v0
   translator IS wired behind a keyboard "try it" (real output, and words it
   cannot place are listed rather than guessed — its own honesty surfaced);
   carrying your reading place across devices — a designed statement of
   what it will be, with a plain "not built yet" line. No fake output
   anywhere.

Phone nav: bottom bar grew `home` and `more` (sheet with sharing / spaces /
settings / what's coming, all ≥44px); `documents` and `what happened` keep
their W3 sheet behavior on the reading surface and bring the reading back
from any other surface. Desktop: header nav; the three-column reading
layout is untouched (still asserted by the W3 desktop test).

Banned vocabulary check: no Margin/locus/settle/recede/QR, no sea/drops/
shells, and "receipt" never appears as a UI noun — records are "records";
wire names stay inside the JSON a person can inspect under "full record".

## Files

- `index.html` — all surfaces + header nav + more sheet (reading DOM ids unchanged)
- `src/shell.js` (new) — router, first-run, home, full history, spaces UI, settings, rooms
- `src/org.js` (new) — OrgStore browser port, schema-validated, Storage-persisted
- `src/settings.js` (new) — typed localStorage settings + motion→physics map
- `src/motion.js` — glider accepts a live medium getter; `surfaceArrive` water transition
- `src/main.js` — mic state machine, doc header, boot/welcome flow, shell wiring; sim path unchanged
- `src/style.css` — shell styles extending the existing language (one accent, soft panels)
- `contracts/org/*.schema.json` (new) — vendored from jt-contracts
- `test/org.test.mjs`, `test/shell.e2e.test.mjs` (new)

## Verify — full suite (verbatim)

Command: `npm test` (Chrome required; six headless e2e tests)

```
> jt-web@0.1.0 test
> node --test test/*.test.mjs

✔ sim replay: records created, schema-valid, undo works (10801.623584ms)
✔ text ingestion returns blocks with provenance (digest + byte size) (12.500625ms)
✔ paste ingestion carries provenance too (2.6945ms)
✔ pdf page text assembly matches the node connector's algorithm (0.277458ms)
✔ pdf ingestion: per-page blocks, page locators, provenance from raw bytes (2.086875ms)
✔ all eight jt-speech intents map onto app commands (10.29125ms)
✔ plain prose stays reading — no phantom commands (5.374709ms)
✔ ambiguity maps to ask and never to an act (2.668083ms)
✔ evidence rides along on every intent (0.287417ms)
✔ matcher finds a read passage despite mishearings (10.693875ms)
✔ command grammar (jt-speech intents) (9.1395ms)
✔ phone viewport: full-width document, sheet panels, 44px targets, no sideways scroll (9079.288417ms)
✔ desktop viewport: three-column layout intact, no bottom bar, no sideways scroll (4727.5285ms)
✔ glide approaches the target monotonically and never overshoots (0.848167ms)
✔ retargeting mid-flight re-glides from the current position (0.189125ms)
✔ confirmation ripple energy strictly decays — the water always calms (0.143ms)
✔ comeToRest stops at the predictable resting point (0.103625ms)
✔ org store: institution -> space -> membership, all schema-valid (3.587042ms)
✔ org store: the contract rejects bad records before they are kept (0.40925ms)
✔ org store: persistence round-trips through Storage and survives garbage (0.323542ms)
✔ org store: schema enums are exported for the UI, not retyped (0.259167ms)
✔ parity: JS matcher and wasm engine emit identical block sequences (115.473792ms)
✔ parity: wasm cursor record validators agree with the vendored schemas (2.161833ms)
✔ golden cursor fixtures validate (3.004334ms)
✔ golden receipt fixtures validate (1.72025ms)
✔ makeCursor output validates against cursor.schema.json (1.567416ms)
✔ makeReceipt output validates against receipt.schema.json (0.16775ms)
✔ every act kind produces a valid cursor + receipt pair (0.795292ms)
✔ undo entries reference the reversed act (0.179625ms)
✔ desktop shell walk: first-run once, every surface, settings persist, export, spaces, delete-all (11259.900792ms)
✔ phone shell walk: bottom bar reaches everything, sheets, 44px targets, no overflow anywhere (4482.972042ms)
✔ moment-send: pair two pages by spoken words, send a kept act, verify (9739.713417ms)
✔ spoken recipient words become a valid pair code — or honestly nothing (1.706125ms)
✔ a kept act becomes a full moment: blocks, records, provenance (3.059667ms)
✔ without stored provenance the digest is computed, never omitted (17.877167ms)
ℹ tests 35
ℹ suites 0
ℹ pass 35
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 16167.337125
```

Build (verbatim tail): `npx vite build` → `✓ built in 190ms` (one benign
rollup note: the spoken-math module is dynamically imported by the rooms
surface but statically by the vendored jt-speech index, so it stays in the
main chunk).

## What the two new e2e walks prove

**desktop** (`test/shell.e2e.test.mjs`, 1280x800, fresh profile, no sim):
first-run appears and appears exactly once (reload lands home); the empty
home's sample opens the reading surface with title + provenance disclosure;
all seven surfaces reachable from the header nav, none overflows; a real
act shows in the full what-happened surface and undo there writes an undo
record and strikes the act; spaces starts empty, creates institution →
class → member with roll number, all listed; language/motion/engine changes
persist across reload and the js engine is genuinely live after it
(`engineKind() === "js"`); reloading on `#/settings` deep-links back to
settings; export parses as JSON and carries documents, both records, the
created spaces, and the changed settings; the spoken-math room really
translates ("one half plus x squared" → `\frac{1}{2} + x^{2}`); delete-all
takes two presses and then the app is truly at first-run with org data gone.

**phone** (390x844, touch): the welcome is tappable (≥44px) and skippable;
all four bar buttons ≥44px; the more sheet lists the four remaining
surfaces at ≥44px, and picking one navigates and closes the sheet; every
surface visible with zero horizontal overflow; from home, "documents"
returns to reading with the library sheet open, and "home" comes back with
no sheet.

## What stayed an honest placeholder

- **cross-device place carry-over** — designed room, plainly labeled "not
  built yet"; no fake behavior.
- **spoken math by voice** — the translator runs for real behind a typed
  "try it"; the listening hookup is named as the next step, not simulated.
- **spaces → sharing** — how spaces will route moments between people is
  stated as still being decided (founder handoff incoming); the surface
  wires only what the contracts already define.

## Blockers

None. Two self-resolved: (1) puppeteer taps landing mid-slide on the phone
"more" sheet — the walk now waits for the sheet to physically settle
(position stable across polls and the link is what `elementFromPoint`
returns); (2) boot/test race on first paint — a `__jtApp.booted` flag marks
the moment the shell has decided its first surface.
