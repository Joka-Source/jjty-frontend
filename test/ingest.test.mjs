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
  assert.deepEqual(r.sourceBytes, bytes, "rendering bytes must remain available after text extraction");
  assert.deepEqual(
    r.blocks.map((b) => b.locator),
    ["page:1", "page:2"]
  );
  assert.deepEqual(r.blocks.map((b) => b.kind), ["page", "page"]);
  assert.ok(r.warnings.some((w) => w.includes("page 3")));
  assert.equal(shortDigest(r.provenance.contentDigest).length, 10);
});

test("pdf ingestion preserves the selected engine report and gives the adapter an owned copy", async () => {
  const bytes = new TextEncoder().encode("%PDF adapter source");
  const originalFirstByte = bytes[0];
  const report = {
    contractVersion: 1,
    targetEngine: "mupdf",
    activeEngine: "mupdf",
    activeLineage: "mupdf-test-provider@1",
    state: "selected",
  };
  const engine = {
    report,
    async open(ownedSource) {
      ownedSource[0] = 0;
      const document = {
        numPages: 1,
        getMetadata: async () => ({ info: {} }),
        getPage: async () => ({
          getTextContent: async () => ({ items: [{ str: "MuPDF page", hasEOL: false }] }),
        }),
      };
      return { document, report };
    },
  };

  const result = await ingestPdfBrowser(engine, bytes, { name: "adapter.pdf" });

  assert.deepEqual(result.pdfEngine, report);
  assert.equal(result.blocks[0].text, "MuPDF page");
  assert.equal(bytes[0], originalFirstByte);
  assert.equal(result.sourceBytes[0], originalFirstByte);
});

test("primary-required ingestion preserves source provenance while refusing an unavailable MuPDF engine", async () => {
  const bytes = new TextEncoder().encode("%PDF primary required");
  let parserTouched = false;
  const result = await ingestPdfBrowser(
    { getDocument: () => { parserTouched = true; } },
    bytes,
    { name: "primary.pdf", requirePrimary: true },
  );

  assert.equal(parserTouched, false);
  assert.deepEqual(result.refusal, {
    kind: "engine-unavailable",
    message: "this PDF requires MuPDF, but the licensed engine is not available on this device.",
  });
  assert.equal(result.provenance.name, "primary.pdf");
  assert.match(result.provenance.contentDigest, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(result.sourceBytes, bytes);
  assert.equal(result.pdfEngine.activeEngine, "pdfjs");
});

test("encrypted PDF ingestion refuses explicitly and preserves provenance", async () => {
  const loadingTask = {
    promise: Promise.reject(Object.assign(new Error("No password given"), { name: "PasswordException" })),
    destroy: async () => {},
  };
  const bytes = new TextEncoder().encode("%PDF encrypted bytes");
  const result = await ingestPdfBrowser(
    { getDocument: () => loadingTask },
    bytes,
    { name: "locked.pdf" },
  );

  assert.deepEqual(result.refusal, {
    kind: "encrypted",
    message:
      "this PDF is encrypted. enter its password in another reader, then save an unlocked copy for jt.",
  });
  assert.equal(result.blocks.length, 0);
  assert.equal(result.provenance.sourceKind, "pdf");
  assert.match(result.provenance.contentDigest, /^sha256:[0-9a-f]{64}$/);
});

test("image-only PDF ingestion says there is no text layer", async () => {
  const loadingTask = {
    promise: Promise.resolve({
      numPages: 2,
      getMetadata: async () => ({ info: {} }),
      getPage: async () => ({ getTextContent: async () => ({ items: [] }) }),
    }),
    destroy: async () => {},
  };
  const result = await ingestPdfBrowser(
    { getDocument: () => loadingTask },
    new TextEncoder().encode("%PDF image-only bytes"),
    { name: "scan.pdf" },
  );

  assert.deepEqual(result.refusal, {
    kind: "image-only",
    message:
      "this PDF has no text layer. its pages can still be viewed, but jt cannot anchor acts to the image.",
  });
  assert.equal(result.blocks.length, 0);
  assert.equal(result.provenance.pageCount, 2);
  assert.deepEqual(
    result.sourceBytes,
    new TextEncoder().encode("%PDF image-only bytes"),
    "image-only pages must remain viewable",
  );
});

test("corrupt PDF ingestion refuses explicitly", async () => {
  const loadingTask = {
    promise: Promise.reject(Object.assign(new Error("Invalid PDF structure"), { name: "InvalidPDFException" })),
    destroy: async () => {},
  };
  const result = await ingestPdfBrowser(
    { getDocument: () => loadingTask },
    new TextEncoder().encode("not a pdf"),
    { name: "broken.pdf" },
  );

  assert.deepEqual(result.refusal, {
    kind: "corrupt",
    message:
      "this PDF is corrupt or not a valid PDF. try the original file or download it again.",
  });
  assert.equal(result.blocks.length, 0);
});

test("PDF ingestion does not call all-page read failures image-only", async () => {
  const loadingTask = {
    promise: Promise.resolve({
      numPages: 2,
      getMetadata: async () => ({ info: {} }),
      getPage: async (pageNumber) => {
        throw new Error(`broken page ${pageNumber}`);
      },
    }),
    destroy: async () => {},
  };
  const result = await ingestPdfBrowser(
    { getDocument: () => loadingTask },
    new TextEncoder().encode("%PDF broken pages"),
    { name: "unreadable.pdf" },
  );

  assert.deepEqual(result.refusal, {
    kind: "corrupt",
    message: "this PDF is corrupt or not a valid PDF. try the original file or download it again.",
  });
  assert.equal(result.blocks.length, 0);
  assert.ok(result.warnings.some((warning) => warning.includes("page 1 could not be read")));
  assert.ok(result.warnings.some((warning) => warning.includes("page 2 could not be read")));
});
