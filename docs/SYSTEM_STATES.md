# JETT system-state surface

JETT now has one semantic component for six conditions that every persistent journey must handle: loading, empty, offline, permission, error and recovery. The source is `src/ui-state.js`; production evidence routes and Storybook import that same renderer, so review does not drift into a separate mockup.

## Review locally

```sh
npm run dev
```

Open `#/states/loading`, `#/states/empty`, `#/states/offline`, `#/states/permission`, `#/states/error` or `#/states/recovery`. These routes expose the component inside the real application shell. Their buttons emit named action events and announce them.

The empty state is also integrated into the real document library. Its `open-document` action activates the accepted `.txt`, `.md` and `.pdf` file input; the ingestion pipeline persists the selected document, opens it for reading and removes the empty state on the next library render.

The permission state is integrated into voice settings. A rejected `getUserMedia` request moves the real microphone state machine to `denied`, mounts the shared permission surface, keeps reading and touch available, and exposes `request-microphone` to retry the same browser permission boundary after the person changes site settings.

The offline state is integrated into device sharing. When a paired relay session drops, kept moments remain in the IndexedDB outbox and the sharing screen mounts the shared offline surface. Its `retry-connection` action waits for the same authenticated pairing to resume and then drains that durable outbox. The loading, error and recovery evidence-route events still need bindings to their real product operations.

```sh
npm run storybook
npm run build:storybook
```

Storybook exposes the same six states under **JETT / System states**. The static build is a verification artifact and remains outside Git.

## Evidence

`evidence/system-states/manifest.json` binds desktop and phone captures to SHA-256 hashes and records the axe result for every state and viewport. `evidence/home-empty`, `evidence/voice-permission` and `evidence/share-offline` record the production integrations. The remaining gallery captures are review evidence, not a claim that loading, general retry or draft restoration is integrated end to end.

Regenerate the real offline evidence from a stopped local relay with:

```sh
CAPTURE_OFFLINE_EVIDENCE=1 npm run test:e2e:sync
```
