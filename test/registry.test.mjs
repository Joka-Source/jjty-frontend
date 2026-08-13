import test from "node:test";
import assert from "node:assert/strict";
import { createVerbRegistry, historyTitleFor, verbRegistry } from "../src/registry/index.js";
import { makeActEntry } from "../src/records.js";

const expectedIds = [
  "highlight",
  "highlight-range",
  "annotate",
  "mark-important",
  "send-to",
  "send-to-space",
  "undo",
  "return",
  "open-document",
  "math-keep",
  "find",
  "quote",
  "gather",
  "compare",
  "remind",
  "translate-this",
  "capture",
  "share-sheet-intake",
  "cross-device-drop",
  "togetherness",
  "show-history",
];

test("registry exposes every real and designed verb as an executable self-description", () => {
  assert.deepEqual(
    verbRegistry.list().map(({ id }) => id).sort(),
    expectedIds.sort(),
  );
  for (const verb of verbRegistry.list()) {
    assert.equal(typeof verb.id, "string", `${verb.id}: id`);
    assert.ok(verb.spokenForms.length > 0, `${verb.id}: spoken forms`);
    assert.match(verb.description, /^[a-z0-9]/i, `${verb.id}: plain description`);
    assert.equal(verb.argsSchema.type, "object", `${verb.id}: args schema`);
    assert.ok(Array.isArray(verb.recordKinds), `${verb.id}: record kinds`);
    assert.ok(["real", "partial", "designed"].includes(verb.status), `${verb.id}: status`);
    assert.equal(typeof verb.execute, "function", `${verb.id}: execute`);
    assert.match(verb.testReference, /^test\/.+\.test\.mjs/, `${verb.id}: test reference`);
  }
});

test("intent and stored-record aliases resolve to registry modules", () => {
  assert.equal(verbRegistry.forIntent("highlight.this").id, "highlight");
  assert.equal(verbRegistry.forIntent("annotate.this").id, "annotate");
  assert.equal(verbRegistry.forIntent("document.return").id, "return");
  assert.equal(verbRegistry.resolve("note").id, "annotate");
  assert.equal(verbRegistry.resolve("important").id, "mark-important");
  assert.equal(verbRegistry.resolve("math").id, "math-keep");
});

test("designed verbs route only to their honest room description", async () => {
  const opened = [];
  const verb = verbRegistry.get("compare");
  const result = await verb.execute(
    { openRoom: (room) => opened.push(room) },
    {},
  );
  assert.deepEqual(opened, [{ id: "compare", description: verb.roomDescription }]);
  assert.deepEqual(result, { kind: "designed-room", id: "compare" });
});

test("a runtime registration joins the same ordered catalog", () => {
  const registry = createVerbRegistry([]);
  registry.register({
    id: "dummy-verb",
    spokenForms: ["dummy verb"],
    description: "Prove that live registration changes the catalog.",
    argsSchema: { type: "object", additionalProperties: false },
    recordKinds: [],
    status: "designed",
    testReference: "test/registry.test.mjs",
    roomDescription: "This room proves registration without claiming execution.",
    execute: () => { throw new Error("a designed executor must be replaced by the registry"); },
  });
  assert.equal(registry.list()[0].id, "dummy-verb");
  const rooms = [];
  assert.deepEqual(
    registry.get("dummy-verb").execute({ openRoom: (room) => rooms.push(room) }, {}),
    { kind: "designed-room", id: "dummy-verb" },
  );
  assert.deepEqual(rooms, [{
    id: "dummy-verb",
    description: "This room proves registration without claiming execution.",
  }]);
  assert.throws(() => registry.register(registry.get("dummy-verb")), /already registered/);
});

test("registration rejects malformed modules and stored alias collisions", () => {
  const registry = createVerbRegistry([]);
  const base = {
    id: "first",
    spokenForms: ["first"],
    description: "Create a first test act.",
    argsSchema: { type: "object", additionalProperties: false },
    recordKinds: ["act"],
    status: "real",
    testReference: "test/registry.test.mjs",
    recordAct: "same-alias",
    recordDescription: () => "first intention",
    recordResult: () => "first result",
    execute: () => null,
  };
  registry.register(base);
  assert.throws(() => registry.register({ ...base, id: "second" }), /record alias same-alias is already registered/);
  assert.throws(
    () => registry.register({ ...base, id: "bad-schema", argsSchema: null }),
    /argsSchema/,
  );
  assert.throws(
    () => registry.register({ ...base, id: "dishonest", status: "designed", recordAct: null }),
    /roomDescription/,
  );

  const aliasFirst = createVerbRegistry([]);
  aliasFirst.register({ ...base, recordAct: "shadow" });
  assert.throws(
    () => aliasFirst.register({ ...base, id: "shadow", recordAct: "second-act" }),
    /verb id shadow collides with record alias/,
  );

  const idFirst = createVerbRegistry([]);
  idFirst.register({ ...base, id: "shadow", recordAct: "first-act" });
  assert.throws(
    () => idFirst.register({ ...base, id: "second", recordAct: "shadow" }),
    /record alias shadow collides with verb id/,
  );
});

test("record and history output come from a newly registered verb module", () => {
  verbRegistry.register({
    id: "test-record-verb",
    spokenForms: ["test record"],
    description: "Create a record that proves registry-owned wording.",
    argsSchema: { type: "object", additionalProperties: false },
    recordKinds: ["act", "intention", "proof"],
    status: "real",
    testReference: "test/registry.test.mjs",
    recordAct: "test-record",
    historyTitle: "registry title",
    recordDescription: () => "registry intention",
    recordResult: () => "registry result",
    execute: () => null,
  });
  const entry = makeActEntry({
    docId: "doc-test",
    revision: 1,
    blockIndex: 0,
    verbId: "test-record-verb",
    modality: "pointer",
    evidence: "test",
  });
  assert.equal(entry.cursor.proposedIntention, "registry intention");
  assert.equal(entry.receipt.result, "registry result");
  assert.equal(historyTitleFor(entry), "registry title");
});
