# The Organizational Layer of jt — PROVISIONAL

**Status: PROVISIONAL.** This document is written from the founder's stated intent of
12 Aug 2026 (paraphrased below) ahead of a further handoff from the founder's WhatsApp
chat. That handoff is expected to add detail and may overrule anything here. Every
section is structured so it can absorb that handoff: founder-stated intent is quoted
first, and everything jt's builders inferred beyond it is explicitly labeled
**PROPOSAL**. Where the handoff contradicts a PROPOSAL, the handoff wins.

## Founder's stated intent (12 Aug 2026, paraphrased)

- Indian colleges have real structure — students, dorms, roll numbers, cohorts.
- That structure has never been properly adopted by any institution's systems or any
  application. Students want it and don't have it.
- jt deals in things of everyday life, so jt has a unique opportunity to capture this
  space.
- This is a missing piece of the vision, to be built into the plan now: the model and
  a working v0 today; infrastructure can come later.

Everything below either restates this intent or is marked PROPOSAL.

## What the layer is

Institutions become first-class structure in jt's contract, alongside the existing
records (Source, Anchor, Context, Cursor, ...):

- **Institution** — the college, university, or school itself.
- **Cohort** — the batch that moves through it together: a programme plus an entry
  year ("B.Tech CSE 2024").
- **Space** — a real place or grouping inside the institution where everyday life
  happens: a class, a section, a hostel, a hostel floor, a room, a club. Spaces nest
  (hostel → floor → room).
- **Membership** — one person's belonging to one space, with a role and the
  institutional identity the college gave them — the roll number — carried alongside
  their personal identity, never replacing it.
- **SpaceContext** — the small stamp a moment-carrying record can attach to say
  "this happened in the flow of this space."

The founder's framing is adoption, not invention: the structure already exists in the
real world; jt models it faithfully instead of asking colleges or students to adapt to
an app-shaped substitute.

## Why jt (founder-grounded)

jt deals in the things of everyday life. For an Indian college student, everyday life
*is* this structure: the section you sit in, the hostel floor you live on, the roll
number you are called by, the batch you will graduate with. No institution's own
systems and no application has adopted that structure properly (founder's claim, to be
sharpened by the handoff). Students want it and don't have it. That gap is the
opportunity.

## Design positions

1. **Structure is adopted verbatim.** Roll numbers are stored exactly as the
   institution issues them — no normalization, because formats vary by college and the
   number's exact form is part of its meaning. *(Founder-grounded: "roll numbers" as
   real structure; verbatim storage is a PROPOSAL.)*
2. **Institutional identity sits alongside personal identity.** A person is not their
   roll number; a Membership carries the roll number for one space, and the same
   person can hold different institutional identities over time. *(Founder-grounded:
   roll numbers named as part of the structure; the alongside-not-instead framing is a
   PROPOSAL.)*
3. **Spaces are where moments flow.** A class, a dorm floor, a club — each is a Space,
   and acts/moments reference a Space through an optional context stamp rather than by
   rewriting the existing record schemas. *(Founder-grounded: spaces where moments
   flow; the non-mutating SpaceContext mechanism is a PROPOSAL.)*
4. **PROPOSAL — hierarchy via nesting, not deep types.** One Space record with a
   `kind` and a `parentSpaceId` covers hostel → floor → room and leaves headroom for
   structures the handoff may add (mess halls, labs, sports teams) as new `kind`
   values — a minor version bump, not a new record.
5. **PROPOSAL — membership is time-bounded.** `joinedAt`/`leftAt` rather than
   deletion, because a graduated batch's structure remains true of the past.
6. **PROPOSAL — visibility follows structure.** A moment in a space may be visible to
   its owner only, to the space, or to the institution. Default private. The handoff
   should settle the actual defaults and vocabulary.

## What ships in v0 (this sprint)

- Five provisional schemas (`institution`, `cohort`, `space`, `membership`,
  `spacecontext`), v0.1.0, in the same contract style as the existing eleven records,
  each carrying a PROVISIONAL marker in its description.
- Golden and invalid fixtures for each, wired into the existing conformance suite.
- A working in-memory org store (`src/org/store.mjs`) with JSON persistence: create
  institution/cohort/space, add members with roll-number identity, resolve a person's
  spaces, list a space's members — every emitted object validated against the schemas.

Infrastructure (sync, server, real institution onboarding) is explicitly deferred, per
the founder: model and working v0 now, infra later.

## Open questions for the WhatsApp handoff

1. Which institutions or institution types come first?
2. Who asserts structure — students bottom-up, institutions top-down, or both?
3. Verification: does a roll number need institutional confirmation, and when?
4. Visibility defaults for moments inside a space.
5. Vocabulary: the founder's own names for Space/Cohort/Membership, if any. The names
   here are internal schema names, not user-facing words.
6. Whether cohorts and clubs beyond a single institution (inter-college fests,
   alumni) are in scope.

## Naming discipline

Per the founder-intent audit: no AI-invented product vocabulary anywhere in this
layer. Schema names are internal. All prose uses plain language.
