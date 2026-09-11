import test from "node:test";
import assert from "node:assert/strict";
import * as stories from "../stories/ui-state.stories.js";

const EXPECTED = ["Loading", "Empty", "Offline", "Permission", "Error", "Recovery"];

test("Storybook exposes every shared semantic state", () => {
  assert.deepEqual(EXPECTED.filter((name) => !(name in stories)), []);
  for (const name of EXPECTED) {
    const html = stories[name].render();
    assert.match(html, new RegExp(`data-state="${name.toLowerCase()}"`));
    if (name === "Loading") assert.doesNotMatch(html, /data-state-action=/);
    else assert.match(html, /data-state-action=/);
  }
});
