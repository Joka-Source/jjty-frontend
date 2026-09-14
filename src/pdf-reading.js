/** Actual rendering scale, shared by PDF canvas and selectable text. */
export function fitPdfScale(availableWidth, pageWidths) {
  const widths = pageWidths.filter(width => Number.isFinite(width) && width > 0);
  if (!Number.isFinite(availableWidth) || availableWidth <= 0 || !widths.length) return null;
  return Math.max(0.05, Math.min(2.5, availableWidth / Math.max(...widths)));
}

const MIN_ZOOM = 0.75;
const MAX_ZOOM = 2.5;

function clampZoom(value, minZoom = MIN_ZOOM) {
  const zoom = Number(value);
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(MAX_ZOOM, Math.max(minZoom, zoom));
}

export function normalizePdfGeometry(rect, pageRect, page) {
  if (!rect || !pageRect || pageRect.width <= 0 || pageRect.height <= 0) return null;
  return {
    page,
    x: (rect.left - pageRect.left) / pageRect.width,
    y: (rect.top - pageRect.top) / pageRect.height,
    width: rect.width / pageRect.width,
    height: rect.height / pageRect.height,
  };
}

export function mapPdfTextItems(itemStrings, stableText) {
  const text = String(stableText ?? "");
  let from = 0;
  return (itemStrings ?? []).map((raw) => {
    const itemText = String(raw ?? "");
    const found = text.indexOf(itemText, from);
    const charStart = found >= 0 ? found : from;
    const charEnd = charStart + itemText.length;
    from = charEnd;
    return { text: itemText, charStart, charEnd };
  });
}

export function pdfScaleVariables(viewport, scale) {
  const userUnit = Number(viewport?.userUnit) || 1;
  const scaleFactor = Number(scale) || 1;
  return {
    scaleFactor,
    userUnit,
    totalScaleFactor: scaleFactor * userUnit,
  };
}

function annotateTextItems(textLayer, stableText) {
  const mapped = mapPdfTextItems(textLayer.textContentItemsStr, stableText);
  for (const [index, div] of textLayer.textDivs.entries()) {
    const item = mapped[index];
    if (!item) continue;
    div.dataset.pdfCharStart = String(item.charStart);
    div.dataset.pdfCharEnd = String(item.charEnd);
  }
}

/** Render provider-backed PDF canvases with PDF.js selectable text overlays. */
export async function renderPdfPages({
  pdfjs,
  pdfDocument,
  container,
  pages,
  scale,
  onBlockClick,
}) {
  const fragment = document.createDocumentFragment();
  const blocks = [];
  const pageDefs = new Map();
  for (const [blockIndex, page] of pages.entries()) {
    const pageNumber = Number(String(page.locator ?? "").replace(/^page:/, ""));
    if (Number.isInteger(pageNumber) && pageNumber > 0) {
      pageDefs.set(pageNumber, { ...page, blockIndex });
    }
  }

  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber++) {
    const pdfPage = await pdfDocument.getPage(pageNumber);
    try {
      const viewport = pdfPage.getViewport({ scale });
      const page = document.createElement("section");
      page.className = "pdf-page";
      page.dataset.page = String(pageNumber);
      page.setAttribute("aria-label", `page ${pageNumber}`);
      page.style.setProperty("--pdf-page-width", `${viewport.width}px`);
      page.style.setProperty("--pdf-page-height", `${viewport.height}px`);
      const scaleVariables = pdfScaleVariables(viewport, scale);
      page.style.setProperty("--scale-factor", String(scaleVariables.scaleFactor));
      page.style.setProperty("--user-unit", String(scaleVariables.userUnit));
      page.style.setProperty("--total-scale-factor", String(scaleVariables.totalScaleFactor));
      page.style.setProperty("--scale-round-x", "1px");
      page.style.setProperty("--scale-round-y", "1px");

      const canvas = document.createElement("canvas");
      canvas.className = "pdf-canvas";
      canvas.setAttribute("aria-hidden", "true");
      const outputScale = globalThis.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
      canvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      page.appendChild(canvas);

      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("PDF canvas is unavailable");
      const transform = outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0];
      await pdfPage.render({ canvasContext: context, viewport, transform }).promise;

      const content = await pdfPage.getTextContent({
        includeMarkedContent: true,
        disableNormalization: true,
      });
      const textContainer = document.createElement("div");
      textContainer.className = "textLayer pdf-text-layer";
      const def = pageDefs.get(pageNumber);
      if (def) {
        textContainer.dataset.block = String(def.blockIndex);
        textContainer.dataset.blockText = def.text;
      }
      page.appendChild(textContainer);
      const textLayer = new pdfjs.TextLayer({
        textContentSource: content,
        container: textContainer,
        viewport,
      });
      await textLayer.render();
      if (def) {
        annotateTextItems(textLayer, def.text);
        textContainer.addEventListener("click", () => onBlockClick?.(def.blockIndex));
        blocks[def.blockIndex] = textContainer;
      }
      const end = document.createElement("div");
      end.className = "endOfContent";
      textContainer.appendChild(end);
      fragment.appendChild(page);
    } finally {
      await pdfPage.cleanup?.();
    }
  }

  container.appendChild(fragment);
  return blocks;
}

/**
 * Stable text state for one PDF. Page text is captured once at ingestion;
 * visual scale changes never rewrite the quote/context address space.
 */
export function createPdfReadingModel({ pages, zoom = 1, minZoom = MIN_ZOOM }) {
  const stablePages = Object.freeze(
    (pages ?? []).map((page, index) =>
      Object.freeze({
        text: String(page?.text ?? ""),
        locator: page?.locator ?? `page:${index + 1}`,
      }),
    ),
  );
  const blockTexts = Object.freeze(stablePages.map((page) => page.text));
  let currentZoom = clampZoom(zoom, minZoom);
  let query = "";
  let hits = [];
  let activeIndex = -1;

  function searchSnapshot() {
    const total = hits.length;
    return {
      query,
      total,
      activeIndex,
      countLabel: total ? `${activeIndex + 1} of ${total}` : "0 matches",
      message: query && !total ? "no matches" : "",
      hit: activeIndex >= 0 ? { ...hits[activeIndex] } : null,
    };
  }

  function moveSearchHit(delta) {
    if (hits.length) activeIndex = (activeIndex + delta + hits.length) % hits.length;
    return searchSnapshot();
  }

  return {
    pages: stablePages,
    blockTexts,
    get zoom() {
      return currentZoom;
    },
    setZoom(nextZoom) {
      currentZoom = clampZoom(nextZoom, minZoom);
      return currentZoom;
    },
    setSearchQuery(nextQuery) {
      query = String(nextQuery ?? "").trim();
      hits = [];
      activeIndex = -1;
      if (query) {
        const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const pattern = new RegExp(escaped, "giu");
        for (const [blockIndex, text] of blockTexts.entries()) {
          for (const match of text.matchAll(pattern)) {
            hits.push({
              blockIndex,
              charStart: match.index,
              charEnd: match.index + match[0].length,
            });
          }
        }
        if (hits.length) activeIndex = 0;
      }
      return searchSnapshot();
    },
    nextSearchHit() {
      return moveSearchHit(1);
    },
    previousSearchHit() {
      return moveSearchHit(-1);
    },
    searchState() {
      return searchSnapshot();
    },
  };
}
