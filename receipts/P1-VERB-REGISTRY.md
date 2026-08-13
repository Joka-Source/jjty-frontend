# P1-VERB-REGISTRY Completion Record

## Authority and provenance

- Order: `P1-VERB-REGISTRY`
- Repository: `/Users/apple/projects/blitz/p1-registry`
- Branch: `blitz/p1-registry`
- Starting SHA: `9d1611813854249d65353995474a7e31880c0447`
- Date: 13 August 2026
- Design authority read: `/Users/apple/Documents/Codex/2026-08-10/get/outputs/JT_CAPABILITY_MAP_V2_2026-08-13.md`
- Repository context read: `README.md`, `src/`, and `receipts/FIX-FLAGSHIP.md`

## Outcome

The verb registry is now the runtime source for jt capability identity, speech routing, execution, record behavior, history labels, the capability catalog, and designed-room routing.

- Each verb is a self-describing module in `src/registry/verbs/` with `id`, `spokenForms`, plain `description`, `argsSchema`, `recordKinds`, `status`, `execute(ctx, args)`, and `testReference`.
- The registry validates module shape and uniqueness across canonical ids, speech intents, and stored-record aliases. Cross-namespace id/alias shadowing is rejected in either registration order.
- Intent routing resolves the module through `verbRegistry.forIntent()`.
- Command execution calls the resolved module's `execute()` through a shared execution context.
- Act effects, reversals, stored-record wording, return-record construction, history titles, and math moment transport resolve through registry hooks.
- `#/capabilities` renders the live registry at runtime. Its browser proof registers a dummy module after boot and verifies that the page renders its id, spoken form, status, record kind, and description.
- Designed capabilities cannot run caller-supplied behavior. Registration replaces their executor with a registry-controlled route to an honest not-built room. Direct `#/rooms/<id>` navigation and reload reconstruct that room from the registry.
- `show-history` is registered as an auxiliary real verb so the pre-existing command is not retained as a registry-bypassing shell exception.

## Registered catalog

Real (11):

`highlight`, `highlight-range`, `annotate`, `mark-important`, `send-to`, `send-to-space`, `undo`, `return`, `open-document`, `math-keep`, `show-history`

Designed (10):

`find`, `quote`, `gather`, `compare`, `remind`, `translate-this`, `capture`, `share-sheet-intake`, `cross-device-drop`, `togetherness`

## Test-first evidence

Initial registry contract red gate, verbatim excerpt:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/Users/apple/projects/blitz/p1-registry/src/registry/index.js'
```

Final review edge-case red gate, verbatim output:

```text
✖ registration rejects malformed modules and stored alias collisions (0.370958ms)
ℹ tests 6
ℹ suites 0
ℹ pass 5
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 81.711416

✖ failing tests:

test at test/registry.test.mjs:93:1
✖ registration rejects malformed modules and stored alias collisions (0.370958ms)
  AssertionError [ERR_ASSERTION]: Missing expected exception.
```

The cross-namespace checks were then implemented and both alias-first and id-first cases pass.

## Final verification evidence

### Full production build and suite

Command:

```text
npm test
```

Exit: `0`

Verbatim build excerpt:

```text
vite v8.2.1 building client environment for production...
transforming...✓ 183 modules transformed.
dist/assets/index-B2gnPurh.css                           51.08 kB │ gzip:  13.00 kB
dist/assets/pdf-DNnloOCu.js                             427.30 kB │ gzip: 127.39 kB
dist/assets/index-D73zQbs4.js                           529.44 kB │ gzip: 159.63 kB
✓ built in 353ms
```

Verbatim new browser proof line:

```text
✔ capability page is generated from the live registry and designed verbs open honest rooms (4006.93575ms)
```

Verbatim final summary:

```text
ℹ tests 75
ℹ suites 0
ℹ pass 75
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 59725.98175
```

This is the original 68-test suite plus 7 added registry/capability tests.

Vite retained two non-failing pre-existing build warnings: the spoken-math module is both statically and dynamically imported, and one generated chunk exceeds 500 kB.

### Focused registry and record verification

Command:

```text
node --test test/registry.test.mjs test/records.test.mjs
```

Verbatim summary:

```text
ℹ tests 15
ℹ suites 0
ℹ pass 15
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 168.971958
```

### Structural audits

Verbatim output:

```text
--- git diff check ---
clean
--- registry consumers audit ---
no hardcoded verb maps, switches, or act branches found
--- banned user-facing string audit ---
no banned user-facing string literals found
--- registry inventory ---
{
  "count": 21,
  "byStatus": {
    "real": 11,
    "designed": 10
  },
  "ids": [
    "highlight",
    "highlight-range",
    "annotate",
    "mark-important",
    "send-to",
    "send-to-space",
    "undo",
    "return",
    "open-document",
    "math-keep",
    "show-history",
    "find",
    "quote",
    "gather",
    "compare",
    "remind",
    "translate-this",
    "capture",
    "share-sheet-intake",
    "cross-device-drop",
    "togetherness"
  ]
}
```

The consumer audit searched `src/` outside `src/registry/` for the removed hardcoded intent/act map names, verb switches, and act-kind branches. The copy audit searched user-visible string literals in `index.html`, the capability renderer, and every verb module.

## Review record

An independent read-only code review found and prompted fixes for:

1. Registry ownership of history titles and return-record construction.
2. Designed-room direct navigation and reload reconstruction.
3. Stronger runtime module validation and registry-controlled designed execution.
4. Cross-namespace canonical-id/stored-alias collisions in both registration orders.

The final re-review result was `Ready`; focused registry tests passed 6/6 and `git diff --check` was clean.

## Changed surfaces

- Registry: `src/registry/define.js`, `src/registry/index.js`, `src/registry/verbs/*.js`
- Consumers: `src/intents.js`, `src/acts.js`, `src/records.js`, `src/main.js`, `src/sync.js`
- Runtime catalog and rooms: `src/capabilities.js`, `src/shell.js`, `index.html`, `src/style.css`
- Tests: `test/registry.test.mjs`, `test/capabilities.e2e.test.mjs`, `test/shell.e2e.test.mjs`
- Work records: `orders/P1-VERB-REGISTRY.md`, `receipts/P1-VERB-REGISTRY.md`

## Git handoff

Scoped staging was attempted with:

```text
git add orders/P1-VERB-REGISTRY.md receipts/P1-VERB-REGISTRY.md index.html src test
```

Verbatim result, exit `128`:

```text
fatal: Unable to create '/Users/apple/projects/blitz/p1-registry/.git/index.lock': Operation not permitted
```

No files were staged and no commit was created. The complete verified tree remains on `blitz/p1-registry`, ready for a writer with Git-metadata permission to run:

```text
git add orders/P1-VERB-REGISTRY.md receipts/P1-VERB-REGISTRY.md index.html src test
git commit -m "feat: build verb registry"
```
