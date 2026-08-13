import test from "node:test";
import assert from "node:assert/strict";

import { renderGlassMarkup } from "../src/panels.ts";
import { renderGlassIntro } from "../src/index.ts";
import { emptyGlassState, type GlassState } from "../src/state.ts";

test("panel markup escapes session data and explains each visible area", () => {
  const state: GlassState = {
    ...emptyGlassState(),
    throughSeq: 3,
    transcript: [
      {
        seq: 1,
        text: '<img src=x onerror="alert(1)">',
        final: false,
        source: "speech",
        classification: "unresolved",
        confidence: 0.4,
      },
    ],
    records: [
      {
        seq: 2,
        record: { text: "<script>bad()</script>" },
        schema: { name: "jt.act.v1", valid: false, errors: ["id is required"] },
      },
    ],
    latencies: [{ seq: 3, stage: "matcher", durationMs: 2, budgetMs: 1 }],
    decisions: [{ seq: 4, result: "handled", reason: "The document opened.", ambiguities: [], thresholds: { accept: 0.62, askBelow: 0.78, closeGap: 0.04 } }],
  };

  const html = renderGlassMarkup(state);

  assert.ok(!html.includes("<img src=x"));
  assert.ok(!html.includes("<script>bad"));
  assert.match(html, /&lt;img src=x/);
  assert.match(html, /Live words/);
  assert.match(html, /Match view/);
  assert.match(html, /Why jt acted/);
  assert.match(html, /Saved record/);
  assert.match(html, /Timing/);
  assert.match(html, /Needs attention/);
  assert.match(html, /Over budget/);
  assert.match(html, /Handled/);
});

test("the exported mount heading escapes a caller-provided title", () => {
  const html = renderGlassIntro('<img src=x onerror="alert(1)">');
  assert.ok(!html.includes("<img src=x"));
  assert.match(html, /&lt;img src=x/);
});
