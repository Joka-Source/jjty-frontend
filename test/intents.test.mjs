// jt-speech integration: the full intent surface through the app adapter,
// including honest ambiguity — an ambiguous parse maps to {type:"ask"} with
// the candidates carried along; nothing act-shaped falls out of it.
import test from "node:test";
import assert from "node:assert/strict";
import { IntentStream, toCommand, describeCandidate } from "../src/intents.js";

function events(utterance) {
  return new IntentStream().push({ text: utterance, final: true });
}

function first(utterance) {
  const cmds = events(utterance).map(toCommand).filter((c) => c.type !== "reading");
  return cmds[0] ?? null;
}

test("all eight jt-speech intents map onto app commands", () => {
  assert.deepEqual(
    { type: "act", act: "highlight" },
    (({ type, act }) => ({ type, act }))(first("highlight this"))
  );
  assert.equal(first("mark this important").act, "important");
  const note = first("add a note the tone shifts here");
  assert.equal(note.act, "note");
  assert.equal(note.noteText, "the tone shifts here");
  const range = first("highlight from rent is due to the deposit");
  assert.equal(range.type, "range");
  assert.equal(range.fromAnchor, "rent is due");
  assert.equal(range.toAnchor, "the deposit");
  assert.equal(first("undo that").type, "undo");
  assert.equal(first("show my acts").type, "show");
  const open = first("open the document river survey");
  assert.equal(open.type, "open");
  assert.equal(open.documentName, "river survey");
  const send = first("send this to amber brook cedar");
  assert.equal(send.type, "send");
  assert.equal(send.recipient, "amber brook cedar");
});

test("plain prose stays reading — no phantom commands", () => {
  const evs = events("the deposit is one months rent held in a protected account");
  assert.ok(evs.every((e) => e.type === "reading"), "prose produced a non-reading event");
});

test("ambiguity maps to ask and never to an act", () => {
  const cmd = first("highlight from rent is due to the deposit to the final inspection");
  assert.equal(cmd.type, "ask");
  assert.ok(cmd.candidates.length >= 2, "expected at least two candidates");
  assert.ok(cmd.reason.length > 0, "ambiguity carries no reason");
  // every candidate has a plain-words description for the prompt
  for (const c of cmd.candidates) {
    assert.ok(describeCandidate(c).length > 0);
  }
  // and both range splits are on offer
  const ranges = cmd.candidates.filter((c) => c.type === "intent" && c.intent === "highlight.range");
  assert.ok(ranges.length >= 2, "both range splits should be candidates");
});

test("evidence rides along on every intent", () => {
  const cmd = first("mark this important");
  assert.ok(cmd.evidence.includes("important"));
  assert.ok(cmd.confidence > 0.8);
});

test("return phrases map to current and named document commands", () => {
  assert.deepEqual(
    (({ type, documentName }) => ({ type, documentName }))(first("take me back")),
    { type: "return", documentName: "" }
  );
  assert.equal(first("where was I").type, "return");
  assert.deepEqual(
    (({ type, documentName }) => ({ type, documentName }))(first("go back to river survey")),
    { type: "return", documentName: "river survey" }
  );
});


test("courtesy beside a command is not reading, while actual prose remains reading", () => {
  assert.deepEqual(events('Please highlight this').map(toCommand).map(c=>c.type), ['act']);
  assert.deepEqual(events('Highlight this please').map(toCommand).map(c=>c.type), ['act']);
  assert.deepEqual(events('Please read this passage').map(toCommand).map(c=>c.type), ['reading']);
  assert.deepEqual(events('Purple elephants highlight this').map(toCommand).map(c=>c.type), ['reading','act']);
});

test('named highlight preserves the entire heard phrase instead of current-passage ambiguity', () => {
  for (const phrase of ['a lead charge', 'a late charge']) {
    const text = `Highlight ${phrase}`;
    const commands = events(text).map(toCommand);
    assert.equal(commands.length, 1);
    assert.equal(commands[0].type, 'act');
    assert.equal(commands[0].verbId, 'highlight');
    assert.equal(commands[0].targetPhrase, phrase);
    assert.equal(commands[0].evidence, text);
  }
});

test('named highlight does not reinterpret prose, partial commands, ranges or compound instructions', () => {
  assert.equal(events('the report will highlight the risks').map(toCommand).some(c => c.targetPhrase), false);
  for (const text of ['highlight', 'highlight from rent', 'highlight this', 'highlight a late charge undo that']) {
    assert.equal(events(text).map(toCommand).some(c => c.targetPhrase), false, text);
  }
  assert.equal(first('highlight from rent is due to the deposit').type, 'range');
  const stream = new IntentStream();
  assert.deepEqual(stream.push({text:'Highlight a late charge',final:false}), []);
  assert.equal(stream.push({text:'Highlight a late charge',final:true}).map(toCommand)[0].targetPhrase, 'a late charge');
});
