// Records conform to the jt-contracts schemas. Golden fixtures must pass;
// our factories' output must pass; the invalid fixtures logic is covered
// upstream in jt-contracts itself.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { validateCursor, validateReceipt, errorsOf, root } from "./validate.mjs";
import { makeCursor, makeReceipt, makeActEntry } from "../src/records.js";

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
  const r = makeReceipt({ ...base, actionId: "act-x", result: "block 3 highlighted" });
  assert.ok(validateReceipt(r), errorsOf(validateReceipt));
  assert.equal(r.arrival, "exact");
  assert.equal(r.sourceRevision, "r1");
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
