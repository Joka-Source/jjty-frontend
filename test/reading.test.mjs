import test from "node:test";
import assert from "node:assert/strict";
import { createAnchor, resolveAnchor } from "../src/anchors.js";

async function readingApi() {
  return import("../src/pdf-reading.js").catch(() => ({}));
}

async function highlightApi() {
  return import("../src/highlight.js").catch(() => ({}));
}

test("a PDF text anchor survives a zoom change", async () => {
  const { createPdfReadingModel } = await readingApi();
  assert.equal(typeof createPdfReadingModel, "function");

  const reader = createPdfReadingModel({
    pages: [
      { text: "Opening page context.", locator: "page:1" },
      {
        text: "Steady context before anchors survive every zoom change after steady context.",
        locator: "page:2",
      },
    ],
  });
  const anchor = createAnchor({
    blockTexts: reader.blockTexts,
    blockIndex: 1,
    tokenStart: 3,
    tokenEnd: 7,
    docDigest: `sha256:${"a".repeat(64)}`,
  });
  const storedAddress = structuredClone(anchor);

  assert.equal(resolveAnchor(anchor, { blockTexts: reader.blockTexts }).arrival, "exact");
  reader.setZoom(1.25);

  assert.equal(reader.zoom, 1.25);
  assert.deepEqual(anchor, storedAddress, "zoom must not rewrite the durable text address");
  assert.deepEqual(resolveAnchor(anchor, { blockTexts: reader.blockTexts }), {
    arrival: "exact",
    blockIndex: 1,
    tokenStart: 3,
    tokenEnd: 7,
    quotedText: "anchors survive every zoom change",
  });
});

test("PDF search navigates every hit forward and backward with a visible count", async () => {
  const { createPdfReadingModel } = await readingApi();
  const reader = createPdfReadingModel({
    pages: [
      { text: "alpha target beta target", locator: "page:1" },
      { text: "gamma TARGET delta", locator: "page:2" },
    ],
  });

  assert.deepEqual(reader.setSearchQuery("target"), {
    query: "target",
    total: 3,
    activeIndex: 0,
    countLabel: "1 of 3",
    message: "",
    hit: { blockIndex: 0, charStart: 6, charEnd: 12 },
  });
  assert.equal(reader.nextSearchHit().countLabel, "2 of 3");
  assert.deepEqual(reader.nextSearchHit().hit, { blockIndex: 1, charStart: 6, charEnd: 12 });
  assert.equal(reader.nextSearchHit().countLabel, "1 of 3", "next wraps to the first hit");
  assert.equal(reader.previousSearchHit().countLabel, "3 of 3", "previous wraps to the last hit");
});

test("PDF search reports no matches instead of leaving an empty result", async () => {
  const { createPdfReadingModel } = await readingApi();
  const reader = createPdfReadingModel({
    pages: [{ text: "only words on this page", locator: "page:1" }],
  });

  assert.deepEqual(reader.setSearchQuery("absent"), {
    query: "absent",
    total: 0,
    activeIndex: -1,
    countLabel: "0 matches",
    message: "no matches",
    hit: null,
  });
  assert.equal(reader.nextSearchHit().message, "no matches");
  assert.equal(reader.previousSearchHit().message, "no matches");
});

test("PDF geometry is normalized to the page for zoom-independent audit evidence", async () => {
  const { normalizePdfGeometry } = await readingApi();
  assert.deepEqual(
    normalizePdfGeometry(
      { left: 150, top: 260, width: 300, height: 40 },
      { left: 50, top: 60, width: 800, height: 1000 },
      4,
    ),
    { page: 4, x: 0.125, y: 0.2, width: 0.375, height: 0.04 },
  );
});

test("PDF text spans map to stable page offsets without becoming the address", async () => {
  const { mapPdfTextItems } = await readingApi();
  assert.deepEqual(
    mapPdfTextItems(
      ["repeat", "target phrase", "repeat"],
      "repeat target phrase repeat",
    ),
    [
      { text: "repeat", charStart: 0, charEnd: 6 },
      { text: "target phrase", charStart: 7, charEnd: 20 },
      { text: "repeat", charStart: 21, charEnd: 27 },
    ],
  );
});

test("split PDF text spans retain sequential offsets after an inline highlight", async () => {
  const { mapStableTextSegments } = await highlightApi();
  assert.equal(typeof mapStableTextSegments, "function");
  assert.deepEqual(
    mapStableTextSegments(
      ["alpha ", "target", " phrase", " then ", "second", " target"],
      "alpha target phrase then second target",
    ),
    [
      { text: "alpha ", charStart: 0, charEnd: 6 },
      { text: "target", charStart: 6, charEnd: 12 },
      { text: " phrase", charStart: 12, charEnd: 19 },
      { text: " then ", charStart: 19, charEnd: 25 },
      { text: "second", charStart: 25, charEnd: 31 },
      { text: " target", charStart: 31, charEnd: 38 },
    ],
  );
});

test("PDF search reports source offsets when Unicode case folding changes length", async () => {
  const { createPdfReadingModel } = await readingApi();
  const reader = createPdfReadingModel({
    pages: [{ text: "AİB", locator: "page:1" }],
  });

  assert.deepEqual(reader.setSearchQuery("b").hit, {
    blockIndex: 0,
    charStart: 2,
    charEnd: 3,
  });
});

test("PDF text-layer scale includes the document user unit", async () => {
  const { pdfScaleVariables } = await readingApi();
  assert.deepEqual(pdfScaleVariables({ userUnit: 2 }, 1.25), {
    scaleFactor: 1.25,
    userUnit: 2,
    totalScaleFactor: 2.5,
  });
});
