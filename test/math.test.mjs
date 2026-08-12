import test from "node:test";
import assert from "node:assert/strict";
import { validateCursor, validateReceipt, errorsOf } from "./validate.mjs";
import { makeActEntry } from "../src/records.js";
import { momentFromEntry } from "../src/sync.js";
import {
  mathControl,
  translateSpokenMath,
  makeSpokenMathDocument,
} from "../src/math.js";

test("math controls enter, keep, and exit without becoming expressions", () => {
  assert.equal(mathControl("start math mode", false), "enter");
  assert.equal(mathControl("keep that", true), "keep");
  assert.equal(mathControl("exit math mode", true), "exit");
  assert.equal(mathControl("one half plus x squared", true), null);
});

test("spoken transcript becomes LaTeX and a valid durable math record pair", () => {
  const expression = translateSpokenMath("one half plus x squared");
  assert.deepEqual(expression, {
    speech: "one half plus x squared",
    latex: "\\frac{1}{2} + x^{2}",
    unparsed: [],
  });

  const entry = makeActEntry({
    docId: "doc-math",
    revision: 1,
    blockIndex: 0,
    act: "math",
    modality: "voice",
    evidence: expression.speech,
    mathSpeech: expression.speech,
    mathLatex: expression.latex,
    mathUnparsed: expression.unparsed,
    at: "2026-08-12T09:30:00.000Z",
  });

  assert.equal(entry.act, "math");
  assert.equal(entry.mathSpeech, "one half plus x squared");
  assert.equal(entry.mathLatex, "\\frac{1}{2} + x^{2}");
  assert.deepEqual(entry.mathUnparsed, []);
  assert.equal(entry.cursor.proposedIntention, "keep spoken mathematics at block 0");
  assert.equal(entry.receipt.result, "mathematics kept at block 0: \\frac{1}{2} + x^{2}");
  assert.ok(validateCursor(entry.cursor), errorsOf(validateCursor));
  assert.ok(validateReceipt(entry.receipt), errorsOf(validateReceipt));
});

test("spoken mathematics document is created once and appends expression blocks", async () => {
  const first = await makeSpokenMathDocument(null, {
    speech: "one half",
    latex: "\\frac{1}{2}",
    unparsed: [],
  }, {
    id: "doc-spoken-math",
    at: "2026-08-12T09:30:00.000Z",
  });

  assert.equal(first.title, "spoken mathematics");
  assert.equal(first.provenance.sourceKind, "spoken");
  assert.equal(first.provenance.createdBy, "voice");
  assert.equal(first.revision, 1);
  assert.deepEqual(first.blocks, [{
    text: "one half",
    kind: "spoken-math",
    mathLatex: "\\frac{1}{2}",
    mathUnparsed: [],
  }]);
  assert.match(first.provenance.contentDigest, /^sha256:[0-9a-f]{64}$/);

  const second = await makeSpokenMathDocument(first, {
    speech: "x squared mystery",
    latex: "x^{2}",
    unparsed: ["mystery"],
  }, {
    at: "2026-08-12T09:31:00.000Z",
  });

  assert.equal(second.id, first.id);
  assert.equal(second.revision, 2);
  assert.equal(second.blocks.length, 2);
  assert.equal(second.blocks[1].text, "x squared mystery");
  assert.deepEqual(second.blocks[1].mathUnparsed, ["mystery"]);
  assert.notEqual(second.provenance.contentDigest, first.provenance.contentDigest);
  assert.equal(second.provenance.capturedAt, first.provenance.capturedAt);
  assert.equal(second.provenance.updatedAt, "2026-08-12T09:31:00.000Z");
});

test("a sent math moment carries the expression rather than only surrounding prose", async () => {
  const entry = makeActEntry({
    docId: "doc-reading",
    revision: 3,
    blockIndex: 1,
    act: "math",
    modality: "voice",
    evidence: "x squared mystery",
    mathSpeech: "x squared mystery",
    mathLatex: "x^{2}",
    mathUnparsed: ["mystery"],
    at: "2026-08-12T09:32:00.000Z",
  });
  const doc = {
    id: "doc-reading",
    title: "algebra notes",
    text: "first block\n\nthe surrounding prose",
    revision: 3,
    provenance: {
      contentDigest: `sha256:${"a".repeat(64)}`,
    },
  };

  const moment = await momentFromEntry(entry, doc, ["first block", "the surrounding prose"]);
  assert.deepEqual(moment.blocks, [{
    kind: "math",
    content: "x^{2}",
    spoken: "x squared mystery",
    unparsed: ["mystery"],
    anchorId: "anc-doc-reading-b1",
  }]);
  assert.equal(moment.cursor.id, entry.cursor.id);
  assert.equal(moment.receipt.id, entry.receipt.id);
});
