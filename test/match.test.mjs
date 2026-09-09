// Sanity for the reference matcher and the spoken command grammar
// (now jt-speech's IntentStream through the app's adapter — see
// test/intents.test.mjs for the full intent surface).
import test from "node:test";
import assert from "node:assert/strict";
import { tokenize, tokenizeWithSpans, matchTranscript } from "../src/match.js";
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

test("matcher exposes exact source character spans for normalized tokens", async () => {
  const match = await import("../src/match.js");
  assert.equal(typeof match.tokenizeWithSpans, "function");
  assert.deepEqual(match.tokenizeWithSpans("Don’t re-target café & tea."), [
    { token: "dont", start: 0, end: 5, text: "Don’t" },
    { token: "re", start: 6, end: 8, text: "re" },
    { token: "target", start: 9, end: 15, text: "target" },
    { token: "cafe", start: 16, end: 20, text: "café" },
    { token: "and", start: 21, end: 22, text: "&" },
    { token: "tea", start: 23, end: 26, text: "tea" },
  ]);
});

test("matcher ranks repeated target spans instead of collapsing them to one block", async () => {
  const match = await import("../src/match.js");
  assert.equal(typeof match.findMatches, "function");
  const doc = tokenize("opening shared target words closing unrelated shared target words ending");
  const candidates = match.findMatches(doc, tokenize("shared target words"), { limit: 4 });
  assert.deepEqual(
    candidates.slice(0, 2).map(({ start, end, score }) => ({ start, end, score })),
    [
      { start: 1, end: 3, score: 1 },
      { start: 6, end: 8, score: 1 },
    ],
  );
});

test('display spans retain combining marks and agree with normalized Hindi and decomposed words', () => {
  const text='Read नमस्ते दुनिया and cafe\u0301.';
  const spans=tokenizeWithSpans(text);
  assert.deepEqual(spans.map(span=>span.token),tokenize(text));
  assert.deepEqual(spans.map(span=>text.slice(span.start,span.end)),['Read','नमस्ते','दुनिया','and','cafe\u0301']);
});
