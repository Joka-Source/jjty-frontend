// Sanity for the reference matcher and the spoken command grammar
// (now jt-speech's IntentStream through the app's adapter — see
// test/intents.test.mjs for the full intent surface).
import test from "node:test";
import assert from "node:assert/strict";
import { tokenize, matchTranscript } from "../src/match.js";
import { IntentStream, toCommand } from "../src/intents.js";
import { splitParagraphs, STARTER_DOC } from "../src/doc.js";

function speak(utterance) {
  const events = new IntentStream().push({ text: utterance, final: true });
  const cmds = events.map(toCommand).filter((c) => c.type !== "reading");
  return cmds[0] ?? null;
}

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

test("command grammar (jt-speech intents)", () => {
  assert.equal(speak("highlight this").act, "highlight");
  assert.equal(speak("mark this as important").act, "important");
  assert.equal(speak("Undo that").type, "undo");
  const n = speak("add a note check the roof clause");
  assert.equal(n.act, "note");
  assert.equal(n.noteText, "check the roof clause");
  assert.equal(speak("the deposit is one months rent"), null);
});
