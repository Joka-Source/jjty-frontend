// Unit tests for the provisional org-layer store (src/org/store.mjs).
//
// Every object the store emits must validate against the corresponding schema
// in schemas/ — asserted both inside the store and independently here.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { OrgStore, ValidationError } from "../src/org/store.mjs";

const schemasDir = join(dirname(fileURLToPath(import.meta.url)), "..", "schemas");
const ajv = new Ajv2020.default({ allErrors: true, strict: true, strictRequired: false });
addFormats.default(ajv);
const check = {};
for (const record of ["institution", "cohort", "space", "membership", "spacecontext"]) {
  check[record] = ajv.compile(
    JSON.parse(readFileSync(join(schemasDir, `${record}.schema.json`), "utf8")),
  );
}

function seededStore() {
  const store = new OrgStore();
  const inst = store.createInstitution({
    name: "Government College of Arts and Science, Nagpur",
    shortName: "GCAS Nagpur",
    kind: "college",
    affiliatedTo: "Nagpur University",
    location: { city: "Nagpur", state: "Maharashtra", country: "India" },
    academicYearStartMonth: 7,
  });
  const cohort = store.createCohort({
    institutionId: inst.id,
    label: "B.Tech CSE 2024",
    programme: "B.Tech Computer Science",
    entryYear: 2024,
    expectedGraduationYear: 2028,
  });
  const hostel = store.createSpace({ institutionId: inst.id, kind: "hostel", name: "Hostel 7" });
  const floor = store.createSpace({
    institutionId: inst.id, kind: "floor", name: "Second floor", parentSpaceId: hostel.id,
  });
  const room = store.createSpace({
    institutionId: inst.id, kind: "room", name: "Room 214", parentSpaceId: floor.id, capacity: 3,
  });
  const section = store.createSpace({
    institutionId: inst.id, kind: "section", name: "CSE-A", cohortId: cohort.id,
  });
  return { store, inst, cohort, hostel, floor, room, section };
}

test("org: created records validate against their schemas", () => {
  const { store, inst, cohort, room, section } = seededStore();
  assert.ok(check.institution(inst), JSON.stringify(check.institution.errors));
  assert.ok(check.cohort(cohort), JSON.stringify(check.cohort.errors));
  for (const space of store.spaces.values()) {
    assert.ok(check.space(space), JSON.stringify(check.space.errors));
  }
  const m = store.addMember({
    personId: "per-asha",
    spaceId: section.id,
    role: "student",
    institutionalIdentity: { rollNumber: "24CSE017", admissionYear: 2024 },
    joinedAt: "2024-08-01T09:00:00Z",
  });
  assert.ok(check.membership(m), JSON.stringify(check.membership.errors));
  const ctx = store.spaceContextFor(room.id, { visibility: "space" });
  assert.ok(check.spacecontext(ctx), JSON.stringify(check.spacecontext.errors));
});

test("org: invalid input is rejected by schema validation", () => {
  const { store, section } = seededStore();
  assert.throws(
    () => store.addMember({ personId: "per-x", spaceId: section.id, role: "overlord" }),
    ValidationError,
  );
  assert.throws(
    () => store.createInstitution({ name: "" }),
    ValidationError,
  );
  assert.throws(
    () =>
      store.addMember({
        personId: "per-x",
        spaceId: section.id,
        role: "student",
        institutionalIdentity: { rollNumber: "24CSE001", hostelBunk: "upper" },
      }),
    ValidationError,
  );
});

test("org: referential integrity is enforced", () => {
  const { store } = seededStore();
  assert.throws(() => store.createCohort({ institutionId: "nope", label: "X" }), /unknown institution/);
  assert.throws(
    () => store.createSpace({ institutionId: "nope", kind: "club", name: "Chess" }),
    /unknown institution/,
  );
  assert.throws(() => store.addMember({ personId: "p", spaceId: "nope", role: "student" }), /unknown space/);
});

test("org: resolve a person's spaces and a space's members", () => {
  const { store, room, section, hostel } = seededStore();
  store.addMember({ personId: "per-asha", spaceId: section.id, role: "student" });
  store.addMember({ personId: "per-asha", spaceId: room.id, role: "resident" });
  store.addMember({ personId: "per-ravi", spaceId: room.id, role: "resident" });
  store.addMember({
    personId: "per-meena", spaceId: hostel.id, role: "resident",
    joinedAt: "2023-08-01T09:00:00Z", leftAt: "2024-05-31T17:00:00Z",
  });

  const ashaSpaces = store.spacesOf("per-asha").map((s) => s.name).sort();
  assert.deepEqual(ashaSpaces, ["CSE-A", "Room 214"]);

  const roomMembers = store.membersOf(room.id).map((m) => m.personId).sort();
  assert.deepEqual(roomMembers, ["per-asha", "per-ravi"]);

  // Past memberships are excluded by default, included on request.
  assert.equal(store.spacesOf("per-meena").length, 0);
  assert.equal(store.spacesOf("per-meena", { includePast: true }).length, 1);
  assert.equal(store.membersOf(hostel.id).length, 0);
  assert.equal(store.membersOf(hostel.id, { includePast: true }).length, 1);

  // No duplicate current membership in the same space.
  assert.throws(
    () => store.addMember({ personId: "per-asha", spaceId: room.id, role: "resident" }),
    /already has a current membership/,
  );
});

test("org: space nesting resolves hostel > floor > room", () => {
  const { store, hostel, floor, room } = seededStore();
  const chain = store.spaceChain(room.id).map((s) => s.id);
  assert.deepEqual(chain, [hostel.id, floor.id, room.id]);
});

test("org: spaceContextFor carries the space's institution and cohort", () => {
  const { store, section, inst, cohort } = seededStore();
  const ctx = store.spaceContextFor(section.id, { visibility: "space" });
  assert.equal(ctx.spaceId, section.id);
  assert.equal(ctx.institutionId, inst.id);
  assert.equal(ctx.cohortId, cohort.id);
  assert.equal(ctx.visibility, "space");
});

test("org: JSON persistence round-trips and revalidates on load", () => {
  const { store, section } = seededStore();
  store.addMember({
    personId: "per-asha",
    spaceId: section.id,
    role: "student",
    institutionalIdentity: { rollNumber: "24CSE017" },
  });
  const dir = mkdtempSync(join(tmpdir(), "jt-org-"));
  const file = join(dir, "org.json");
  try {
    store.save(file);
    const loaded = OrgStore.load(file);
    assert.deepEqual(loaded.toJSON(), store.toJSON());
    // Loaded store keeps working: id sequence continues without collision.
    const club = loaded.createSpace({
      institutionId: [...loaded.institutions.keys()][0],
      kind: "club",
      name: "Dramatics Club",
    });
    assert.ok(check.space(club), JSON.stringify(check.space.errors));

    // A tampered file is rejected on load.
    const data = JSON.parse(readFileSync(file, "utf8"));
    data.memberships[0].role = "overlord";
    const bad = join(dir, "bad.json");
    writeFileSync(bad, JSON.stringify(data), "utf8");
    assert.throws(() => OrgStore.load(bad), ValidationError);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
