// The spaces surface is real function: src/org.js is the browser port of
// jt-contracts' reference OrgStore, validating every record against the
// vendored schemas in contracts/org/ and persisting through a Storage-like
// object. These tests prove the port keeps the contract honest.
import test from "node:test";
import assert from "node:assert/strict";
import { OrgStore, ValidationError, SPACE_KINDS, MEMBER_ROLES } from "../src/org.js";

/** localStorage stand-in for node. */
function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

test("org store: institution -> space -> membership, all schema-valid", () => {
  const org = new OrgStore();
  const inst = org.createInstitution({ name: "A Small College", kind: "college" });
  assert.equal(inst.schemaVersion, "0.1.0");
  const space = org.createSpace({ institutionId: inst.id, kind: "class", name: "CSE-A" });
  const mem = org.addMember({
    personId: "per-asha",
    spaceId: space.id,
    role: "student",
    institutionalIdentity: { rollNumber: "22CSE014" },
  });
  assert.equal(org.membersOf(space.id).length, 1);
  assert.equal(org.membersOf(space.id)[0].id, mem.id);
  assert.deepEqual(
    org.spacesOf("per-asha").map((s) => s.name),
    ["CSE-A"]
  );
});

test("org store: the contract rejects bad records before they are kept", () => {
  const org = new OrgStore();
  const inst = org.createInstitution({ name: "A Small College" });
  // a space kind outside the schema enum must be refused
  assert.throws(
    () => org.createSpace({ institutionId: inst.id, kind: "spaceship", name: "X" }),
    ValidationError
  );
  // referential integrity: no space on an unknown institution
  assert.throws(() => org.createSpace({ institutionId: "inst-nope", kind: "class", name: "X" }), /unknown institution/);
  // no double current membership for the same person in the same space
  const space = org.createSpace({ institutionId: inst.id, kind: "club", name: "Dramatics" });
  org.addMember({ personId: "per-b", spaceId: space.id, role: "member" });
  assert.throws(
    () => org.addMember({ personId: "per-b", spaceId: space.id, role: "member" }),
    /already has a current membership/
  );
  // nothing invalid leaked into the store
  assert.equal(org.spaces.size, 1);
  assert.equal(org.memberships.size, 1);
});

test("org store: persistence round-trips through Storage and survives garbage", () => {
  const storage = memStorage();
  const org = new OrgStore();
  const inst = org.createInstitution({ name: "A Small College" });
  const hostel = org.createSpace({ institutionId: inst.id, kind: "hostel", name: "Hostel 7" });
  const floor = org.createSpace({
    institutionId: inst.id,
    kind: "floor",
    name: "Second floor",
    parentSpaceId: hostel.id,
  });
  org.save(storage);

  const again = OrgStore.load(storage);
  assert.equal(again.institutions.size, 1);
  assert.deepEqual(
    again.spaceChain(floor.id).map((s) => s.name),
    ["Hostel 7", "Second floor"]
  );
  // ids keep counting where they left off — no collisions after reload
  const next = again.createSpace({ institutionId: inst.id, kind: "room", name: "Room 214", parentSpaceId: floor.id });
  assert.notEqual(next.id, floor.id);

  // a corrupted blob yields a fresh store, never a crash
  storage.setItem("jt.org", "{not json");
  const fresh = OrgStore.load(storage);
  assert.equal(fresh.institutions.size, 0);
});

test("org store: schema enums are exported for the UI, not retyped", () => {
  assert.ok(SPACE_KINDS.includes("hostel"));
  assert.ok(MEMBER_ROLES.includes("student"));
  const org = new OrgStore();
  const inst = org.createInstitution({ name: "C" });
  const space = org.createSpace({ institutionId: inst.id, kind: SPACE_KINDS[0], name: "S" });
  const ctxRecord = org.spaceContextFor(space.id, { visibility: "space" });
  assert.equal(ctxRecord.spaceId, space.id);
  assert.equal(ctxRecord.institutionId, inst.id);
});
