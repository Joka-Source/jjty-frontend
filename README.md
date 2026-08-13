# jt glass

jt glass makes the engine's decisions visible to the people using jt and the
people building it. It is a standalone, framework-free TypeScript package with
no runtime dependencies and a demo that makes no network requests.

## What is here

- `src/tap.ts` — the typed, versioned event stream and its JSON-boundary validator.
- `src/state.ts` — the pure panel-state reducer.
- `src/panels.ts` — live words, match scores, decisions, saved data, and timing.
- `src/replay-lab.ts` — JSONL loading, scrubbing, expected-outcome diffing, and
  live recording.
- `fixtures/` — a bundled session, expected outcome, and deliberate mutation.
- `patches/jt-web-tap.patch` — a patch against jt-web main; jt-web is not changed.

## Run it

Node 24 or newer is required.

```sh
npm test
npm run build
npm run dev
```

Then open the local address printed by the development server. The demo uses
only files in `dist/`.

## Add the tap to an engine

Import `glassTap` from `@jt/glass/tap` and emit at real decision boundaries.
Each call accepts the event-specific fields; the tap adds the session id, event
id, sequence number, time, and contract version. Invalid data throws before it
can enter a fixture.

```js
glassTap.emit({
  kind: "latencyMark",
  stage: "matcher",
  durationMs: performance.now() - started,
  budgetMs: 1,
});
```

The package exports `mountGlass(root, { events, expected, tap })` for a host
page. Applying `patches/jt-web-tap.patch` adds a development-only `#/glass`
route and the jt-web event bridge.

## Repository state

The requested history is a skeleton commit on `main`, followed by implementation
on `wo/p4-glass`. This environment could not write `.git/index.lock`, so the
working tree is prepared but the branch and commits must be created once Git
metadata is writable. See `receipts/P4.md` for the exact evidence.

