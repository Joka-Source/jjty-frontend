# Initial PDF Engine Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consume the backend PDF-engine contract and route browser ingestion through an engine-neutral adapter while preserving the current PDF.js reader until licensed MuPDF.js is available.

**Architecture:** `src/pdf-engine.js` owns engine selection and public capability reporting. The current PDF.js module becomes an explicit migration adapter. `ingestPdfBrowser` consumes an adapter rather than assuming a vendor API, but remains backward compatible for existing callers during the slice. Requiring MuPDF without an available injected provider refuses visibly.

**Tech Stack:** JavaScript modules, Vite 8, Node test runner, existing `pdfjs-dist` 6.2.108.

**Spec:** `Joka-Source/jjty-human@88b6b887b9f689a69827eaf0b9f7096ffaf126e1:architecture/CONSUMER_SYSTEM.md`

## Global Constraints

- Do not add, download, accept or redistribute proprietary MuPDF code until commercial terms are executed.
- PDF.js remains an explicitly named migration path, never presented as MuPDF.
- BentoPDF is a workflow/corpus reference; no BentoPDF source or dependency is imported.
- Source bytes remain owned copies and provenance always names the active engine.
- Existing ingestion refusals for encrypted, corrupt and image-only PDFs remain observable.
- New behavior follows strict RED → GREEN tests.

---

### Task 1: Vendor the backend engine contract with provenance

**Files:**
- Create: `contracts/pdf-engine.contract.json`

**Interfaces:**
- Consumes: exact `jjty-backend` commit and `contracts/application/pdf-engine.contract.json`.
- Produces: byte-identical frontend contract copy with source repository/SHA recorded in the commit handoff.

- [ ] **Step 1: Copy the verified backend contract after the backend commit exists**

- [ ] **Step 2: Compare SHA-256 digests of backend and frontend copies; they must match**

### Task 2: Specify browser engine selection with failing tests

**Files:**
- Create: `src/pdf-engine.js`
- Create: `test/pdf-engine.test.mjs`

**Interfaces:**
- Produces:
  - `createPdfJsMigrationAdapter(pdfjs)`
  - `selectPdfEngine({ pdfjs, mupdf, requirePrimary })`
  - adapter `open(bytes)` returning `{ loadingTask, document, report }`.

- [ ] **Step 1: Write a failing test proving PDF.js is reported as migration toward MuPDF**

```javascript
test("browser selection names PDF.js as migration instead of disguising it as MuPDF", async () => {
  const engine = selectPdfEngine({ pdfjs: fakePdfJs });
  const opened = await engine.open(new TextEncoder().encode("%PDF fixture"));
  assert.deepEqual(opened.report, {
    contractVersion: 1,
    targetEngine: "mupdf",
    activeEngine: "pdfjs",
    activeLineage: "pdfjs-dist@6.2.108",
    state: "migration",
  });
});
```

- [ ] **Step 2: Run and verify RED because `src/pdf-engine.js` is absent**

```bash
node --test test/pdf-engine.test.mjs
```

- [ ] **Step 3: Add failing tests for injected MuPDF selection and `MUPDF_PRIMARY_UNAVAILABLE` refusal**

- [ ] **Step 4: Implement the minimal selection and adapter behavior**

- [ ] **Step 5: Run and verify GREEN**

### Task 3: Route real ingestion through the adapter

**Files:**
- Modify: `src/ingest.js`
- Modify: `src/main.js`
- Modify: `test/ingest.test.mjs`

**Interfaces:**
- Consumes: adapter `open(bytes)` and its report.
- Produces: ingestion result `pdfEngine` report and provenance from the selected adapter.

- [ ] **Step 1: Write a failing ingestion test proving the selected engine report survives on the real result and the adapter receives an owned copy**

- [ ] **Step 2: Write a failing test proving primary-required refusal preserves source provenance and returns an explicit engine-unavailable state**

- [ ] **Step 3: Run focused tests and verify RED**

```bash
node --test test/pdf-engine.test.mjs test/ingest.test.mjs
```

- [ ] **Step 4: Modify `ingestPdfBrowser` to normalize the legacy PDF.js argument through `createPdfJsMigrationAdapter`, then update the application path to select an adapter explicitly**

- [ ] **Step 5: Run focused tests and verify GREEN; encrypted/corrupt/image-only cases remain green**

### Task 4: Verify, commit and publish the frontend slice

- [ ] **Step 1: Run the complete frontend gate**

```bash
npm run check:vocabulary
npm test
git diff --check
```

Expected: build passes and all tests, including new engine tests, pass.

- [ ] **Step 2: Commit only the reviewed slice**

```bash
git add contracts/pdf-engine.contract.json src/pdf-engine.js src/ingest.js src/main.js test/pdf-engine.test.mjs test/ingest.test.mjs docs/superpowers/plans/2026-09-01-initial-pdf-engine-adapter.md
git commit -m "feat: add browser PDF engine boundary"
```

- [ ] **Step 3: Push `feat/initial-pdf-architecture` and verify local, tracking and remote SHAs match**
