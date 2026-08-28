import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { replayEvents, stateOutcome } from "../src/state.ts";
import { createRecorder, diffOutcome, parseJsonl } from "../src/replay.ts";
import { createTap } from "../src/tap.ts";

const fixtureUrl = new URL("../fixtures/demo-session.jsonl", import.meta.url);
const mutatedUrl = new URL("../fixtures/demo-mutated.jsonl", import.meta.url);
const expectedUrl = new URL("../fixtures/demo-expected.json", import.meta.url);

test("the same fixture always produces the same panel state", async () => {
  const events = parseJsonl(await readFile(fixtureUrl, "utf8"));
  const expected = JSON.parse(await readFile(expectedUrl, "utf8"));

  const first = stateOutcome(replayEvents(events));
  const second = stateOutcome(replayEvents(events));

  assert.deepEqual(first, second);
  assert.deepEqual(first, expected);
});

test("a changed match score is reported at its exact outcome path", async () => {
  const expected = JSON.parse(await readFile(expectedUrl, "utf8"));
  const mutated = parseJsonl(await readFile(mutatedUrl, "utf8"));
  const actual = stateOutcome(replayEvents(mutated));

  assert.deepEqual(diffOutcome(expected, actual), [
    {
      path: "$.match.blocks[2].score",
      expected: 0.88,
      actual: 0.71,
      kind: "changed",
    },
  ]);
});

test("a recorder captures only the live events between start and stop", () => {
  const tap = createTap("recording", {
    now: () => "2026-08-13T10:00:00.000Z",
    id: (seq) => `recording-${seq}`,
  });
  const recorder = createRecorder(tap);
  tap.emit({ kind: "transcriptEvent", text: "before", final: true, source: "typed" });
  recorder.start();
  const kept = tap.emit({ kind: "transcriptEvent", text: "during", final: true, source: "typed" });
  recorder.stop();
  tap.emit({ kind: "transcriptEvent", text: "after", final: true, source: "typed" });

  assert.deepEqual(recorder.events(), [kept]);
  assert.equal(recorder.toJSONL(), `${JSON.stringify(kept)}\n`);
});

test("a malformed JSONL line names the line and contract problem", () => {
  assert.throws(
    () => parseJsonl('{"v":1,"kind":"latencyMark"}\n'),
    /Line 1 is not a tap event: sessionId must be a non-empty string/,
  );
});

test("a recorder can update a live replay as each event arrives", () => {
  const tap = createTap("live", { now: () => "2026-08-13T10:00:00.000Z" });
  const seen: string[] = [];
  const recorder = createRecorder(tap, (event) => seen.push(event.kind));
  recorder.start();
  tap.emit({ kind: "transcriptEvent", text: "now", final: false, source: "speech" });

  assert.deepEqual(seen, ["transcriptEvent"]);
});

test("new interim words replace the previous changing hypothesis", () => {
  const tap = createTap("speech", { now: () => "2026-08-13T10:00:00.000Z" });
  const events = [
    tap.emit({ kind: "transcriptEvent", text: "rent is", final: false, source: "speech" }),
    tap.emit({ kind: "transcriptEvent", text: "rent is due", final: false, source: "speech" }),
    tap.emit({ kind: "transcriptEvent", text: "rent is due", final: true, source: "speech" }),
  ];

  assert.deepEqual(replayEvents(events).transcript, [
    { seq: 3, text: "rent is due", final: true, source: "speech" },
  ]);
});

test("replay rejects mixed sessions even when called from plain JavaScript", () => {
  const a = createTap("a", { now: () => "2026-08-13T10:00:00.000Z" });
  const b = createTap("b", { now: () => "2026-08-13T10:00:00.000Z" });
  assert.throws(
    () => replayEvents([
      a.emit({ kind: "transcriptEvent", text: "one", final: true, source: "typed" }),
      b.emit({ kind: "transcriptEvent", text: "two", final: true, source: "typed" }),
    ]),
    /one session/,
  );
});
