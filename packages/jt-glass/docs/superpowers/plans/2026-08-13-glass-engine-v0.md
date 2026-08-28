# jt Glass Engine v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone event tap, explanatory panels, deterministic Replay Lab, offline demo, and checked jt-web integration patch.

**Architecture:** A typed event union feeds a pure state reducer. Both live subscriptions and JSONL replay use that reducer; framework-free custom elements render the derived state and the Replay Lab controls the cursor, outcome comparison, and recording.

**Tech Stack:** TypeScript modules, browser Custom Elements, Node 24 test runner and type stripping, HTML, CSS.

**Spec:** `docs/superpowers/specs/2026-08-13-glass-engine-v0-design.md`

## Global Constraints

- Brand is `jt` in lowercase.
- Zero runtime dependencies and zero demo network requests.
- Do not modify `/Users/apple/projects/jt-web`; ship only `patches/jt-web-tap.patch`.
- Interface copy uses plain human words and avoids every banned product term from the order.
- Events are ordered by integer `seq` and replay cursors are inclusive.
- The pinned jt-web main SHA is `7da8e677ddd7851b3f7f2cd9d35bf399a364cb7f` after the P1 registry merge landed during implementation.

---

### Task 1: Event contract and pure state

**Files:**
- Create: `test/tap.test.ts`
- Create: `src/tap.ts`
- Create: `src/state.ts`

**Interfaces:**
- Produces: `TapEvent`, `validateTapEvent(value)`, `createTap(sessionId)`, `reduceGlassState(state, event)`, `replay(events, throughSeq?)`.

- [ ] Write contract tests with literal valid events and malformed boundary values.
- [ ] Run `node --test test/tap.test.ts` and confirm failure because modules are absent.
- [ ] Implement the discriminated union, validation, subscriptions, JSONL encoding, and reducer.
- [ ] Run the focused test and confirm it passes.

### Task 2: Replay parser, recorder, and outcome diff

**Files:**
- Create: `test/replay.test.ts`
- Create: `src/replay.ts`
- Create: `fixtures/demo-session.jsonl`
- Create: `fixtures/demo-expected.json`
- Create: `fixtures/demo-mutated.jsonl`

**Interfaces:**
- Consumes: `TapEvent`, `GlassState`, `replay`.
- Produces: `parseJsonl(text)`, `diffOutcome(expected, actual)`, `createRecorder(tap)`.

- [ ] Write one test proving the same fixture yields byte-identical stable state and one proving a changed score is reported at an exact path.
- [ ] Run `node --test test/replay.test.ts` and confirm the missing implementation fails.
- [ ] Implement strict line parsing, stable outcome projection, recursive diffing, and live recording.
- [ ] Run the focused test and confirm it passes.

### Task 3: Framework-free panels and Replay Lab

**Files:**
- Create: `src/panels.ts`
- Create: `src/replay-lab.ts`
- Create: `src/index.ts`
- Create: `src/styles.css`

**Interfaces:**
- Consumes: `GlassState`, fixtures loaded by the demo entry, recorder and diff APIs.
- Produces: `mountGlass(root, options)`, registered `jt-glass` and `jt-replay-lab` custom elements.

- [ ] Add a rendering test for escaped plain-text output and panel state labels.
- [ ] Confirm the focused test fails without the components.
- [ ] Implement DOM-only panels, synchronized cursor controls, file loading, diff display, and JSONL download.
- [ ] Run the focused test and all prior tests.

### Task 4: Offline demo and build

**Files:**
- Modify: `scripts/build.mjs`
- Create: `scripts/serve.mjs`
- Create: `index.html`
- Create: `demo.ts`

**Interfaces:**
- Consumes: `mountGlass`, bundled fixture modules.
- Produces: static `dist/` runnable from a local HTTP server with no external assets.

- [ ] Write a build test that checks the output graph and that HTML contains no remote URLs.
- [ ] Confirm the test fails against the skeleton build.
- [ ] Implement type stripping, asset copying, fixture embedding, and a local static server.
- [ ] Run `npm run build` and inspect the demo in a browser at phone and desktop sizes.

### Task 5: jt-web integration patch

**Files:**
- Create: `patches/jt-web-tap.patch`

**Interfaces:**
- Consumes: `@jt/glass`, jt-web transcript and act paths.
- Produces: a development-only `#/glass` route and tap calls at existing boundaries.

- [ ] Build changes in a temporary copy created from jt-web main.
- [ ] Generate a standard patch without writing inside jt-web.
- [ ] Run `git -C /Users/apple/projects/jt-web apply --check patches/jt-web-tap.patch`.
- [ ] Scan the patch to confirm the host hook is small and production routing is unchanged.

### Task 6: Evidence and handoff

**Files:**
- Create: `orders/P4.md`
- Create: `receipts/P4.md`

**Interfaces:**
- Produces: exact commands and verbatim outputs for provenance, tests, build, copy scan, patch check, and git limitation.

- [ ] Run the full verification matrix fresh.
- [ ] Record every command and its exact output in `receipts/P4.md`.
- [ ] Run `git diff --check`, inspect status, and attempt the requested commit.
- [ ] Print the final summary with exact branch/SHA limits and artifact paths.
