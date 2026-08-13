// Records conform to the jt-contracts schemas. Golden fixtures must pass;
// our factories' output must pass; the invalid fixtures logic is covered
// upstream in jt-contracts itself.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { validateCursor, validateReceipt, errorsOf, root } from "./validate.mjs";
import { makeCursor, makeReceipt, makeActEntry, makeReturnEntry } from "../src/records.js";

function fixtures(kind) {
  const dir = path.join(root, "contracts", "fixtures", kind);
  return readdirSync(dir).map((f) => [
    f,
    JSON.parse(readFileSync(path.join(dir, f), "utf8")),
  ]);
}

test("golden cursor fixtures validate", () => {
  for (const [name, fx] of fixtures("cursor")) {
    assert.ok(validateCursor(fx), `${name}: ${errorsOf(validateCursor)}`);
  }
});

test("golden receipt fixtures validate", () => {
  for (const [name, fx] of fixtures("receipt")) {
    assert.ok(validateReceipt(fx), `${name}: ${errorsOf(validateReceipt)}`);
  }
});

const base = {
  docId: "doc-test1",
  revision: 1,
  blockIndex: 3,
  modality: "voice",
  evidence: "highlight this",
};

test("makeCursor output validates against cursor.schema.json", () => {
  const c = makeCursor({ ...base, intention: "highlight this block (block 3)" });
  assert.ok(validateCursor(c), errorsOf(validateCursor));
  assert.equal(c.sourceId, "doc-test1");
  assert.equal(c.anchorId, "anc-doc-test1-b3");
});

test("makeReceipt output validates against receipt.schema.json", () => {
  const r = makeReceipt({
    ...base,
    actionId: "act-x",
    result: "block 3 highlighted",
    arrival: "exact",
  });
  assert.ok(validateReceipt(r), errorsOf(validateReceipt));
  assert.equal(r.arrival, "exact");
  assert.equal(r.sourceRevision, "r1");
});

test("a proof record cannot silently invent an exact arrival", () => {
  assert.throws(
    () => makeReceipt({ ...base, actionId: "act-x", result: "block 3 highlighted" }),
    /arrival must describe/i,
  );
  const blockFallback = makeActEntry({ ...base, act: "highlight" });
  assert.equal(blockFallback.arrival, "approximate");
  assert.equal(blockFallback.receipt.arrival, "approximate");
});

test("records preserve durable anchor, chosen-target evidence, and honest arrival", () => {
  const anchor = {
    blockIndex: 3,
    tokenStart: 2,
    tokenEnd: 5,
    quotedText: "five day grace period",
    prefix: "first. A ",
    suffix: " applies; after",
    docDigest: `sha256:${"c".repeat(64)}`,
  };
  const targetChoice = {
    asked: true,
    reason: "two passages were similarly likely",
    candidates: ["five day grace period", "five day notice period"],
    chosen: "five day grace period",
  };
  const entry = makeActEntry({
    ...base,
    act: "highlight",
    anchor,
    arrival: "refound",
    targetChoice,
  });
  assert.deepEqual(entry.anchor, anchor);
  assert.equal(entry.arrival, "refound");
  assert.equal(entry.receipt.arrival, "refound");
  assert.deepEqual(entry.targetChoice, targetChoice);
  assert.match(entry.cursor.history.at(-1).event, /person chose.*five day grace period/i);
  assert.ok(validateReceipt(entry.receipt), errorsOf(validateReceipt));
});

test("every act kind produces a valid cursor + receipt pair", () => {
  for (const act of ["highlight", "important", "note", "undo"]) {
    const entry = makeActEntry({
      ...base,
      act,
      noteText: act === "note" ? "check this later" : "",
      undoes: act === "undo" ? "evt-earlier" : null,
      confidence: 0.91,
      matchedText: "Rent is due on the first.",
    });
    assert.ok(validateCursor(entry.cursor), `${act} cursor: ${errorsOf(validateCursor)}`);
    assert.ok(validateReceipt(entry.receipt), `${act} receipt: ${errorsOf(validateReceipt)}`);
    assert.equal(entry.act, act);
    // Wrapper evidence stays on the wrapper, never leaks into the pure records.
    assert.equal(entry.cursor.confidence, undefined);
    assert.equal(entry.receipt.confidence, undefined);
  }
});

test("undo entries reference the reversed act", () => {
  const entry = makeActEntry({ ...base, act: "undo", undoes: "evt-abc" });
  assert.equal(entry.kind, "undo");
  assert.equal(entry.undoes, "evt-abc");
  assert.match(entry.cursor.proposedIntention, /evt-abc/);
  assert.match(entry.receipt.result, /evt-abc/);
});

test("a return is a valid lightweight non-undoable record pair", () => {
  const entry = makeReturnEntry({
    docId: "doc-test1",
    revision: 2,
    blockIndex: 4,
    modality: "voice",
    evidence: "where was I",
    matchedText: "The river turns north here.",
    at: "2026-08-13T06:30:00.000Z",
  });
  assert.equal(entry.kind, "return");
  assert.equal(entry.act, "return");
  assert.equal(entry.blockIndex, 4);
  assert.equal(entry.cursor.state, "return");
  assert.equal(entry.cursor.undoAvailable, false);
  assert.equal(entry.cursor.capturedEvidence, "where was I");
  assert.equal(entry.receipt.result, "returned to block 4");
  assert.ok(validateCursor(entry.cursor), errorsOf(validateCursor));
  assert.ok(validateReceipt(entry.receipt), errorsOf(validateReceipt));
});
