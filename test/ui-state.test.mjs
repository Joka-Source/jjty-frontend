import test from "node:test";
import assert from "node:assert/strict";
import { JETT_UI_STATES, stateViewModel, renderStateSurface } from "../src/ui-state.js";

test("the shared surface defines every recoverable product state", () => {
  assert.deepEqual(Object.keys(JETT_UI_STATES), [
    "loading",
    "empty",
    "offline",
    "permission",
    "error",
    "recovery",
  ]);
});

test("recoverable states expose one action while passive loading only announces progress", () => {
  for (const name of Object.keys(JETT_UI_STATES)) {
    const state = stateViewModel(name);
    assert.ok(state.title);
    assert.ok(state.message);
    if (name === "loading") assert.equal(state.action, null);
    else {
      assert.ok(state.action.label);
      assert.ok(state.action.event);
    }
    assert.match(state.live, /^(polite|assertive)$/);
  }
  assert.doesNotMatch(renderStateSurface("loading"), /<button/);
});

test("unknown state names fail closed", () => {
  assert.throws(() => stateViewModel("lost"), /Unknown JETT UI state: lost/);
});

test("rendered recovery state preserves semantic status and action identity", () => {
  const html = renderStateSurface("recovery");
  assert.match(html, /role="status"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /data-state="recovery"/);
  assert.match(html, /data-state-action="restore-draft"/);
  assert.match(html, />Restore draft</);
});
