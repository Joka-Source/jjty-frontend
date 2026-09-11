import { test } from "node:test";
import assert from "node:assert/strict";
import { notebook, appendItem, validate } from "../public/notebooks/model.js";
test("notebook strokes survive serialized round trip without mutating previous history", () => {
  const n = notebook("Research");
  const next = appendItem(n, 0, {
    type: "ink",
    points: [
      [1, 2],
      [3, 4],
    ],
    color: "#123456",
    width: 2,
  });
  assert.equal(n.pages[0].items.length, 0);
  const restored = validate(
    JSON.parse(JSON.stringify({ version: 1, notebooks: [next] })),
  );
  assert.deepEqual(restored.notebooks[0].pages[0].items, next.pages[0].items);
});
test("invalid imported data rejected before entering workspace", () => {
  const n = notebook("Bad");
  n.color = "red;display:none";
  assert.throws(() => validate({ version: 1, notebooks: [n] }));
  assert.throws(() => validate({ version: 2, notebooks: [] }));
});
test("duplicate notebook identities cannot silently overwrite data", () => {
  const n = notebook("one");
  assert.throws(() => validate({ version: 1, notebooks: [n, n] }));
});
test("backup cannot inject markup through notebook identity", () => {
  const n = notebook("x");
  n.id = 'x" onclick="alert(1)';
  assert.throws(() => validate({ version: 1, notebooks: [n] }));
});
