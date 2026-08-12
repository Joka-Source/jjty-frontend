# receipt W3-MOBILE — proof of work

Repo: `/Users/apple/projects/jt-web` · branch `wo/w3-mobile` off `main`
(main was 27/27). Result: 29/29 — the 27 existing tests untouched and
green, plus 2 new viewport e2e tests (phone 390x844 and desktop 1280x800).

## The defect, and what changed

At narrow widths the old stylesheet collapsed the grid to one column but
left the panels `position: sticky` with a viewport-height cap, so the
library sat on top of (and pushed around) the document — the overlap the
Android WebView host reported. Now, at ≤960px:

- **The document owns the full width.** `.layout` drops the grid; the
  article and the reading marker are kept strictly inside the viewport
  (the marker's negative desktop insets are pulled in; `overflow-x: clip`
  guards the body). No horizontal scroll.
- **Panels are slide-over sheets.** The library (with sharing + inbox, as
  before) and the history panel become bottom sheets (`position: fixed`,
  `translateY` in/out, max 72vh) opened from a new bottom bar with two
  buttons — "documents" and "what happened" (the panels' own existing
  headings; no new vocabulary). One sheet at a time; the scrim or the same
  button closes it; picking a document closes the sheet; "show me what
  I've done" opens the history sheet on a phone.
- **Touch targets ≥44px**: bar buttons, document rows, open/paste
  controls, ask options, undo/send, share/join controls.
- **The ambiguity prompt is thumb-usable**: it sticks just below the top
  bar while the page scrolls, its options are ≥44px, and the phone e2e
  answers it by tap.
- **Desktop is untouched**: above 960px the bar and scrim are
  `display: none` and the three sticky columns render exactly as before —
  asserted by the new desktop test.

No copy changed; no visual redesign beyond layout. The marker and act
ripples still run on jt-water physics (`src/motion.js` untouched); the
sheet slide is the one new declarative transition, matching the existing
opacity fades.

Files: `index.html` (bottom bar + scrim, an id on the history panel),
`src/style.css` (phone media query replacing the old one-column rule),
`src/main.js` (sheet open/close wiring + two test hooks),
`test/mobile.e2e.test.mjs` (new).

## Verify — full suite (verbatim)

Command: `npm test` (Chrome required; includes all four headless e2e tests)

```
> jt-web@0.1.0 test
> node --test test/*.test.mjs

✔ sim replay: records created, schema-valid, undo works (5875.837542ms)
✔ text ingestion returns blocks with provenance (digest + byte size) (16.268125ms)
✔ paste ingestion carries provenance too (2.210875ms)
✔ pdf page text assembly matches the node connector's algorithm (0.240416ms)
✔ pdf ingestion: per-page blocks, page locators, provenance from raw bytes (2.75125ms)
✔ all eight jt-speech intents map onto app commands (12.260375ms)
✔ plain prose stays reading — no phantom commands (7.984959ms)
✔ ambiguity maps to ask and never to an act (4.321792ms)
✔ evidence rides along on every intent (0.3705ms)
✔ matcher finds a read passage despite mishearings (6.199583ms)
✔ command grammar (jt-speech intents) (11.170208ms)
✔ phone viewport: full-width document, sheet panels, 44px targets, no sideways scroll (5386.53475ms)
✔ desktop viewport: three-column layout intact, no bottom bar, no sideways scroll (3430.528042ms)
✔ glide approaches the target monotonically and never overshoots (0.826916ms)
✔ retargeting mid-flight re-glides from the current position (0.199166ms)
✔ confirmation ripple energy strictly decays — the water always calms (0.14675ms)
✔ comeToRest stops at the predictable resting point (0.104541ms)
✔ parity: JS matcher and wasm engine emit identical block sequences (68.9585ms)
✔ parity: wasm cursor record validators agree with the vendored schemas (1.43825ms)
✔ golden cursor fixtures validate (1.902792ms)
✔ golden receipt fixtures validate (0.646834ms)
✔ makeCursor output validates against cursor.schema.json (1.125542ms)
✔ makeReceipt output validates against receipt.schema.json (0.133458ms)
✔ every act kind produces a valid cursor + receipt pair (0.386417ms)
✔ undo entries reference the reversed act (0.186542ms)
✔ moment-send: pair two pages by spoken words, send a kept act, verify (6283.631292ms)
✔ spoken recipient words become a valid pair code — or honestly nothing (0.562417ms)
✔ a kept act becomes a full moment: blocks, records, provenance (1.986667ms)
✔ without stored provenance the digest is computed, never omitted (5.198792ms)
ℹ tests 29
ℹ suites 0
ℹ pass 29
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 9108.445042
```

