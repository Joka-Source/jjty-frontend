# W-11 — reading fidelity: PDFs that behave like documents

Repo/worktree: `/Users/apple/projects/wo/W-11-reading`
Branch: `wo/w-11-reading`  (base: `main` @ `5afc305`)

## Context
`jt-web` already resolves spoken intent to an exact span and keeps durable records against it. The
workspace now needs the reading surface to be worth acting on: real PDF pages, a real text layer,
zoom, and in-document search — **without breaking the anchors that acts depend on.**

`pdfjs-dist` is already a dependency. Read `src/anchors.js`, `src/highlight.js`, `src/match.js` and
`src/db.js` before designing. Anchors are two-anchor (quote + context) with a positional hint as
cache, matched by the `jt-core` wasm kernel — the geometry you add is a *fallback and audit trail*,
never the primary address. 75 tests pass today and every one must still pass.

Order W-11 runs alongside W-10 (the library), which is adding multi-source persistence in the same
repo. Keep your surface area tight and avoid restructuring shared modules; the judge merges both.

## Steps
1. Render PDF pages with a selectable text layer, so a span in a PDF can be highlighted the same way
   a span in plain text is today.
2. Zoom and reflow that do not invalidate existing anchors. An anchor resolved before a zoom change
   must still resolve after it. This is the acceptance test that matters most.
3. In-document search with hit navigation: next/previous, a visible count, and a trustworthy "no
   matches" rather than silence.
4. Keep text stable while it is being read — no motion, reflow or reposition beneath a passage the
   person is acting on. This is a hard product law, not a preference.
5. Honest failure: an encrypted, corrupt or image-only PDF says exactly that and offers what it can
   (for an image-only PDF, say there is no text layer rather than showing an empty one).

## Verify
```
cd /Users/apple/projects/wo/W-11-reading && npm ci && npm test; echo EXIT=$?
```
All existing tests must pass. Add tests for: anchor survival across a zoom change, search hit
navigation and the empty result, and the image-only/encrypted refusals. Write the anchor-survival
test **first**, show it failing against the unfixed code, then passing. Paste both verbatim.

Chrome is at `/Applications/Google Chrome.app` for the e2e suites. If Chrome will not launch in your
sandbox, run the non-browser suite and state plainly which cases you could not execute — do not
claim them.

## Done means
A PDF opens, reads, zooms and searches; an anchor resolved before a zoom still resolves after it,
proven by test; refusals are explicit; the suite is green at a higher count than 75.

## Forbidden
- Do not make geometry the primary anchor. Quote + context remain the address.
- Do not move or reflow text under an active act.
- Do not restructure `src/db.js` or the verb registry — W-10 is working there.
- Do not weaken, skip or delete an existing test to get green.
- No `locus`, `settle`, `recede`, `receipt` as a UI noun, `Margin`, `QR`, or
  sea/drop/shell/bubble/island product nouns in user-facing copy. Brand is lowercase `jt`.
- Do not push. Do not touch `main`.

## Receipt
`receipts/W-11.md`: the anchor-survival test failing then passing, verbatim; full suite result with
counts; what you could not execute; commit SHA; open questions.

---

## Standing rules
1. One order, one worktree, one branch. Never work on `main`.
2. A receipt with pasted verify output is the only proof that counts. Red gate before green gate.
3. Record failures verbatim; never claim a tier of evidence you did not reach.
4. Never stop early. Self-resolve blockers to depth 2, then record under "Open questions" and finish
   everything else.
5. Invent nothing.
6. Commit the order file and the receipt alongside the work. Do not push. The judge merges.
