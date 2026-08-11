# WO-003 — Portable record schemas

**Goal:** Create `jt-contracts` — the portable record schemas that Android, iOS, and web
all conform to.

**Source of truth:** JT Canon release `2026-08-11-reconciliation-2`,
`onboarding/PRODUCT_TECHNICAL_ARCHITECTURE.md`, section 5 (11 portable records) and
section 6 (state machine).

**Naming caution (from founder-intent audit):** record names stay as the architecture
doc has them (internal schema names, not user-facing), but every schema description uses
plain language — no AI-invented vocabulary ("locus", "settle", "recede") in prose.

## Scope

1. `git init` a new repo at `/Users/apple/projects/jt-contracts`.
2. `schemas/` — one JSON Schema (draft 2020-12) per record, `$id` of the form
   `jt-contracts/<record>/v0.1.0`, required top-level `schemaVersion` field. Fields
   modeled faithfully from the doc; vague points resolved minimal + extensible
   (`additionalProperties: false`, optional fields) with judgment calls in
   `DECISIONS.md`.
3. `fixtures/` — per record: `minimal.json` and `full.json` golden fixtures, plus
   `fixtures/invalid/<record>.json` with one invalid example each.
4. `test/validate.test.mjs` — `node --test` suite using ajv; valid fixtures pass,
   invalid ones fail. Lockfile committed.
5. `README.md` — purpose, how platforms consume (copy schemas + run conformance
   fixtures), versioning rule (semver; breaking = major).
6. This order plus `receipts/WO-003.md` with the verify output pasted.
7. Commit locally only. No push, no GitHub repo.

## Verify

`node --test` green; all fixtures behave as intended (valid accepted, invalid rejected).
