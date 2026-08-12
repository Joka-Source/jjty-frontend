# B2-MATHVOICE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build voice-controlled spoken mathematics whose translated expressions become durable, undoable, exportable, sendable jt acts.

**Architecture:** A pure `src/math.js` module owns math-mode phrases, translation, spoken-document construction, and record options. `src/main.js` routes final segments to it while math mode is active and binds it to the existing act engine, records, IndexedDB, history, sync, and a local KaTeX workbench.

**Tech Stack:** Browser ES modules, IndexedDB, vendored jt-speech translator, pinned KaTeX, Vite, Node test runner, Puppeteer/Chrome.

## Global Constraints

- Do not use runtime network resources for KaTeX.
- Surface unparsed words honestly and preserve them in the durable wrapper.
- Keep the 65k dataset untouched pending provenance and state that plainly.
- With no open document, create or reuse `spoken mathematics` with source `spoken`, created by `voice`.
- With a reading document open, anchor to its current block and never invent an anchor.
- All existing history, undo, export, and send paths must carry math acts.
- Preserve the 35 starting tests and add unit plus end-to-end proof.

---

### Task 1: Pure translation-to-record contract

**Files:**
- Create: `src/math.js`
- Modify: `src/records.js`
- Modify: `src/acts.js`
- Test: `test/math.test.mjs`

**Interfaces:**
- Produces: `mathControl(text, active)`, `translateSpokenMath(text)`, `makeSpokenMathDocument(existing, expression)`, and math fields accepted by `makeActEntry` / `engine.perform`.

- [ ] Write a unit test with hand-derived expectations for control phrases, `one half plus x squared` -> `\\frac{1}{2} + x^{2}`, spoken-document provenance, and a schema-valid `act: "math"` cursor/receipt pair.
- [ ] Run `node --test test/math.test.mjs` and confirm failure because `src/math.js` and math act semantics do not exist.
- [ ] Implement only the pure helpers and math act factory/engine fields needed by the test.
- [ ] Run `node --test test/math.test.mjs test/records.test.mjs` and confirm both pass.

### Task 2: Voice routing and local KaTeX workbench

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `index.html`
- Modify: `src/main.js`
- Modify: `src/style.css`
- Test: `test/e2e.test.mjs`

**Interfaces:**
- Consumes: Task 1 helpers and `engine.perform("math", blockIndex, options)`.
- Produces: `window.__jtApp.math` test surface; mode button; input/output/unparsed surface; session strip; voice final-segment route.

- [ ] Vendor pinned KaTeX from the local npm cache and extend the established sim e2e to enter math mode, process a simulated final segment, say `keep that`, and assert rendered/session/history state plus schema-valid records.
- [ ] Run the sim e2e and confirm failure because the workbench and hooks do not exist.
- [ ] Add accessible workbench markup, import local KaTeX/CSS, implement mode and keep handlers, and route final segments according to mode.
- [ ] Run `node --test test/e2e.test.mjs` until it passes, then run `node --test test/mobile.e2e.test.mjs test/shell.e2e.test.mjs` to catch layout or navigation regressions.

### Task 3: Durable no-document and existing-system integration

**Files:**
- Modify: `src/main.js`
- Modify: `src/sync.js`
- Modify: `test/math.test.mjs`
- Modify: `test/e2e.test.mjs`

**Interfaces:**
- Consumes: document builders and existing `putDoc`, `openDocument`, `sendEntry`, `exportData`, `engine.undo`.
- Produces: create/reuse/append behavior for the spoken document; math content in sent moment blocks; verified undo/export behavior.

- [ ] Add failing tests for no-document create/reuse provenance, reading-block anchoring, math moment content, history undo, and export inclusion.
- [ ] Run the targeted tests and confirm failures name the missing integrations.
- [ ] Implement the minimal create/reuse/append, anchoring, sync block, undo-render, and export paths.
- [ ] Re-run targeted tests and confirm they pass.

### Task 4: Full proof, receipt, and commit

**Files:**
- Create: `receipts/B2-MATHVOICE.md`
- Review: every changed file

**Interfaces:**
- Consumes: all completed tasks.
- Produces: exact verification evidence and committed branch.

- [ ] Run `npm test` and capture the complete verbatim output.
- [ ] Run `npm run build` and capture the complete verbatim output.
- [ ] Inspect emitted assets for remote KaTeX URLs and exercise the UI in Chrome at desktop and phone widths.
- [ ] Write the receipt with decisions, file inventory, and verbatim outputs.
- [ ] Review `git diff --check`, the full diff, and repository status; rerun any verification affected by receipt edits.
- [ ] Commit all B2-MATHVOICE files on `blitz/b2-mathvoice` and confirm the branch is clean at the new SHA.