The suite was run four times consecutively; 29/29 on every run.

## What the new e2e tests prove

**phone viewport** (`test/mobile.e2e.test.mjs`, 390x844, deviceScaleFactor
3, `isMobile`, `hasTouch`; taps, not clicks):

1. `document.documentElement.scrollWidth <= innerWidth` (and body) — no
   sideways scroll after the full sim runs.
2. Article and marker bounding boxes stay inside the viewport; the
   document column is ≥90% of viewport width.
3. The bottom bar is visible; both buttons measure ≥44px tall.
4. At load, no sheet is open and both panels are off-screen/hidden —
   nothing overlaps the document (the reported defect, asserted dead).
5. Tap "documents" → library sheet arrives on screen, inside the viewport,
   `aria-expanded` flips, document rows ≥44px; a tap on the scrim closes
   it.
6. Tap "what happened" → history sheet shows the sim's 4 records with a
   ≥44px undo button; tapping the same bar button closes it.
7. The "did you mean…" prompt is on screen with ≥44px options; tapping the
   first candidate performs the range highlight (blocks 3–4) and clears
   the ask — same semantics the desktop e2e proves with clicks.

**desktop viewport** (1280x800): no horizontal overflow; the bottom bar is
`display: none`; the scrim does not render; both panels are still
`position: sticky` and laid out as flanking columns (library right edge ≤
article left edge ≤ history left edge) — the desktop layout is unchanged.

## Build (verbatim tail)

Command: `npx vite build`

```
dist/assets/pdf-wHCbhqAD.js                427.30 kB │ gzip: 127.39 kB

✓ built in 146ms
```

## Visually confirmed

Loaded the dev server at a 375x812 viewport (dark scheme): full-width
document with the marker inside the viewport, bottom bar present, history
sheet sliding over the document above the bar with thumb-sized undo/send,
sticky "did you mean…" prompt with large options. Closed cleanly.

## Blockers hit and resolved (depth ≤2)

1. **CSS source order** — the phone media query was first inserted where
   the old one-column rule lived, *before* the base `#marker`/`.panel`
   rules it overrides; equal specificity meant the base rules won and the
   marker overflowed the viewport (caught by the new test). Moved the
   whole narrow-width block to the end of the stylesheet.
2. **Two e2e timing races** — (a) the sheet-open assertion measured the
   panel mid-slide; fixed by waiting for the panel's rect to arrive
   on-screen. (b) `vite preview --strictPort` on a fixed port raced a
   not-yet-released server from a previous run (intermittent
   ERR_CONNECTION_REFUSED); fixed by dropping `--strictPort` and driving
   the test at whatever URL the server itself announces, plus one goto
   retry.

## Honest edges

- The narrow breakpoint is the existing 960px, so small tablets get the
  sheet treatment too — better than the sticky-column overlap they had.
- `overflow-x: clip` on the body at narrow widths is a guard rail, not the
  fix; the e2e also asserts the real boxes (article, marker, sheets) stay
  inside the viewport so the guard cannot mask a regression silently.
- The status line for "show me what I've done" still says "the panel on
  the right"; on a phone the history sheet opens at the same moment, so
  the words point at what just appeared. Copy left as-is per the order.
