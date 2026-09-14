import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { notebook } from "./model.js";
GlobalWorkerOptions.workerSrc = workerUrl;
export async function importPdf(file, onProgress = () => {}) {
  if (file.size > 20 * 1024 * 1024)
    throw Error("PDF import currently supports files up to 20 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const source = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(new Blob([bytes], { type: "application/pdf" }));
  });
  const task = getDocument({ data: bytes.slice(), isEvalSupported: false });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 100)
      throw Error("PDF import currently supports up to 100 pages.");
    const n = notebook(file.name.replace(/\.pdf$/i, ""), "blank", "#6889ac");
    n.source = { name: file.name, data: source };
    n.pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      onProgress(i, pdf.numPages);
      const p = await pdf.getPage(i),
        v = p.getViewport({ scale: 1 });
      const view = p.getViewport({
          scale: Math.min(1440 / v.width, 1920 / v.height),
        }),
        canvas = document.createElement("canvas");
      canvas.width = view.width;
      canvas.height = view.height;
      await p.render({ canvasContext: canvas.getContext("2d"), viewport: view })
        .promise;
      const text = await p.getTextContent();
      n.pages.push({
        id: crypto.randomUUID(),
        items: [],
        paper: "blank",
        background: canvas.toDataURL("image/jpeg", 0.88),
        sourceText: text.items.map((i) => i.str || "").join(" "),
      });
      canvas.width = 0;
      canvas.height = 0;
      p.cleanup();
    }
    return n;
  } finally {
    await task.destroy();
  }
}
