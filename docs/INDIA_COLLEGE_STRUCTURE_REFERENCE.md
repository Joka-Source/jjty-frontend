# Indian College Structure — Modelling Notes (REFERENCE)

**Status: REFERENCE.** Background notes used while shaping the provisional org-layer
schemas. General knowledge, stated qualitatively; no statistics are cited and none
should be inferred. Anything here that conflicts with the incoming founder WhatsApp
handoff yields to the handoff.

## Roll numbers

- Every enrolled student gets a roll number; it is the identity the institution
  actually uses day to day (attendance, exam seating, notice boards, viva lists).
- Formats vary widely and are institution-specific. Common shapes:
  - Year + programme + serial: `21CSE104`, `2023BTECH0412`.
  - Department + year + serial: `CS21B047` (IIT-style hostel-of-branch encodings).
  - Plain serial within a section: `47`.
- Many universities issue a *separate* registration or enrolment number
  (e.g. `NU/2023/48812`) that outlives section-level roll numbers; the two coexist.
- Roll numbers can change (year to year in some colleges, on section reshuffle) while
  the registration number stays stable. Hence the schema keeps both, verbatim, per
  membership rather than per person.

## Batches, programmes, sections

- The primary social unit is the **batch**: everyone who joined a programme in the
  same year ("B.Tech CSE 2024", "MBBS 2023 batch"). Students self-identify by it for
  life.
- Large batches split into **sections** (A/B/C...), each with its own timetable and
  classroom; the section is the daily-life class group.
- Programme lengths differ (three-year B.A./B.Sc./B.Com., four-year B.Tech, five-plus
  MBBS), so expected graduation year is per cohort, not derivable from entry year
  alone.
- Affiliation matters: a large share of Indian colleges are affiliated to a parent
  university that sets the syllabus and issues registration numbers, which is why the
  Institution schema carries `affiliatedTo`.

## Hostels

- Residential colleges allocate students to **hostels** (often numbered or named),
  then to floors/wings, then to shared rooms (commonly two to four occupants).
- Allocation conventions vary: by batch, by department, by seniority, or by lottery;
  hostels are usually gender-segregated; many have wardens (staff) and student floor
  representatives.
- The hostel, the floor, and the room are each genuine social units — mess groups and
  floor groups are where much of daily life happens — which is why Space nests rather
  than flattening to a single "dorm" field.

## Clubs and everything else

- Clubs and societies (cultural, technical, sports, department associations) recruit
  across batches and hostels; membership is role-bearing (member, lead/secretary).
- Other recurring structures the handoff may want: mess halls, labs, sports teams,
  fest organizing committees, alumni groups. The Space `kind` enum is deliberately
  small now and grows by minor version bumps.

## Consequences already baked into the schemas

| Reality | Schema consequence |
|---|---|
| Roll number formats vary and encode meaning | Stored verbatim as a string, no pattern |
| Roll number and registration number coexist | Both fields on `institutionalIdentity` |
| Identity is per-enrolment, not per-person | Institutional identity lives on Membership |
| Hostel > floor > room nesting | `parentSpaceId` on Space |
| Sections belong to a batch | Optional `cohortId` on Space |
| Batches outlive graduation | `leftAt` on Membership, no deletion |
| Affiliated-college system | `affiliatedTo` on Institution |
