const PDFJS_MIGRATION_REPORT = Object.freeze({
  contractVersion: 1,
  targetEngine: "mupdf",
  activeEngine: "pdfjs",
  activeLineage: "pdfjs-dist@6.2.108",
  state: "migration",
});

const MUPDF_REPORT = Object.freeze({
  contractVersion: 1,
  targetEngine: "mupdf",
  activeEngine: "mupdf",
  activeLineage: "mupdf@1.28.0",
  state: "selected",
  license: "AGPL-3.0-or-later",
});

function ownedBytes(source) {
  return source instanceof Uint8Array
    ? source.slice()
    : new Uint8Array(source).slice();
}

function primaryUnavailable() {
  const error = new Error("MUPDF_PRIMARY_UNAVAILABLE");
  error.code = "MUPDF_PRIMARY_UNAVAILABLE";
  return error;
}

function passwordRequired() {
  const error = new Error("This PDF needs a password");
  error.name = "PasswordException";
  return error;
}

function lineItemsFromStructuredText(structuredJson, pageBounds) {
  const [, pageTop, , pageBottom] = pageBounds;
  const pageHeight = pageBottom - pageTop;
  const items = [];
  const styles = Object.create(null);
  let fontIndex = 0;
  for (const block of structuredJson?.blocks ?? []) {
    if (block?.type !== "text") continue;
    for (const line of block.lines ?? []) {
      const text = String(line?.text ?? "");
      if (!text) continue;
      const font = line.font ?? {};
      const fontName = `mupdf-font-${fontIndex++}`;
      const fontSize = Number(font.size) || Number(line?.bbox?.h) || 1;
      const x = Number(line.x) || Number(line?.bbox?.x) || 0;
      const baselineFromTop = Number(line.y) || 0;
      styles[fontName] = {
        fontFamily: font.family || "sans-serif",
        ascent: 0.8,
        descent: -0.2,
        vertical: Number(line.wmode) === 1,
      };
      items.push({
        str: text,
        dir: "ltr",
        transform: [fontSize, 0, 0, fontSize, x, pageHeight - baselineFromTop],
        width: Number(line?.bbox?.w) || 0,
        height: Number(line?.bbox?.h) || fontSize,
        fontName,
        hasEOL: true,
      });
    }
  }
  return { items, styles };
}

function copyPixmapToCanvas(pixmap, canvasContext) {
  const width = pixmap.getWidth();
  const height = pixmap.getHeight();
  const components = pixmap.getNumberOfComponents();
  const stride = pixmap.getStride();
  const pixels = pixmap.getPixels();
  const imageData = canvasContext.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const source = y * stride + x * components;
      const target = (y * width + x) * 4;
      imageData.data[target] = pixels[source];
      imageData.data[target + 1] = pixels[source + 1];
      imageData.data[target + 2] = pixels[source + 2];
      imageData.data[target + 3] = components > 3 ? pixels[source + 3] : 255;
    }
  }
  canvasContext.putImageData(imageData, 0, 0);
}

function createMuPdfPage(mupdf, nativePage) {
  let destroyed = false, annotationSnapshot = null, annotationReadError = null;
  const bounds = nativePage.getBounds();
  const viewBox = [...bounds];
  function activePage() {
    if (destroyed) throw new Error("MUPDF_PAGE_CLOSED");
    return nativePage;
  }
  return Object.freeze({
    getViewport({ scale = 1 } = {}) {
      const pageScale = Number(scale) || 1;
      const pageWidth = viewBox[2] - viewBox[0];
      const pageHeight = viewBox[3] - viewBox[1];
      return {
        viewBox: [...viewBox],
        userUnit: 1,
        scale: pageScale,
        rotation: 0,
        offsetX: 0,
        offsetY: 0,
        transform: [
          pageScale,
          0,
          0,
          -pageScale,
          -viewBox[0] * pageScale,
          viewBox[3] * pageScale,
        ],
        width: pageWidth * pageScale,
        height: pageHeight * pageScale,
        rawDims: {
          pageWidth,
          pageHeight,
          pageX: viewBox[0],
          pageY: viewBox[1],
        },
      };
    },
    render({ canvasContext, viewport, transform }) {
      return {
        promise: Promise.resolve().then(() => {
          const outputScaleX = Math.abs(Number(transform?.[0])) || 1;
          const outputScaleY = Math.abs(Number(transform?.[3])) || 1;
          const matrix = mupdf.Matrix.scale(
            viewport.scale * outputScaleX,
            viewport.scale * outputScaleY,
          );
          const pixmap = activePage().toPixmap(
            matrix,
            mupdf.ColorSpace.DeviceRGB,
            false,
            true,
          );
          try {
            copyPixmapToCanvas(pixmap, canvasContext);
          } finally {
            pixmap.destroy();
          }
        }),
      };
    },
    async getTextContent() {
      const structuredText = activePage().toStructuredText("preserve-whitespace");
      try {
        const nativeText = structuredText.asText();
        const structuredJson = JSON.parse(structuredText.asJSON());
        return {
          ...lineItemsFromStructuredText(structuredJson, viewBox),
          nativeText,
        };
      } finally {
        structuredText.destroy();
      }
    },
    async getAnnotations() {
      const page = activePage();
      if (annotationReadError) throw annotationReadError;
      if (annotationSnapshot === null) {
        const annotations = page.getAnnotations();
        try {
          annotationSnapshot = annotations.map((annotation, index) => ({
            id: annotation.getName() || `annotation:${index}`,
            type: annotation.getType(),
            contents: annotation.getContents(),
            rect: [...annotation.getBounds()],
          }));
        } catch (error) {
          annotationReadError = error;
          throw error;
        } finally {
          // MuPDF caches these wrappers on the native page. Keep only plain
          // data, so repeated reads neither reuse freed wrappers nor leak them.
          for (const annotation of annotations) annotation.destroy();
        }
      }
      return annotationSnapshot.map(annotation => ({ ...annotation, rect: [...annotation.rect] }));
    },
    cleanup() {
      if (destroyed) return;
      destroyed = true;
      annotationSnapshot = null;
      nativePage.destroy();
    },
  });
}

