import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import * as pdfEngine from "../src/pdf-engine.js";

const { selectPdfEngine } = pdfEngine;

const realPdfFixture = new URL(
  "../packages/jt-connectors/test/fixtures/sample.pdf",
  import.meta.url,
);

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

test("the official MuPDF provider extracts native text and metadata from a real PDF", async () => {
  const { createMuPdfProvider } = pdfEngine;
  assert.equal(typeof createMuPdfProvider, "function");
  const mupdf = await import("mupdf");
  const source = new Uint8Array(await readFile(realPdfFixture));
  const opened = await createMuPdfProvider(mupdf).open(source);

  try {
    assert.deepEqual(opened.report, {
      contractVersion: 1,
      targetEngine: "mupdf",
      activeEngine: "mupdf",
      activeLineage: "mupdf@1.28.0",
      state: "selected",
      license: "AGPL-3.0-or-later",
    });
    assert.equal(opened.document.numPages, 2);
    assert.deepEqual(await opened.document.getMetadata(), {
      info: { Title: "jt fixture: two page sample" },
    });

    const firstPage = await opened.document.getPage(1);
    try {
      const content = await firstPage.getTextContent();
      assert.match(content.nativeText, /first page of the jt fixture/);
      assert.ok(content.items.length > 0, "native text must also supply selectable page items");
    } finally {
      firstPage.cleanup();
    }
  } finally {
    await opened.loadingTask.destroy();
  }
});

test("the official MuPDF provider renders real page pixels at the selected scale", async () => {
  const { createMuPdfProvider } = pdfEngine;
  assert.equal(typeof createMuPdfProvider, "function");
  const mupdf = await import("mupdf");
  const source = new Uint8Array(await readFile(realPdfFixture));
  const opened = await createMuPdfProvider(mupdf).open(source);
  const firstPage = await opened.document.getPage(1);
  const viewport = firstPage.getViewport({ scale: 1 });
  let rendered;
  const canvasContext = {
    createImageData(width, height) {
      return { width, height, data: new Uint8ClampedArray(width * height * 4) };
    },
    putImageData(imageData, x, y) {
      rendered = { imageData, x, y };
    },
  };

  try {
    await firstPage.render({ canvasContext, viewport, transform: null }).promise;
    assert.equal(viewport.width, 612);
    assert.equal(viewport.height, 792);
    assert.equal(rendered.imageData.width, 612);
    assert.equal(rendered.imageData.height, 792);
    assert.deepEqual([rendered.x, rendered.y], [0, 0]);
    assert.ok(
      rendered.imageData.data.some((channel) => channel < 255),
      "the rendered page must contain non-white document pixels",
    );
  } finally {
    firstPage.cleanup();
    await opened.loadingTask.destroy();
  }
});

test("requiring MuPDF refuses explicitly when no licensed provider is available", () => {
  assert.throws(
    () => selectPdfEngine({ pdfjs: fakePdfJs, requirePrimary: true }),
    (error) => error instanceof Error
      && error.code === "MUPDF_PRIMARY_UNAVAILABLE"
      && error.message === "MUPDF_PRIMARY_UNAVAILABLE",
  );
});

test("browser loading falls back honestly when the MuPDF module is unavailable", async () => {
  const { selectAvailablePdfEngine } = pdfEngine;
  assert.equal(typeof selectAvailablePdfEngine, "function");

  const engine = await selectAvailablePdfEngine({
    pdfjs: fakePdfJs,
    loadMuPdf: async () => { throw new Error("module unavailable"); },
  });

  assert.equal(engine.report.activeEngine, "pdfjs");
  assert.equal(engine.report.state, "migration");
});

test("browser loading keeps primary-required PDFs unsupported without MuPDF", async () => {
  const { selectAvailablePdfEngine } = pdfEngine;
  assert.equal(typeof selectAvailablePdfEngine, "function");

  await assert.rejects(
    selectAvailablePdfEngine({
      pdfjs: fakePdfJs,
      loadMuPdf: async () => { throw new Error("module unavailable"); },
      requirePrimary: true,
    }),
    (error) => error?.code === "MUPDF_PRIMARY_UNAVAILABLE",
  );
});

test('MuPDF review reads exact saved annotation contents as plain data and owns returned arrays', async () => {
  const mupdf=await import('mupdf');
  const {ingestPdfBrowser}=await import('../src/ingest.js');
  const {createAnchor}=await import('../src/anchors.js');
  const {exportAnnotatedPdf}=await import('../src/pdf-annotations.js');
  const input=new Uint8Array(await readFile(new URL('./fixtures/jett-annotations.pdf',import.meta.url)));
  const source={id:'saved-note-review',...await ingestPdfBrowser(pdfEngine.createMuPdfProvider(mupdf),input,{name:'notes.pdf'})};
  const contents='<img src=x onerror="alert(1)">\nनमस्ते — résumé & <b>plain text</b>';
  const anchor=createAnchor({blockTexts:source.blocks.map(b=>b.text),blockIndex:0,tokenStart:7,tokenEnd:10,docDigest:source.provenance.contentDigest});
  const bytes=await exportAnnotatedPdf(source,[{id:'literal-note',docId:source.id,kind:'act',act:'note',arrival:'exact',blockIndex:0,anchor,noteText:contents}]);
  const opened=await pdfEngine.createMuPdfProvider(mupdf).open(bytes);
  const page=await opened.document.getPage(2);
  try{
    const annotations=await page.getAnnotations();assert.equal(annotations.length,1);
    assert.deepEqual({...annotations[0],rect:[]},{id:'jett:literal-note',type:'Text',contents,rect:[]});
    assert.equal(annotations[0].rect.length,4);assert.ok(annotations[0].rect.every(Number.isFinite));
    annotations[0].contents='caller edit';annotations[0].rect[0]=-999;
    const reread=await page.getAnnotations();assert.equal(reread[0].contents,contents);assert.notEqual(reread[0].rect[0],-999);
    assert.match((await page.getTextContent()).nativeText,/orchard/);
  }finally{page.cleanup();await opened.loadingTask.destroy();}
  await assert.rejects(page.getAnnotations(),/MUPDF_PAGE_CLOSED/);
});

test('MuPDF provider disables PDF JavaScript before exposing pages',async()=>{
  const mupdf=await import('mupdf'),original=mupdf.PDFDocument.prototype.disableJS;let disabled=0;
  mupdf.PDFDocument.prototype.disableJS=function(){disabled++;return original.call(this);};
  let opened;
  try{opened=await pdfEngine.createMuPdfProvider(mupdf).open(new Uint8Array(await readFile(realPdfFixture)));assert.equal(disabled,1);}
  finally{await opened?.loadingTask.destroy();mupdf.PDFDocument.prototype.disableJS=original;}
});
