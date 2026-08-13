import test from "node:test";
import assert from "node:assert/strict";

import { createTap, validateTapEvent, type TapEvent } from "../src/tap.ts";

const transcript: TapEvent = {
  v: 1,
  kind: "transcriptEvent",
  sessionId: "session-test",
  eventId: "event-1",
  seq: 1,
  at: "2026-08-13T10:00:00.000Z",
  text: "highlight this",
  final: true,
  source: "speech",
};

test("the tap contract accepts a complete transcript event", () => {
  assert.deepEqual(validateTapEvent(transcript), { ok: true, event: transcript });
});

test("the tap contract explains malformed match spans", () => {
  const malformed = {
    v: 1,
    kind: "matchScores",
    sessionId: "session-test",
    eventId: "event-2",
    seq: 2,
    at: "2026-08-13T10:00:00.010Z",
    query: "rent is due",
    blocks: [{ blockId: "block-1", blockIndex: 1, score: 1.2, spans: [] }],
  };

  const result = validateTapEvent(malformed);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("; "), /blocks\[0\]\.score.*between 0 and 1/);
});

test("a tap publishes in order and records portable JSONL", () => {
  const tap = createTap("session-test", {
    now: () => "2026-08-13T10:00:00.000Z",
    id: (seq) => `event-${seq}`,
  });
  const seen: TapEvent[] = [];
  const stop = tap.subscribe((event) => seen.push(event));

  const event = tap.emit({
    kind: "transcriptEvent",
    text: "highlight this",
    final: true,
    source: "speech",
  });
  stop();

  assert.equal(event.seq, 1);
  assert.deepEqual(seen, [event]);
  assert.equal(tap.toJSONL(), `${JSON.stringify(event)}\n`);
});

test("every event kind crosses the JSON boundary", () => {
  const base = { v: 1, sessionId: "session-all", at: "2026-08-13T10:00:00.000Z" };
  const bodies = [
    { kind: "transcriptEvent", text: "read this", final: true, source: "typed" },
    { kind: "segmentationDecision", segmentText: "read this", classification: "command", confidence: 0.9, reason: "Known instruction." },
    { kind: "matchScores", query: "rent", blocks: [{ blockId: "b1", blockIndex: 0, score: 0.8, spans: [{ start: 1, end: 2, score: 0.8, unit: "token" }] }] },
    { kind: "intentResult", result: "handled", intent: "open", confidence: 0.9, ambiguities: [], thresholds: { accept: 0.62, askBelow: 0.78, closeGap: 0.04 }, reason: "The document opened." },
    { kind: "actCommitted", act: "highlight", input: "highlight this", target: { blockId: "b1", blockIndex: 0, start: 1, end: 2 } },
    { kind: "recordWritten", record: { id: "r1" }, schema: { name: "jt act", valid: null, errors: [] } },
    { kind: "latencyMark", stage: "matcher", durationMs: 0.8, budgetMs: 1 },
  ];

  for (const [index, body] of bodies.entries()) {
    const event = { ...base, ...body, eventId: `all-${index + 1}`, seq: index + 1 };
    assert.deepEqual(validateTapEvent(JSON.parse(JSON.stringify(event))), { ok: true, event });
  }
});

test("event times must include a canonical ISO time", () => {
  const result = validateTapEvent({ ...transcript, at: "2026-08-13" });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("; "), /at must be an ISO date and time/);
});
