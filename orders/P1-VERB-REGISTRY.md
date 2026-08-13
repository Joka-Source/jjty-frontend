# P1 Verb Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the verb registry the single runtime source for jt's implemented and designed capabilities, including intent routing, act execution, honest designed rooms, and `#/capabilities`.

**Architecture:** Every verb is a self-describing module under `src/registry/verbs/`. A validated registry indexes those modules by canonical id, speech intent, and stored-record alias; product consumers resolve and execute modules through that API rather than maintaining verb maps or switches. The capability page and designed-room surface render the live registry, so runtime registration is visible without editing either surface.

**Tech Stack:** Browser-native JavaScript modules, Node test runner, Vite, Puppeteer, IndexedDB.

**Spec:** `/Users/apple/Documents/Codex/2026-08-10/get/outputs/JT_CAPABILITY_MAP_V2_2026-08-13.md`

## Global Constraints

- Preserve all 68 baseline tests and add registry unit coverage plus a real-browser capability-page proof.
- Required implemented ids: `highlight`, `highlight-range`, `annotate`, `mark-important`, `send-to`, `send-to-space`, `undo`, `return`, `open-document`, and `math-keep`.
- Required designed ids: `find`, `quote`, `gather`, `compare`, `remind`, `translate-this`, `capture`, `share-sheet-intake`, `cross-device-drop`, and `togetherness`.
- Every module exposes `id`, `spokenForms`, a plain description, `argsSchema`, `recordKinds`, `status`, `execute(ctx, args)`, and `testReference`.
- Designed execution may only open its honest room; it must never create an act or imply that the capability ran.
- Shell, intent wiring, record construction, and act effects consume registry modules rather than hardcoded verb lists.
- User-facing copy must not introduce the banned terms in the order prompt.
- Repository `/Users/apple/projects/blitz/p1-registry`; branch `blitz/p1-registry`; starting SHA `9d1611813854249d65353995474a7e31880c0447`.

---

### Task 1: Registry contract and complete catalog

**Files:**
- Create: `src/registry/define.js`
- Create: `src/registry/index.js`
- Create: `src/registry/verbs/*.js`
- Test: `test/registry.test.mjs`

**Interfaces:**
- Produces: `verbRegistry.list()`, `verbRegistry.get(id)`, `verbRegistry.forIntent(intent)`, `verbRegistry.resolve(idOrStoredAlias)`, and `verbRegistry.register(module)`.
- Produces: modules with `execute(ctx, args)` and optional registry-owned intent, record wording, and DOM-effect adapters.

- [x] **Step 1: Write the failing registry contract test.**

```js
assert.deepEqual(verbRegistry.list().map(({ id }) => id).sort(), expectedIds.sort());
assert.equal(typeof verb.execute, "function");
```

- [x] **Step 2: Run the focused test and capture the missing-module failure.**

Run: `node --test test/registry.test.mjs`

- [x] **Step 3: Implement validation, indexing, all real modules, and all designed modules.**

```js
verbRegistry.register({ id, spokenForms, description, argsSchema, recordKinds, status, execute, testReference });
```

- [x] **Step 4: Re-run the focused registry test.**

Run: `node --test test/registry.test.mjs`

### Task 2: Registry-only intent and act paths

**Files:**
- Modify: `src/intents.js`
- Modify: `src/main.js`
- Modify: `src/acts.js`
- Modify: `src/records.js`
- Test: `test/intents.test.mjs`
- Test: `test/e2e.test.mjs`

**Interfaces:**
- Consumes: `verbRegistry.forIntent()` and each module's `commandFromIntent`, `describeIntent`, `execute`, `applyEffect`, `reverseEffect`, `recordDescription`, and `recordResult` hooks.
- Produces: existing command and stored-record shapes plus canonical `verbId` provenance.

- [x] **Step 1: Extend registry tests to prove speech intent lookup and stored aliases resolve through modules.**
- [x] **Step 2: Remove the intent map/switch and route recognized intents through registry metadata.**
- [x] **Step 3: Replace command verb cases with `verb.execute(executionContext, args)`.**
- [x] **Step 4: Replace act and record verb branches with registry-owned effect and wording hooks.**
- [x] **Step 5: Run registry, intent, record, and sim tests.**

Run: `node --test test/registry.test.mjs test/intents.test.mjs test/records.test.mjs`

### Task 3: Generated capability and honest room surfaces

**Files:**
- Create: `src/capabilities.js`
- Modify: `index.html`
- Modify: `src/shell.js`
- Modify: `src/style.css`
- Test: `test/capabilities.e2e.test.mjs`

**Interfaces:**
- Consumes: `verbRegistry.list()` at render time.
- Produces: `#/capabilities`, `[data-capability-id]` rows, and `#/rooms/<verb-id>` for designed entries.

- [x] **Step 1: Write a browser test that registers a dummy module after boot and requires it to appear on refresh.**
- [x] **Step 2: Add empty semantic containers to HTML; do not duplicate capability metadata there.**
- [x] **Step 3: Render name, spoken forms, status, record kinds, and one-line description from the live registry.**
- [x] **Step 4: Make designed actions open the registry description in an explicit not-built room.**
- [x] **Step 5: Run the capability browser proof.**

Run: `npm run build && node --test test/capabilities.e2e.test.mjs`

### Task 4: Verification, receipt, and commit

**Files:**
- Create: `receipts/P1-VERB-REGISTRY.md`
- Verify: complete changed tree

**Interfaces:**
- Consumes: final test/build/grep/diff outputs.
- Produces: an evidence-bearing completion record and a commit on `blitz/p1-registry` if the Git index is writable.

- [x] **Step 1: Run the focused registry and capability proofs.**
- [x] **Step 2: Run `npm test` and confirm the original 68 plus new tests pass.**
- [x] **Step 3: Run registry-consumer grep, banned-copy grep, and `git diff --check`.**
- [x] **Step 4: Record the verbatim command outputs and exact changed files in the receipt.**
- [ ] **Step 5: Review the diff, stage only scoped files, and commit.** Blocked: repository metadata denied creation of `.git/index.lock`; exact output is in the receipt.

Run: `git add orders/P1-VERB-REGISTRY.md receipts/P1-VERB-REGISTRY.md src test index.html && git commit -m "feat: build verb registry"`
