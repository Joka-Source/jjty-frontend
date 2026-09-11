# JETT system-state surface

JETT now has one semantic component for six conditions that every persistent journey must handle: loading, empty, offline, permission, error and recovery. The source is `src/ui-state.js`; production evidence routes and Storybook import that same renderer, so review does not drift into a separate mockup.

## Review locally

```sh
npm run dev
```

Open `#/states/loading`, `#/states/empty`, `#/states/offline`, `#/states/permission`, `#/states/error` or `#/states/recovery`. These routes expose the component inside the real application shell. Their buttons emit named action events and announce them.

The empty state is also integrated into the real document library. Its `open-document` action activates the accepted `.txt`, `.md` and `.pdf` file input; the ingestion pipeline persists the selected document, opens it for reading and removes the empty state on the next library render.

The permission state is integrated into voice settings. A rejected `getUserMedia` request moves the real microphone state machine to `denied`, mounts the shared permission surface, keeps reading and touch available, and exposes `request-microphone` to retry the same browser permission boundary after the person changes site settings.

The offline state is integrated into device sharing. When a paired relay session drops, kept moments remain in the IndexedDB outbox and the sharing screen mounts the shared offline surface. Its `retry-connection` action waits for the same authenticated pairing to resume and then drains that durable outbox.

The recovery state is integrated with the home paste editor. Input is retained locally while unfinished; after a reload, Restore draft returns it to the editor, and the retained copy is removed only after document ingestion succeeds.

The loading state now covers the real asynchronous boot interval while JETT restores its local stores and document state. Incomplete application surfaces stay hidden until boot settles. Its Work offline action remains unbound because current boot does not wait on a network dependency; the error action also still needs a real retry operation.

```sh
npm run storybook
npm run build:storybook
```

Storybook exposes the same six states under **JETT / System states**. The static build is a verification artifact and remains outside Git.

## Evidence

`evidence/system-states/manifest.json` binds desktop and phone captures to SHA-256 hashes and records the axe result for every state and viewport. `evidence/home-empty`, `evidence/voice-permission`, `evidence/share-offline` and `evidence/home-recovery` record the production integrations. The remaining gallery captures are review evidence, not a claim that the loading action or general retry is integrated end to end.

Regenerate the real offline evidence from a stopped local relay with:

```sh
CAPTURE_OFFLINE_EVIDENCE=1 npm run test:e2e:sync
CAPTURE_RECOVERY_EVIDENCE=1 node --import tsx --test --test-concurrency=1 test/ui-state.e2e.test.mjs
```
