import { test } from "node:test";
import assert from "node:assert/strict";
import { notebook, appendItem, validate } from "../notebooks/model.js";
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

test("backup preserves original PDF, page image, text and per-page template", () => {
  const n = notebook("PDF");
  n.source = { name: "test.pdf", data: "data:application/pdf;base64,JVBERi0=" };
  n.pages[0].background = "data:image/jpeg;base64,/9j/";
  n.pages[0].sourceText = "searchable";
  n.pages[0].paper = "blank";
  const d = validate({ version: 1, notebooks: [n] });
  assert.deepEqual(d.notebooks[0], n);
});
test("backup rejects remote image injection and invalid marker opacity", () => {
  const n = notebook("Bad");
  n.pages[0].background = "https://example.com/private";
  assert.throws(() => validate({ version: 1, notebooks: [n] }));
  delete n.pages[0].background;
  n.pages[0].items.push({
    type: "ink",
    points: [],
    color: "#000000",
    width: 2,
    opacity: '0" onclick="x',
  });
  assert.throws(() => validate({ version: 1, notebooks: [n] }));
});

test("lasso selects enclosed objects and movement preserves unselected content", async () => {
  const { selectItems, moveItems } = await import("../notebooks/selection.js");
  const items = [
    {
      type: "ink",
      points: [
        [10, 10],
        [20, 20],
      ],
    },
    { type: "text", text: "outside", x: 100, y: 100 },
  ];
  const selected = selectItems(items, [
    [0, 0],
    [40, 0],
    [40, 40],
    [0, 40],
  ]);
  assert.deepEqual(selected, [0]);
  const moved = moveItems(items, selected, 5, -2);
  assert.deepEqual(moved[0].points, [
    [15, 8],
    [25, 18],
  ]);
  assert.deepEqual(moved[1], items[1]);
  assert.deepEqual(items[0].points, [
    [10, 10],
    [20, 20],
  ]);
});
