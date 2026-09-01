import assert from "node:assert/strict";
import test from "node:test";

import { selectPdfEngine } from "../src/pdf-engine.js";

const fakePdfJs = {
  getDocument: ({ data }) => ({
    promise: Promise.resolve({ sourceFirstByte: data[0] }),
    destroy: async () => {},
  }),
};

test("browser selection names PDF.js as migration instead of disguising it as MuPDF", async () => {
  const source = new TextEncoder().encode("%PDF fixture");
  const engine = selectPdfEngine({ pdfjs: fakePdfJs });
  const opened = await engine.open(source);

  assert.deepEqual(opened.report, {
    contractVersion: 1,
    targetEngine: "mupdf",
    activeEngine: "pdfjs",
    activeLineage: "pdfjs-dist@6.2.108",
    state: "migration",
  });
  assert.equal(opened.document.sourceFirstByte, source[0]);
});

test("an injected MuPDF adapter is selected and receives an owned source copy", async () => {
  const source = new TextEncoder().encode("%PDF source");
  const originalFirstByte = source[0];
  const report = {
    contractVersion: 1,
    targetEngine: "mupdf",
    activeEngine: "mupdf",
    activeLineage: "mupdf-test-provider@1",
    state: "selected",
  };
  const mupdf = {
    report,
    async open(ownedSource) {
      ownedSource[0] = 0;
      return { document: { pageCount: 1 } };
    },
  };

  const opened = await selectPdfEngine({ pdfjs: fakePdfJs, mupdf }).open(source);

  assert.deepEqual(opened.report, report);
  assert.deepEqual(opened.document, { pageCount: 1 });
  assert.equal(source[0], originalFirstByte);
});

test("requiring MuPDF refuses explicitly when no licensed provider is available", () => {
  assert.throws(
    () => selectPdfEngine({ pdfjs: fakePdfJs, requirePrimary: true }),
    (error) => error instanceof Error
      && error.code === "MUPDF_PRIMARY_UNAVAILABLE"
      && error.message === "MUPDF_PRIMARY_UNAVAILABLE",
  );
});
