// Sanity for the vendored matcher and the command grammar.
import test from "node:test";
import assert from "node:assert/strict";
import { tokenize, matchTranscript } from "../src/match.js";
import { parseCommand } from "../src/commands.js";
import { splitParagraphs, STARTER_DOC } from "../src/doc.js";

test("matcher finds a read passage despite mishearings", () => {
  const paragraphs = splitParagraphs(STARTER_DOC);
  const docTokens = [];
  const tokenBlock = [];
  for (const [i, p] of paragraphs.entries()) {
    for (const t of tokenize(p)) {
      docTokens.push(t);
      tokenBlock.push(i);
    }
  }
  const spoken = "rent is due on the first a five day grays period applies";
  const m = matchTranscript(docTokens, spoken);
  assert.ok(m, "expected a match");
  assert.equal(tokenBlock[m.start], 3);
  assert.ok(m.score > 0.62);
});

test("command grammar", () => {
  assert.equal(parseCommand("please highlight this").type, "highlight");
  assert.equal(parseCommand("mark this as important").type, "important");
  assert.equal(parseCommand("Undo that").type, "undo");
  const n = parseCommand("note that check the roof clause");
  assert.equal(n.type, "note");
  assert.equal(n.noteText, "check the roof clause");
  assert.equal(parseCommand("the deposit is one months rent"), null);
});
