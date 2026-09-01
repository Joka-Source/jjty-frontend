const PDFJS_MIGRATION_REPORT = Object.freeze({
  contractVersion: 1,
  targetEngine: "mupdf",
  activeEngine: "pdfjs",
  activeLineage: "pdfjs-dist@6.2.108",
  state: "migration",
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
  if (mupdf) return createMuPdfAdapter(mupdf);
  if (requirePrimary) throw primaryUnavailable();
  return createPdfJsMigrationAdapter(pdfjs);
}
