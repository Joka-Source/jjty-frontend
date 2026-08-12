// jt-connectors integration: text/paste ingestion through the vendored
// isomorphic connectors (blocks + non-optional provenance), and the pure
// PDF page-text helper that the browser PDF path shares with the node
// connector's algorithm.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  ingestText,
  ingestPaste,
  pageTextFromItems,
  ingestPdfBrowser,
  shortDigest,
} from "../src/ingest.js";

const SAMPLE = "a title line\n\nfirst paragraph of the body.\n\nsecond paragraph, longer, with detail.";

test("text ingestion returns blocks with provenance (digest + byte size)", async () => {
  const r = await ingestText(SAMPLE, { name: "sample.txt" });
  assert.ok(r.blocks.length >= 3, `expected 3+ blocks, got ${r.blocks.length}`);
  assert.equal(r.blocks[0].index, 0);
  const expected = createHash("sha256").update(SAMPLE, "utf8").digest("hex");
  assert.equal(r.provenance.contentDigest, `sha256:${expected}`);
  assert.equal(r.provenance.byteSize, Buffer.byteLength(SAMPLE, "utf8"));
  assert.equal(r.provenance.name, "sample.txt");
  assert.ok(r.provenance.capturedAt.endsWith("Z"));
});

test("paste ingestion carries provenance too", async () => {
  const r = await ingestPaste({ text: "pasted words\n\nmore pasted words" });
  assert.equal(r.provenance.sourceKind, "paste");
  assert.ok(r.provenance.contentDigest.startsWith("sha256:"));
  assert.ok(r.blocks.length >= 2);
});

test("pdf page text assembly matches the node connector's algorithm", () => {
  const items = [
    { str: "The deposit", hasEOL: false },
    { str: "is one months rent,", hasEOL: true },
    { str: "held  in a protected account.", hasEOL: false },
    { notText: true },
  ];
  const text = pageTextFromItems(items);
  assert.equal(text, "The deposit is one months rent,\nheld in a protected account.");
});

test("pdf ingestion: per-page blocks, page locators, provenance from raw bytes", async () => {
  // Stub pdfjs with the same interface the browser build exposes; the point
  // here is jt-web's assembly: page loop, locators, warnings, provenance.
  const pages = {
    1: [{ str: "page one text", hasEOL: false }],
    2: [{ str: "page two text", hasEOL: false }],
    3: [], // no extractable text -> warning
  };
  const fakePdfjs = {
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: 3,
        getMetadata: async () => ({ info: { Title: "A Test Paper" } }),
        getPage: async (n) => ({ getTextContent: async () => ({ items: pages[n] }) }),
      }),
      destroy: async () => {},
    }),
  };
  const bytes = new TextEncoder().encode("%PDF-1.4 fake body bytes");
  const r = await ingestPdfBrowser(fakePdfjs, bytes, { name: "paper.pdf" });
  assert.equal(r.provenance.sourceKind, "pdf");
  assert.equal(r.provenance.pageCount, 3);
  assert.equal(r.provenance.title, "A Test Paper");
  assert.equal(r.provenance.name, "paper.pdf");
  const expected = createHash("sha256").update(bytes).digest("hex");
  assert.equal(r.provenance.contentDigest, `sha256:${expected}`);
  assert.equal(r.provenance.byteSize, bytes.byteLength);
  assert.deepEqual(
    r.blocks.map((b) => b.locator),
    ["page:1", "page:2"]
  );
  assert.deepEqual(r.blocks.map((b) => b.kind), ["page", "page"]);
  assert.ok(r.warnings.some((w) => w.includes("page 3")));
  assert.equal(shortDigest(r.provenance.contentDigest).length, 10);
});
