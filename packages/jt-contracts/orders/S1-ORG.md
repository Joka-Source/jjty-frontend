# S1-ORG — Organizational layer (provisional model + working v0)

**Goal:** Build the organizational layer of jt into the plan now: institutions as
first-class structure (college → programme/cohort → hostel/dorm → room; roll-number
identity alongside personal identity; spaces where moments flow), with a working v0
today. Infrastructure comes later.

**Source of truth:** Founder's stated intent, 12 Aug 2026 (paraphrased in
`docs/ORG_VISION_PROVISIONAL_2026-08-12.md`). A further handoff from the founder's
WhatsApp chat is incoming: **everything in this order's output is PROVISIONAL pending
that handoff** and structured to absorb it.

**Naming caution:** no AI-invented product vocabulary (banned: Margin as a name,
locus, settle/recede/receipt as UI nouns, sea/drops/shells as product nouns, QR
anything). Schema names are internal; prose stays plain.

## Scope

1. `docs/ORG_VISION_PROVISIONAL_2026-08-12.md` — the organizational layer as vision:
   founder intent quoted first, inferences labeled PROPOSAL, incoming handoff noted.
2. Five schemas v0.1.0 in repo conventions (draft 2020-12, `$id`
   `jt-contracts/<record>/v0.1.0`, required `schemaVersion`,
   `additionalProperties: false`, PROVISIONAL marker in description):
   `institution`, `cohort`, `space`, `membership`, `spacecontext` (the optional
   space-context field spec for moment-carrying records — existing Cursor/Receipt
   schemas not mutated). Golden `minimal.json` + `full.json` and one invalid fixture
   each, wired into `test/validate.test.mjs`.
3. `src/org/store.mjs` — working membership module: create institution/cohort/space,
   add member with roll-number identity, resolve a person's spaces, list a space's
   members; in-memory with JSON persistence; every emitted object validates against
   the schemas; unit-tested in `test/org.test.mjs`.
4. `docs/INDIA_COLLEGE_STRUCTURE_REFERENCE.md` — one page of modelling notes on real
   Indian college structure, marked REFERENCE, no fabricated statistics.
5. Judgment calls recorded in `DECISIONS.md`; README updated.
6. This order plus `receipts/S1-ORG.md` with verify output pasted verbatim.
7. Work on branch `wo/s1-org` in worktree `/Users/apple/projects/wo-s1-org`. Commit
   locally only; no push.

## Verify

`npm test` (node --test): whole suite green — existing 24 tests plus new conformance
and org-store tests.
