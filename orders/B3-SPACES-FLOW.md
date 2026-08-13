# B3-SPACES-FLOW implementation order

> **For agentic workers:** execute inline with strict red-green TDD. Keep the
> existing jt shell and moment envelope authoritative; do not create a second
> act, document, or organization model.

**Goal:** Let a person place any kept act or arrived moment into one of their
spaces, read that space's append-only moment feed, and keep a feed excerpt as a
local document without losing its provenance.

**Architecture:** `src/space-flow.js` owns pure moment placement, fuzzy name
resolution, canonical hashing, and document-import construction. IndexedDB
owns feed persistence beside documents, records, and arrivals. `src/shell.js`
owns the personal-space picker and feed surface; `src/main.js` connects active
acts, arrived moments, and the existing jt-speech `send.to` command.

**Tech stack:** browser ES modules, IndexedDB, jt-speech fuzzy matching,
jt-sync canonical envelope hashing, Node test runner, Puppeteer e2e.

## Decisions

- B3 remains **PROVISIONAL**. The surface keeps its early label and names
  cross-device space sync as relay-dependent future work.
- A person's picker contains only current memberships from
  `OrgStore.spacesOf(person.id)`. The member form has a checked-by-default
  “this is me on this device” choice; any member row can later be chosen as
  the local person. No membership means no guessed destinations.
- A space feed item is append-only data with `spaceId`, `arrivedAt`, the full
  moment, its canonical `sha256:` hash, and (when applicable) the prior
  arrival hash. Feed display order is ascending `arrivedAt`.
- Local act placement reuses `momentFromEntry`; arrived-moment placement
  reuses the arrived envelope. Both receive a validated `spaceContext` before
  the feed hash is computed. Cursor, proof record, evidence, and source
  provenance are never rewritten.
- “Keep to my documents” creates a new document from the exact moment blocks.
  Its digest fingerprints that excerpt, while `provenance.original` retains
  the source moment provenance byte-for-byte and `spaceImport` retains the
  feed hash and context.
- Voice stays on jt-speech `send.to`. Exact normalized space names win.
  Otherwise jt-speech phrase similarity accepts a best score of at least
  `0.72`; another candidate within `0.08` produces a visible choice and no
  write. If no personal space matches, a valid three-word code keeps the
  existing relay route; anything else is reported as unmatched.
- Space feeds use IndexedDB store `spaceFeed` (database version 3). Export-all
  includes `spaceFeeds`; the existing whole-database delete clears them.
- The existing `send` control for device sharing stays. “send to space” is a
  separate action on every active kept act and every arrived moment.

## Build tasks

### 1. Pure space-flow behavior

- [x] Add failing unit tests for exact/fuzzy/ambiguous/no-match resolution.
- [x] Add failing unit tests proving moment context, evidence/provenance
  preservation, canonical hash, and excerpt-document import.
- [x] Implement `resolveSpaceName`, `makeSpaceFeedItem`, and
  `documentFromSpaceFeedItem` in `src/space-flow.js`.
- [x] Run `node --test test/spaces.test.mjs` green.

### 2. Durable feed storage

- [x] Add IndexedDB `spaceFeed` store and `putSpaceFeed` / `getSpaceFeed`.
- [x] Keep reads ordered oldest-to-newest by `arrivedAt`.
- [x] Add feed export and verify delete-all still deletes the whole database.

### 3. Space actions and surface

- [x] Add local-person choice to membership creation and member rows.
- [x] Add a personal-space picker to every active act and arrived moment.
- [x] Render each space feed in arrival order with excerpt, source provenance,
  evidence disclosure, full hash, and “keep to my documents”.
- [x] State plainly that feeds are local to this device and relay-backed
  cross-device space sync has not arrived yet.

### 4. Voice and ambiguity

- [x] Route jt-speech `send.to` to personal spaces before relay pairing.
- [x] On close matches, reuse the existing visible choice surface and write
  nothing until the person chooses.
- [x] Preserve the existing three-spoken-word device sharing behavior.

### 5. End-to-end proof and closeout

- [x] Add a Puppeteer journey covering membership, picker placement, feed
  order/provenance/hash, import, persistence, export, voice exact match, and
  honest ambiguity.
- [x] Run unit tests, production build, full `npm test`, and a banned UI noun
  audit; record any sandbox-only e2e boundary verbatim.
- [x] Write `receipts/B3-SPACES-FLOW.md` and report branch/exact SHA.
- [x] Attempt the explicit-file commit. The sandbox refused `.git/index.lock`
  with `Operation not permitted`, so leave the verified tree ready and keep
  the pre-existing `.DS_Store` untouched, as the order permits.
