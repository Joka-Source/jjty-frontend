# receipt B1-PWA — installable, offline jt

Repo: `/Users/apple/projects/blitz/b1-pwa` · branch `blitz/b1-pwa` · base
`635fb3272b0c468d2bd7f1a0e76cb10f7ff6b081` (`main`, 35/35).

## What shipped

1. `public/manifest.webmanifest` names the app `jt`, uses `standalone`, and
   declares the generated lowercase `jt` PNGs at 192px and 512px as both
   `any` and `maskable`. `index.html` links the manifest, theme color, and
   Apple touch icon.
2. `scripts/generate-icons.mjs` reproducibly draws and PNG-encodes the
   lowercase wordmark. The blue field reaches every edge; the white wordmark
   stays inside the maskable safe zone. Generated artifact SHA-256 values:
   - `jt-192.png` — `77825dac80835d34b6760124ebd359544a13ab9dc270374469356124bbce1220`
   - `jt-512.png` — `d3eb558ac792da1fd67f8fbb9e18ec882aef548cd896dc14e904be5675794af6`
3. `vite.config.js` inspects the completed `dist` directory and emits
   `dist/sw.js`. Its cache is `jt-shell-0.1.0`, derived directly from
   `package.json`; its precache list is the actual built HTML, manifest,
   icons, hashed JS/CSS, wasm, and PDF worker artifacts.
4. The generated service worker is network-first for navigations with cached
   `index.html` fallback, cache-first for same-origin hashed `/assets/`
   requests, and deletes older `jt-shell-*` version caches on activation.
5. `src/pwa.js` registers that worker only in production, leaving Vite
   development uncached.
6. Settings now has exactly two install states:
   - captured `beforeinstallprompt`: show the real `install jt` button and call
     the browser event's `prompt()`;
   - no captured event: show manual plain-word help — iOS/iPadOS Safari says
     `Share` → `Add to Home Screen`; other browsers say browser menu →
     `Install jt` / `Add to home screen`.
7. The install hint appears only inside the `beforeinstallprompt` handler. It
   is marked seen when first displayed, so it cannot repeat after reload.
   Delete-all clears that local setting with the rest of jt's device data.
8. `test/pwa.e2e.test.mjs` adds four production-build browser proofs:
   manifest + real PNG dimensions; worker activation; network-disabled
   navigation serving the shell and reopening the exact IndexedDB document;
   platform manual copy, real prompt call, and hint-once behavior.
9. `docs/PLAY_STORE_TWA.md` provides current Bubblewrap init/build/install,
   API 36, Digital Asset Links, local-vs-Play signing, device verification,
   and Internal-test release steps. Every package, signing, identity, listing,
   credential, and release choice is marked **[FOUNDER KEY]**.

## Decisions recorded

- The founder's install decision was applied verbatim in behavior: no generic
  disabled install button. A real prompt button exists only when the browser
  supplies the prompt; otherwise a truthful platform path is shown.
- Android normally supplies `beforeinstallprompt`; if it does not, the generic
  browser-menu path remains accurate. iPadOS desktop-style user agents are
  detected as iOS when touch points are present.
- The hint is “one-time” by first display, not by dismissal. This prevents a
  crash, reload, or ignored hint from becoming repeated nagging.
- A zero-dependency Vite plugin was selected over Workbox and over a static
  service worker. The former is unnecessary for two explicit strategies; the
  latter would go stale whenever Vite changes a hashed filename.
- All built client files are considered the offline shell. That is deliberate:
  a document may need wasm matching or the PDF/runtime chunks after the network
  disappears.
- The package version is the cache-release key. A release that must invalidate
  the whole shell cache must bump `package.json` version.
- A new worker does not call `skipWaiting()`. Existing tabs keep their old
  worker/cache until they close, so a version update cannot delete an old
  tab's not-yet-loaded hashed PDF or math chunk.
- `npm test` builds once before Node starts test files. Browser files share the
  completed immutable `dist` instead of one test deleting/rebuilding it while
  another preview server is reading it.
- TWA packaging was documented, not fabricated. Production origin, permanent
  application ID, keystore, Play identity/signing certificate, listing, policy
  declarations, testers, territories, and release approval remain founder
  inputs.

