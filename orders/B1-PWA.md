# order B1-PWA — installable, offline jt

Repo: `jt-web` · branch `blitz/b1-pwa` · base `635fb32` (`main`, 35/35).

## Outcome

Ship jt as a real progressive web app without changing the reading model:

1. A valid web app manifest named `jt`, launched in `standalone` mode.
2. Generated 192px and 512px maskable PNG icons using the lowercase `jt`
   wordmark, with enough safe-zone padding to survive circular and rounded
   masks.
3. A production service worker whose shell cache name is keyed by the exact
   `package.json` version. The built shell is derived from the files Vite
   actually emits, not a hand-maintained source list.
4. Navigation uses the network first and falls back to the cached built
   `index.html`. Hashed Vite assets use the cache first. Old version caches
   are removed on activation.
5. Offline navigation must load the full application shell and reopen a
   previously stored document from IndexedDB. This is proven in a real
   browser with the network disabled.
6. Install UX follows the founder decision:
   - while `beforeinstallprompt` is available, settings shows the real install
     button;
   - otherwise settings shows concise platform-specific manual steps;
   - iOS Safari copy names `Share` then `Add to Home Screen`;
   - the other path names the browser menu and `Install jt` / `Add to home
     screen`;
   - the one-time install hint is emitted only after the app is actually
     installable and is never shown a second time on that device.
7. `docs/PLAY_STORE_TWA.md` documents Bubblewrap packaging and marks every
   founder-controlled key, identity, listing, and release decision.

## Architecture and implementation calls

- **Selected:** a small Vite `closeBundle` plugin writes `dist/sw.js` after
  inspecting the completed build. It precaches every shipped shell file and
  embeds the exact package version in the cache name. This is deterministic,
  dependency-free, and cannot miss newly hashed chunks.
- **Not selected:** a static service worker with handwritten hashed names,
  because every Vite build changes those names; Workbox, because this order
  needs only two explicit runtime strategies and does not justify another
  dependency.
- `src/pwa.js` owns service-worker registration only. `src/install.js` owns
  install availability, platform copy, prompt invocation, and the one-time
  local hint. The existing shell receives no PWA policy logic.
- Manual instructions remain visible until a real install prompt is captured.
  iPadOS desktop-style user agents are treated as iOS when touch support is
  present. Android ordinarily supplies the install event; if it does not, the
  browser-menu fallback is still truthful.
- The install hint is marked seen when displayed (not merely dismissed), so
  crashes or navigation cannot turn a one-time hint into repeated nagging.
- Service-worker registration is production-only. Development remains
  uncached so source changes are never hidden behind a worker.

## Test plan (red → green)

1. Add `test/pwa.e2e.test.mjs` against the built app.
2. Prove the new test fails while the manifest, worker, and install UI are
   absent.
3. Add the manifest and generated icons; assert manifest identity, display,
   start URL, icon sizes, PNG dimensions, and maskable purpose.
4. Add worker generation and registration; assert a real worker reaches the
   activated state and controls the page.
5. Create a document through the real UI, disable the browser network, request
   a new navigation URL, and assert the cached shell renders the exact stored
   IndexedDB document.
6. Dispatch a real `beforeinstallprompt`-shaped event; assert the real install
   button replaces manual help, the hint appears, reload, dispatch again, and
   assert the hint stays hidden.
7. Run `npm test`, `npm run build`, inspect generated `dist/sw.js`, then record
   verbatim outputs in `receipts/B1-PWA.md`.

## Acceptance

- All 35 inherited tests remain green.
- New browser coverage proves: manifest validity, worker registration,
  offline shell navigation plus IndexedDB reading, and hint-once semantics.
- Work is committed on `blitz/b1-pwa` with this order and a complete receipt.
