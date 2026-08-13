# receipt B3-SPACES-FLOW — moments flowing through spaces

Repo: `/Users/apple/projects/blitz/b3-spaces` · branch `blitz/b3-spaces` ·
start `44ca6f7e570a478c21078d3a24ee0e0f9c1bab95` (the order stated 44 tests
green). Result at final verification: **48/48 tests pass** and the production
build exits 0.

## Decision record

- Spaces remain visibly **PROVISIONAL**. The surface says space feeds are
  local to this device and that cross-device space sync arrives with the
  relay; no network behavior is implied or simulated.
- The picker is membership-derived, never a list of every locally known
  space. `OrgStore.spacesOf(person.id)` is authoritative. Adding a membership
  has a checked-by-default “this is me on this device” choice, and another
  member can be selected later from the space tree.
- Feed persistence lives in IndexedDB beside documents, records, and arrived
  moments. Database version 3 adds `spaceFeed`; reads sort oldest-to-newest by
  `arrivedAt`, and local writes make that timestamp monotonic even under fast
  consecutive sends.
- Local act placement reuses `momentFromEntry`. Arrived-moment placement reuses
  the arrived envelope and retains its verified hash as `sourceContentHash`.
  A validated `spaceContext` is attached before the canonical jt-sync hash is
  computed. If the source already had a space context, it remains separately
  available as `sourceSpaceContext` rather than being erased.
- “Keep to my documents” fingerprints the imported excerpt itself, while
  retaining the original moment provenance, feed hash, old/new space context,
  and the complete contextualized moment (blocks, cursor, proof record, and
  evidence) under `provenance.spaceImport`.
- Voice remains the existing jt-speech `send.to` path. Exact normalized space
  names win; jt-speech phrase similarity accepts scores at or above `0.72`;
  candidates within `0.08` of the best score produce visible choices and no
  write until a choice is made. No matching personal space means a valid
  three-word code retains the existing relay route; other speech is reported
  as unmatched.
- The taller space surface exposed a real shell defect: retained scroll could
  place a settings control under the fixed header and physically navigate to
  reading. Surface changes now reset document scroll before arrival motion.

## What shipped

1. **Send to space on kept material.** Every active act in reading/full
   history and every arrived moment has the same personal-space picker.
2. **Arrival-ordered space feeds.** Each space renders a numbered arrival
   spine with the exact excerpt, source title/revision/digest, full moment
   hash, and a disclosure containing captured evidence, proposed intention,
   result, source provenance, and space contexts.
3. **Document import.** A feed item can be kept to documents and opens as a
   normal persisted jt document. The reading provenance disclosure names the
   space, original source, original digest, and moment hash.
4. **Honest local boundary.** Plain copy states that space feeds are local and
   relay-backed cross-device space sync is not here yet.
5. **Voice routing.** “send this to CSE-A” resolves through jt-speech
   `send.to`; recognizer-like typos work; “send this to CSE” with CSE-A and
   CSE-B asks instead of guessing.
6. **Whole-device data behavior.** Export includes `spaceFeeds`; delete-all
   deletes the same IndexedDB database, so feeds clear with documents,
   records, and arrivals. The setting copy names feeds explicitly.

## Files

- `orders/B3-SPACES-FLOW.md` — build order and decisions
- `src/space-flow.js` — fuzzy resolution, contextualized feed items, hashing,
  lossless document import
- `src/db.js` — IndexedDB version 3 and space-feed persistence
- `src/shell.js` — person selection, pickers, feed rendering/import,
  export/delete copy, surface scroll reset
- `src/main.js` — act/arrival picker wiring, jt-speech routing, moment
  construction, B3 test hooks
- `index.html`, `src/style.css` — PROVISIONAL/local copy and responsive arrival
  spine
- `README.md` — discoverable behavior and relay boundary
- `test/spaces.test.mjs` — three pure unit contracts
- `test/spaces.e2e.test.mjs` — full browser flow
- `test/sync.e2e.test.mjs` — arrived moments expose send-to-space too

## Browser proof

`spaces flow: picker, feed, import, voice ambiguity, persistence and export`
creates an institution, CSE-A and CSE-B, and two memberships for the local
person. It then proves:

- the picker contains only those current memberships;
- tap placement and exact jt-speech voice placement append moments;
- a close voice destination exposes both choices and writes nothing first;
- explicit choice appends the third moment;
- the feed is oldest-to-newest, with excerpt, source digest, evidence, and
  full `sha256:` hash;
- keeping an excerpt opens a document with the original source and moment
  provenance;
- export includes all three feed items; and
- reload restores the IndexedDB feed.

The existing two-device relay e2e additionally proves an arrived verified
moment exposes the same send-to-space action. Existing phone/desktop walks
prove no overflow and the scroll-reset repair.

## Verification — final authoritative run

Command: `npm test`

```text
✓ built in 462ms
✔ desktop shell walk: first-run once, every surface, settings persist, export, spaces, delete-all
✔ phone shell walk: bottom bar reaches everything, sheets, 44px targets, no overflow anywhere
✔ spaces flow: picker, feed, import, voice ambiguity, persistence and export
✔ moment-send: pair two pages by spoken words, send a kept act, verify
ℹ tests 48
ℹ suites 0
ℹ pass 48
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 20724.314542
```

Focused non-browser verification: `36/36` pass. `git diff --check` exits 0.
The production build carries the pre-existing benign Vite note that spoken
math is both statically and dynamically imported; it does not affect the
successful build.

## Vocabulary and scope audit

- Brand remains `jt`.
- No QR feature or copy was added.
- The banned names are absent from added UI copy. The schema-pure proof field
  retains its wire key only inside inspectable JSON, matching the existing W4
  boundary; it is never presented as a UI noun.
- No fake cross-device space behavior, organization seed, or silent fuzzy
  destination was added.

## Blocker and resumable handoff

Runtime/build verification has no blocker. The requested commit was attempted
with an explicit file list, but the sandbox refused both staging and commit:

```text
fatal: Unable to create '/Users/apple/projects/blitz/b3-spaces/.git/index.lock': Operation not permitted
```

Nothing was staged or committed. The verified working tree remains ready on
`blitz/b3-spaces` at base SHA `44ca6f7e570a478c21078d3a24ee0e0f9c1bab95`;
the pre-existing untracked `.DS_Store` remains untouched and excluded from the
intended commit.