## Red proof

Before production changes, the new suite ran alongside the inherited suite:

```text
ℹ tests 39
ℹ suites 0
ℹ pass 35
ℹ fail 4
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

The four intended failures were: missing manifest link, no service-worker
registration, no worker for offline navigation, and absent install controls.

## Independent review

The required read-only code review found two important issues and one stale
observation:

1. Forced worker takeover could strand old tabs after cache deletion — fixed by
   removing `skipWaiting()`.
2. PWA e2e rebuilt shared `dist` concurrently with inherited preview tests —
   fixed by making `npm test` perform one serial Vite build and making every
   browser test consume it.
3. The reviewer initially reported the receipt absent; this file was created
   concurrently while the read-only review was running.

The review's minor observation was that a separately installed standalone
window can still show manual install directions in settings. The founder rule
says the unavailable-prompt state shows manual directions, so this remains the
specified behavior rather than inventing a third state.

## Verify — full suite (verbatim)

Command: `npm test`

```text
> jt-web@0.1.0 test
> vite build && node --test test/*.test.mjs

vite v8.2.1 building client environment for production...
transforming...✓ 151 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                             15.72 kB │ gzip:   4.48 kB
dist/assets/jt_core_bg-DllRKYj6.wasm       333.17 kB │ gzip: 157.32 kB
dist/assets/pdf.worker.min-CHFwMXne.mjs  1,262.39 kB
dist/assets/index-COiJ-lkp.css              14.92 kB │ gzip:   3.54 kB
dist/assets/jt_core_bg-CJHBLLcm.js           0.06 kB │ gzip:   0.08 kB
dist/assets/pdf.worker.min-C8Ts8bNu.js       0.06 kB │ gzip:   0.08 kB
dist/assets/jt_core-CtLh492r.js              5.71 kB │ gzip:   2.12 kB
dist/assets/index-CRd0sGAA.js              221.13 kB │ gzip:  68.29 kB
dist/assets/pdf-BW9UOSfE.js                427.30 kB │ gzip: 127.39 kB

[INEFFECTIVE_DYNAMIC_IMPORT] vendor/jt-speech/math/spokenMathToLatex.js is dynamically imported by src/shell.js but also statically imported by vendor/jt-speech/index.js, dynamic import will not move module into another chunk.

✓ built in 201ms
✔ sim replay: records created, schema-valid, undo works (7471.231625ms)
✔ text ingestion returns blocks with provenance (digest + byte size) (16.227292ms)
✔ paste ingestion carries provenance too (2.17125ms)
✔ pdf page text assembly matches the node connector's algorithm (0.422166ms)
✔ pdf ingestion: per-page blocks, page locators, provenance from raw bytes (5.222625ms)
✔ all eight jt-speech intents map onto app commands (13.399292ms)
✔ plain prose stays reading — no phantom commands (10.176584ms)
✔ ambiguity maps to ask and never to an act (1.594792ms)
✔ evidence rides along on every intent (0.321041ms)
✔ matcher finds a read passage despite mishearings (7.240708ms)
✔ command grammar (jt-speech intents) (7.7155ms)
✔ phone viewport: full-width document, sheet panels, 44px targets, no sideways scroll (8216.255667ms)
✔ desktop viewport: three-column layout intact, no bottom bar, no sideways scroll (5468.138875ms)
✔ glide approaches the target monotonically and never overshoots (0.81775ms)
✔ retargeting mid-flight re-glides from the current position (0.186875ms)
✔ confirmation ripple energy strictly decays — the water always calms (0.145625ms)
✔ comeToRest stops at the predictable resting point (0.101208ms)
✔ org store: institution -> space -> membership, all schema-valid (1.733167ms)
✔ org store: the contract rejects bad records before they are kept (0.398916ms)
✔ org store: persistence round-trips through Storage and survives garbage (0.305042ms)
✔ org store: schema enums are exported for the UI, not retyped (0.237084ms)
✔ parity: JS matcher and wasm engine emit identical block sequences (124.186417ms)
✔ parity: wasm cursor record validators agree with the vendored schemas (1.4695ms)
✔ pwa manifest is linked, standalone, and carries generated maskable 192/512 icons (5232.448333ms)
✔ production app registers and activates its service worker (3939.677917ms)
✔ offline navigation serves the shell and reopens an IndexedDB document (3150.404542ms)
✔ manual install help is platform-specific and the installable hint appears once (3922.344417ms)
✔ golden cursor fixtures validate (3.781ms)
✔ golden receipt fixtures validate (2.824041ms)
✔ makeCursor output validates against cursor.schema.json (2.66575ms)
✔ makeReceipt output validates against receipt.schema.json (0.159417ms)
✔ every act kind produces a valid cursor + receipt pair (0.3845ms)
✔ undo entries reference the reversed act (0.148458ms)
✔ desktop shell walk: first-run once, every surface, settings persist, export, spaces, delete-all (11400.108292ms)
✔ phone shell walk: bottom bar reaches everything, sheets, 44px targets, no overflow anywhere (4790.506667ms)
✔ moment-send: pair two pages by spoken words, send a kept act, verify (9792.753292ms)
✔ spoken recipient words become a valid pair code — or honestly nothing (5.193834ms)
✔ a kept act becomes a full moment: blocks, records, provenance (4.019125ms)
✔ without stored provenance the digest is computed, never omitted (9.207958ms)
ℹ tests 39
ℹ suites 0
ℹ pass 39
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 16712.717333
```

## Verify — final production build (verbatim)

Command: `npm run build`

```text
> jt-web@0.1.0 build
> vite build

vite v8.2.1 building client environment for production...
transforming...✓ 151 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                             15.72 kB │ gzip:   4.48 kB
dist/assets/jt_core_bg-DllRKYj6.wasm       333.17 kB │ gzip: 157.32 kB
dist/assets/pdf.worker.min-CHFwMXne.mjs  1,262.39 kB
dist/assets/index-COiJ-lkp.css              14.92 kB │ gzip:   3.54 kB
dist/assets/jt_core_bg-CJHBLLcm.js           0.06 kB │ gzip:   0.08 kB
dist/assets/pdf.worker.min-C8Ts8bNu.js       0.06 kB │ gzip:   0.08 kB
dist/assets/jt_core-CtLh492r.js              5.71 kB │ gzip:   2.12 kB
dist/assets/index-CRd0sGAA.js              221.13 kB │ gzip:  68.29 kB
dist/assets/pdf-BW9UOSfE.js                427.30 kB │ gzip: 127.39 kB

[INEFFECTIVE_DYNAMIC_IMPORT] vendor/jt-speech/math/spokenMathToLatex.js is dynamically imported by src/shell.js but also statically imported by vendor/jt-speech/index.js, dynamic import will not move module into another chunk.

✓ built in 338ms
```

Command: `node --check dist/sw.js`

```text
```

Exit: `0` (the syntax checker prints no output on success).

## Verify — generated worker inspection (verbatim)

```text
version=0.1.0
cache=jt-shell-0.1.0
precache_entries=12
./assets/index-COiJ-lkp.css
./assets/index-CRd0sGAA.js
./assets/jt_core-CtLh492r.js
./assets/jt_core_bg-CJHBLLcm.js
./assets/jt_core_bg-DllRKYj6.wasm
./assets/pdf-BW9UOSfE.js
./assets/pdf.worker.min-C8Ts8bNu.js
./assets/pdf.worker.min-CHFwMXne.mjs
./icons/jt-192.png
./icons/jt-512.png
./index.html
./manifest.webmanifest
network_first_navigation=true
cache_first_hashed_assets=true
offline_shell_fallback=true
forced_takeover=false
```

Final focused reviewer readback: `Unresolved Critical/Important items: None.`
Verdict: `Ready to merge after the planned final gate evidence is appended.`
The evidence above closes that gate.

## Remaining external gaps

- No production PWA origin was supplied or deployed in this order.
- No Android package, keystore, APK/AAB, Digital Asset Links deployment, Play
  Internal-test install, or public release was created. Those require the
  **[FOUNDER KEY]** inputs and release approval listed in
  `docs/PLAY_STORE_TWA.md`.
- The existing Vite spoken-math dynamic-import note remains. It is a chunking
  note, not a test/build failure, and predates B1-PWA.
