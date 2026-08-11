# Decisions

Judgment calls made while turning section 5 of `PRODUCT_TECHNICAL_ARCHITECTURE.md`
(Canon release `2026-08-11-reconciliation-2`) into JSON Schemas. The architecture doc
lists fields as prose bullets; wherever it is silent on types, vocabularies, or
optionality, the choices below apply. All are v0.1.0 choices — revisit before v1.

## Global conventions

1. **Draft 2020-12, one self-contained schema per record.** No cross-file `$ref`, so
   platforms can copy a single file per record. `$id` is `jt-contracts/<record>/v<semver>`.
2. **`schemaVersion` is a required semver string** (`^\d+\.\d+\.\d+$`) on every record,
   rather than a `const`, so a schema at 0.1.x can accept records written at any 0.1.z
   without republishing.
3. **`additionalProperties: false` everywhere** (including nested objects). Extension
   means a schema revision, not silent extra fields. The one deliberate exception is
   `CapabilityProfile.settings`, an open string-to-string map, because device settings
   are inherently open-ended.
4. **Enums only where the doc names values; free strings elsewhere.** The doc's own
   vocabulary produced: `Receipt.arrival` (`exact`/`degraded`/`refused`, from
   "exact/degraded/refused arrival") and `Cursor.state` (the section 6 state machine).
   Where the doc says only "class" or "state" with no vocabulary (e.g.
   `Source.storageState`, `ProvenanceEnvelope.retentionClass`), the field is a described
   free string — minimal now, promotable to an enum later without breaking data that
   used sensible values.
5. **Invented enums (not in the doc, chosen minimal):**
   - `privacyClass`: `private` / `shared` / `public` (Source, Context).
   - `lifecycleState` (Source): `active` / `archived` / `pending-deletion` / `deleted`.
   - `encryptionState` (Source): `encrypted` / `not-encrypted`.
   - `resolutionStatus` (Anchor): `exact` / `approximate` / `stale` / `unresolved`.
   - `receiptState` (Cursor): `not-requested` / `pending` / `received` / `refused`.
   - `consequenceClass` (Action): `read-only` / `reversible` / `irreversible` / `destructive`.
   - `confirmationPolicy` (Action): `none` / `preview` / `explicit-confirm`.
   - `egressState`/`egressClass` (Context, ProvenanceEnvelope): `local-only` /
     `egress-approved` / `egressed`.
   Adding enum values is a minor bump; removing/renaming is major.
6. **Digests** are `sha256:<64 hex>` strings (pattern-enforced). Other hash algorithms
   would be a schema revision.
7. **Timestamps** are ISO 8601 `date-time` strings; the conformance suite enforces the
   format via ajv-formats.
8. **"Routes" are free strings** (`returnRoute`, `repairRoute`, `exportRoute`, ...).
   The doc demands they exist and be exact, but their shape is platform-dependent
   (deep link, URI, host-specific token). Structuring them is deferred to ADR 006.
9. **Cross-record references are plain id strings** (`sourceId`, `rightsRef`,
   `anchorId`), not embedded objects. Referential integrity is a store concern, not a
   serialization concern.

## Naming

10. **Record names follow the architecture doc verbatim** (Source, Anchor, Cursor, ...).
    They are internal schema names, not user-facing vocabulary. Per the founder-intent
    audit, every `description` field uses plain language — "exact position in the
    source", not "locus"; "the interaction stepping back out of the way", not "recede".
11. **State machine enum values follow section 6 verbatim** (`settlement`, `recession`,
    etc., hyphenated: `provisional-intention`, `durable-result`) because renaming wire
    values later is a breaking change we would rather take once, deliberately, if the
    founder renames the states. The `state` description explains each value plainly.
    Section 6's "candidate / ambiguity" is modeled as two distinct values, since
    ambiguity (multiple plausible readings) needs different handling than a single
    candidate.

## Per-record calls

12. **Anchor requires at least one locator** (`anyOf` semantic/geometric) and requires
    `returnRoute` — an anchor you cannot return to contradicts the doc's "exact route
    of return". `geometricLocator` is a minimal page/x/y/width/height object in page
    coordinates.
13. **Cursor** carries the section 6 lifecycle in `state` (required). "Proposed
    intention and certainty state" became `proposedIntention` plus the lifecycle state
    (`provisional-intention` / `candidate` / `ambiguity` cover certainty); a separate
    numeric confidence lives in ProvenanceEnvelope, not Cursor. `history` is a minimal
    `{at, event}` list.
14. **Receipt** splits "executor/host/device/build" into four flat optional strings, and
    requires `id`, `sourceId`, `sourceRevision`, `actionId`, `result`, `arrival`,
    `occurredAt`. `degradationNote` was added so a `degraded` arrival can name what was
    lost (section 6: "degraded handoff is disclosed"). Not conditionally required yet —
    a `dependentRequired` tightening is a candidate for 0.2.
15. **Relationship** requires `provenance` and `authority` (the doc says "each with
    provenance and authority"). Endpoints are typed `{refType, refId}` with the seven
    thing-kinds the doc lists.
16. **RightsRecord requires `modelTrainingExcluded`** (boolean). It is the one term the
    doc treats as a headline commitment; leaving it implied would default to unstated
    consent. `creator` is optional, `authority` required, since the doc allows an
    authority who is not the creator. Absent `territory` means unstated, not unlimited.
17. **PlacePack** models "correction and withdrawal" as routes plus a `withdrawn` flag.
    Environment bullets ("hydrology/ecology/season") are three descriptive strings, not
    structured data — structure comes with ADR 009.
18. **CapabilityProfile** "proof freshness" became `lastVerifiedAt` + `evidenceRef`.
    Constraints are a closed object with `frameRate` numeric and thermal/battery/network
    as described strings.
19. **ProvenanceEnvelope** `confidence` is a 0..1 number (doc: "confidence controls
    behavior"), `model` is an optional closed object whose absence means "no model was
    used", and `sourceDigest` + `transformation` + `producer` are required — an envelope
    that cannot say what produced what from what is not provenance.
20. **All entity records require `id`**, including ProvenanceEnvelope, for uniformity
    and so receipts/audits can reference any record.

## Tooling

21. Conformance uses ajv (draft 2020-12 build) with `strict: true` but
    `strictRequired: false`, because Anchor's `anyOf` requires properties defined at the
    parent level — valid 2020-12, flagged only by ajv's extra-strict lint.
