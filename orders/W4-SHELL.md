# order W4-SHELL — the complete application shell

Standing UI lane, 1.5-hour sprint, branch `wo/w4-shell` off `main` (29/29).

Founder's direction, verbatim intent: this is **"not a demo; it is a real
app"** — the complete application shell where every screen of the end state
exists and interlinks, real function behind everything already built, honest
designed placeholders behind what isn't. Make the product extra real and
complete.

## Surfaces to build

1. **First-run** — one screen of plain words on what jt is, then THE moment:
   one mic permission ask framed as the door to the whole product ("after
   this, speaking is the interface"). Remembered; never asked again.
   Skippable into read-only that invites voice later.
2. **Home / library** — the document library elevated to the home surface;
   documents with provenance visible; ingest affordances prominent; designed
   empty state.
3. **The surface (reading + acting)** — the existing core screen, polished:
   consistent header, document title + provenance disclosure, live listening
   indicator with graceful states (listening / paused / no mic / engine
   fallback).
4. **What happened (history)** — elevated to a full surface, filterable by
   document, records expandable to evidence, undo everywhere.
5. **Sharing (send + inbox)** — pairing explained in plain words (three
   spoken words, why not codes-on-screens); verified badge explained on tap.
6. **Spaces (PROVISIONAL)** — wire the real membership store from
   jt-contracts (institution/cohort/space/membership) locally in-browser;
   marked "early — shape may change"; NO fake seeded people.
7. **Settings** — engine (wasm/js + status), speech language, motion
   intensity (drives jt-water params), data (real export-all JSON, real
   delete-all with confirm), about (lowercase jt, version, "records stay on
   this device").
8. **Honest rooms** — designed surfaces for spoken-math → LaTeX (jt-speech
   v0 may be wired behind a "try it" input) and cross-device place
   carry-over; inviting, not apologetic, no fake output.

## Craft rules

One coherent visual language extending the existing one; jt-water motion for
all transitions (no CSS easing snuck in); designed empty/error states in
plain human words; touch targets ≥44px; no horizontal overflow at 390px;
keyboard accessible. Banned in user-facing copy: Margin as a name, locus,
settle/recede/receipt as UI nouns, sea/drops/shells as product nouns, QR
anything. Wire names stay internal.

## Proof

Extend the puppeteer e2e with a navigation walk: every surface at phone and
desktop size, interlinks work, first-run appears exactly once, settings
changes persist, export produces valid JSON, spaces create/list works, no
overflow anywhere. All 29 existing tests stay green; additions bring their
own. Receipt with verbatim outputs.
