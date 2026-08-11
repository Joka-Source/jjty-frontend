# jt-contracts

Portable record schemas for the JT domain contract. Android, iOS, and web each build
their own native engines, but they all serialize, exchange, and store the same records —
the ones defined here. This repo is the single source of those definitions.

Source of truth: JT Canon, `PRODUCT_TECHNICAL_ARCHITECTURE.md` (release
`2026-08-11-reconciliation-2`), sections 5 (records) and 6 (state machine).
Judgment calls made where that document is silent are recorded in `DECISIONS.md`.

## What is in here

- `schemas/` — one self-contained JSON Schema (draft 2020-12) per record:

  | Record | Plain meaning |
  |---|---|
  | `Source` | A file/document/recording a person owns, at an exact version |
  | `Anchor` | An exact position inside a source, with captured evidence and the way back |
  | `Context` | A bounded set of relevant sources, people, things, places |
  | `Cursor` | A live act of working at a position: capture, intention, certainty, destination |
  | `Action` | A requested operation with its consequence and confirmation rules |
  | `Receipt` | Durable proof of what actually happened, and how it arrived |
  | `Relationship` | An explicit link between two things, with provenance and authority |
  | `PlacePack` | Versioned local knowledge about a place, with rights and withdrawal |
  | `RightsRecord` | Exact usage terms for one item, incl. model-training exclusion |
  | `CapabilityProfile` | What a device/build can actually do right now, with proof freshness |
  | `ProvenanceEnvelope` | Who/what produced content, from what, how confidently |

- `fixtures/<record>/` — golden fixtures: `minimal.json` (only required fields) and
  `full.json` (every field populated). These are the conformance corpus.
- `fixtures/invalid/<record>.json` — one deliberately broken record each, which every
  conforming validator must reject.
- `test/validate.test.mjs` — the reference conformance suite (Node + ajv).

## How platforms consume this

1. **Copy the schemas** for the records you handle into your platform repo (they are
   self-contained; no cross-file references), or vendor this repo as a submodule.
2. **Run the golden fixtures through your platform's validator/decoder.** Every file in
   `fixtures/<record>/` must be accepted; every file in `fixtures/invalid/` must be
   rejected. Wire that into your platform's test suite — the fixtures, not the schema
   prose, are the conformance bar.
3. **Emit `schemaVersion`** on every record you produce, matching the schema version you
   implement.

To run the reference suite here:

```sh
npm ci
npm test   # node --test
```

## Versioning

Semver, applied to each record schema (the version is in the `$id`, e.g.
`jt-contracts/source/v0.1.0`):

- **Major** — any breaking change: removing/renaming a field, adding a required field,
  narrowing a type or enum. Consumers must migrate.
- **Minor** — backward-compatible additions: new optional fields, new enum values.
- **Patch** — description/documentation fixes only; validation behavior unchanged.

Records written under `X.Y.z` must validate under any schema `X.Y'.z'` with `Y' >= Y`.
Everything is currently `v0.1.0`: pre-1.0, shapes may still move, but only via a version
bump and updated fixtures — never silently.