export function createMuPdfProvider(mupdf) {
  if (
    typeof mupdf?.Document?.openDocument !== "function"
    || typeof mupdf?.Matrix?.scale !== "function"
    || !mupdf?.ColorSpace?.DeviceRGB
  ) {
    throw new TypeError("MUPDF_MODULE_INVALID");
  }
  return Object.freeze({
    report: MUPDF_REPORT,
    async open(source) {
      let nativeDocument;
      try {
        nativeDocument = mupdf.Document.openDocument(ownedBytes(source), "application/pdf");
        nativeDocument.disableJS?.();
        if (nativeDocument.needsPassword()) throw passwordRequired();
        const document = Object.freeze({
          numPages: nativeDocument.countPages(),
          async getMetadata() {
            const title = nativeDocument.getMetaData("info:Title");
            return { info: title ? { Title: title } : {} };
          },
          async getPage(pageNumber) {
            if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > this.numPages) {
              throw new RangeError("MUPDF_PAGE_OUT_OF_RANGE");
            }
            return createMuPdfPage(mupdf, nativeDocument.loadPage(pageNumber - 1));
          },
        });
        let destroyed = false;
        const loadingTask = Object.freeze({
          async destroy() {
            if (destroyed) return;
            destroyed = true;
            nativeDocument.destroy();
          },
        });
        return { loadingTask, document, report: MUPDF_REPORT };
      } catch (error) {
        nativeDocument?.destroy?.();
        throw error;
      }
    },
  });
}

export function createPdfJsMigrationAdapter(pdfjs) {
  if (!pdfjs || typeof pdfjs.getDocument !== "function") {
    throw new TypeError("PDFJS_ADAPTER_INVALID");
  }
  return Object.freeze({
    report: PDFJS_MIGRATION_REPORT,
    async open(source) {
      const loadingTask = pdfjs.getDocument({ data: ownedBytes(source) });
      try {
        const document = await loadingTask.promise;
        return { loadingTask, document, report: PDFJS_MIGRATION_REPORT };
      } catch (error) {
        await loadingTask.destroy?.();
        throw error;
      }
    },
  });
}

function createMuPdfAdapter(mupdf) {
  if (
    !mupdf
    || typeof mupdf.open !== "function"
    || mupdf.report?.contractVersion !== 1
    || mupdf.report?.targetEngine !== "mupdf"
    || mupdf.report?.activeEngine !== "mupdf"
    || mupdf.report?.state !== "selected"
  ) {
    throw new TypeError("MUPDF_ADAPTER_REPORT_INVALID");
  }
  return Object.freeze({
    report: mupdf.report,
    async open(source) {
      const opened = await mupdf.open(ownedBytes(source));
      return { ...opened, report: mupdf.report };
    },
  });
}

export function selectPdfEngine({ pdfjs, mupdf, requirePrimary = false } = {}) {
  if (mupdf?.Document?.openDocument) return createMuPdfProvider(mupdf);
  if (mupdf) return createMuPdfAdapter(mupdf);
  if (requirePrimary) throw primaryUnavailable();
  return createPdfJsMigrationAdapter(pdfjs);
}

export async function selectAvailablePdfEngine({
  pdfjs,
  loadMuPdf = () => import("mupdf"),
  requirePrimary = false,
} = {}) {
  try {
    return selectPdfEngine({ pdfjs, mupdf: await loadMuPdf(), requirePrimary });
  } catch {
    return selectPdfEngine({ pdfjs, requirePrimary });
  }
}
