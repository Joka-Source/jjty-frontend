# Receipt — S1-ORG

**Order:** `orders/S1-ORG.md`
**Date:** 2026-08-12
**Branch/worktree:** `wo/s1-org` at `/Users/apple/projects/wo-s1-org`
**Environment:** macOS, Node v24.13.1, npm 11.8.0, ajv ^8.20.0 + ajv-formats ^3.0.1
**Status:** PROVISIONAL — pending founder WhatsApp handoff (12 Aug 2026).

## What was delivered

- `docs/ORG_VISION_PROVISIONAL_2026-08-12.md` — organizational-layer vision; founder
  intent first, all inferences labeled PROPOSAL, open questions listed for the
  incoming handoff.
- 5 provisional schemas in `schemas/` (draft 2020-12, `$id` =
  `jt-contracts/<record>/v0.1.0`, required `schemaVersion`,
  `additionalProperties: false`, description opens with the PROVISIONAL marker):
  Institution, Cohort, Space, Membership, SpaceContext. Existing 11 record schemas
  untouched — a moment references a space via the separate SpaceContext shape.
- 10 golden fixtures (`fixtures/<record>/minimal.json` + `full.json`) and 5 invalid
  fixtures (`fixtures/invalid/<record>.json`), wired into the existing conformance
  suite (`EXPECTED_RECORDS` extended; count assertion now derives from the list).
- `src/org/store.mjs` — working org store: createInstitution / createCohort /
  createSpace / addMember (with verbatim roll-number identity), spacesOf, membersOf,
  spaceChain, spaceContextFor; in-memory with JSON save/load; every emitted or loaded
  record is validated against the schemas (loads of tampered files are rejected).
- `test/org.test.mjs` — 7 unit tests covering schema validity of emitted objects,
  rejection of invalid input, referential integrity, resolution both ways,
  hostel > floor > room nesting, space-context stamping, and persistence round-trip.
- `docs/INDIA_COLLEGE_STRUCTURE_REFERENCE.md` — modelling notes (REFERENCE, no
  statistics).
- `DECISIONS.md` decisions 22–26; README org-layer section.

## Invalid-fixture intent

Each invalid fixture violates exactly one constraint:

| Record | Deliberate violation |
|---|---|
| institution | missing required `name` |
| cohort | `entryYear: "2024"` is a string, not integer |
| space | `kind: "vibe"` not in enum |
| membership | `role: "overlord"` not in enum |
| spacecontext | missing required `spaceId` |

## Test counts

- Before this order: **24 tests, 24 pass** (11 records).
- After this order: **41 tests, 41 pass** (16 records: +10 conformance tests for the
  5 new records, +7 org-store unit tests).

## Verify output

`npm test` (timings elided):

```text
> jt-contracts@0.1.0 test
> node --test

✔ org: created records validate against their schemas
✔ org: invalid input is rejected by schema validation
✔ org: referential integrity is enforced
✔ org: resolve a person's spaces and a space's members
✔ org: space nesting resolves hostel > floor > room
✔ org: spaceContextFor carries the space's institution and cohort
✔ org: JSON persistence round-trips and revalidates on load
✔ all 16 portable records have a schema
✔ every schema declares $id, schemaVersion requirement, and closed properties
✔ source: golden fixtures validate
✔ source: invalid fixture is rejected
✔ anchor: golden fixtures validate
✔ anchor: invalid fixture is rejected
✔ context: golden fixtures validate
✔ context: invalid fixture is rejected
✔ cursor: golden fixtures validate
✔ cursor: invalid fixture is rejected
✔ action: golden fixtures validate
✔ action: invalid fixture is rejected
✔ receipt: golden fixtures validate
✔ receipt: invalid fixture is rejected
✔ relationship: golden fixtures validate
✔ relationship: invalid fixture is rejected
✔ placepack: golden fixtures validate
✔ placepack: invalid fixture is rejected
✔ rightsrecord: golden fixtures validate
✔ rightsrecord: invalid fixture is rejected
✔ capabilityprofile: golden fixtures validate
✔ capabilityprofile: invalid fixture is rejected
✔ provenanceenvelope: golden fixtures validate
✔ provenanceenvelope: invalid fixture is rejected
✔ institution: golden fixtures validate
✔ institution: invalid fixture is rejected
✔ cohort: golden fixtures validate
✔ cohort: invalid fixture is rejected
✔ space: golden fixtures validate
✔ space: invalid fixture is rejected
✔ membership: golden fixtures validate
✔ membership: invalid fixture is rejected
✔ spacecontext: golden fixtures validate
✔ spacecontext: invalid fixture is rejected
ℹ tests 41
ℹ suites 0
ℹ pass 41
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 197.303
```

Result: 41/41 pass. Existing 24 unchanged and green. Committed locally on
`wo/s1-org` only; not pushed.

## Blockers

None escalated. Self-resolved (depth ≤ 2):

1. The suite's `$id` regex only allows lowercase letters in record names, so the
   space-context record is named `spacecontext` (one word) rather than
   `space-context`.
2. The "all N records" test hard-coded 11; changed the assertion to derive from
   `EXPECTED_RECORDS.length` so future records extend the list without editing prose.
