// jt — you open your document, you speak, and the thing you meant happens,
// with a record you can inspect and undo. One mic permission; after that,
// speaking is the interface.
//
// W2 fusion:
//   jt-speech     — every final segment goes through IntentStream (8 typed
//                   intents; ambiguity is asked about, never guessed).
//   jt-connectors — text/md/paste/pdf enter as blocks + provenance
//                   (sha-256 digest, byte size) stored and shown.
//   jt-water      — the marker glides and acts confirm with real physics.
//   jt-core wasm  — the matching engine behind the glide (default; parity
//                   with the JS reference proven in test/parity.test.mjs;
//                   ?engine=js opts out).
//   jt-sync       — "send this to <three words>" moves the moment (blocks +
//                   cursor + receipt + provenance) to a paired device.
//
// Sim path (?sim=1): a scripted transcript drives the exact same pipeline
// for micless testing; ?fast=1 compresses time. Results are exposed on
// window.__jt and serialized into a #jt-report DOM node for headless runs.

import "./style.css";
import "./jett.css";
import { ingestImage, mountImage } from "./images.js";
import "../vendor/katex/katex.min.css";
import "pdfjs-dist/web/pdf_viewer.css";
import katex from "../vendor/katex/katex.mjs";
import { tokenize, tokenizeWithSpans, matchTranscript, TARGET_POLICY } from "./match.js";
import { splitParagraphs, titleFrom, STARTER_DOC } from "./doc.js";
import { IntentStream, toCommand, describeCandidate } from "./intents.js";
import { createMatchEngine, blockForRange } from "./engine.js";
import { createMarkerDriver, confirmRipple, returnToPlace } from "./motion.js";
import { ingestText, ingestPaste, ingestPdfBrowser, shortDigest, fmtBytes } from "./ingest.js";
import { selectAvailablePdfEngine, selectPdfEngine } from "./pdf-engine.js";
import { codeFromSpoken, createSyncSurface, momentFromEntry } from "./sync.js";
import { createActEngine } from "./acts.js";
import { domRangeForCharacters, measureTokenRange } from "./highlight.js";
import {
  createPdfReadingModel,
  normalizePdfGeometry,
  renderPdfPages,
} from "./pdf-reading.js";
import { decideTarget } from "./targeting.js";
import {
  putDoc,
  getDoc,
  getDocs,
  getRecords,
  putRecord,
  putInbox,
  getInbox,
  putSpaceFeed,
  getSpaceFeed,
  putPosition,
  getPosition,
  getPositions,
} from "./db.js";
import { rid, nowIso, makeActEntry } from "./records.js";
import { loadSettings, MOTION_PARAMS } from "./settings.js";
import { medium } from "jt-water";
import { initShell } from "./shell.js";
import "./pwa.js";
import { initInstallUx } from "./install.js";
import {
  createPositionMemory,
  relativeReadTime,
  matchDocumentName,
} from "./position.js";
import {
  mathControl,
  translateSpokenMath,
  makeSpokenMathDocument,
} from "./math.js";
import {
  executeVerb as executeRegisteredVerb,
  historyTitleFor,
  verbRegistry,
} from "./registry/index.js";
import { emitGlass } from "./glass-tap.js";
import { mountGlassDevRoute } from "./glass-route.js";

const article = document.getElementById("doc");
const marker = document.getElementById("marker");
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const docList = document.getElementById("doc-list");
const historyList = document.getElementById("history-list");
const fileInput = document.getElementById("file-input");
const pasteBox = document.getElementById("paste-box");
const pasteAdd = document.getElementById("paste-add");
const askBox = document.getElementById("ask");
const askOptions = document.getElementById("ask-options");
const shareStart = document.getElementById("share-start");
const shareCode = document.getElementById("share-code");
const shareState = document.getElementById("share-state");
const joinCode = document.getElementById("join-code");
const joinBtn = document.getElementById("join-btn");
const inboxList = document.getElementById("inbox-list");
const tabLibrary = document.getElementById("tab-library");
const tabHistory = document.getElementById("tab-history");
const tabMore = document.getElementById("tab-more");
const sheetScrim = document.getElementById("sheet-scrim");
const voiceToggle = document.getElementById("voice-toggle");
const docHead = document.getElementById("doc-head");
const docTitle = document.getElementById("doc-title");
const docProvBtn = document.getElementById("doc-prov-btn");
const docProv = document.getElementById("doc-prov");
const readEmpty = document.getElementById("read-empty");
const micHint = document.getElementById("mic-hint");
const mathModeToggle = document.getElementById("math-mode-toggle");
const mathModeState = document.getElementById("math-mode-state");
const mathWorkbench = document.getElementById("math-workbench");
const mathSpoken = document.getElementById("math-spoken");
const mathRendered = document.getElementById("math-rendered");
const mathLatex = document.getElementById("math-latex");
const mathUnparsed = document.getElementById("math-unparsed");
const mathKeep = document.getElementById("math-keep");
const mathSession = document.getElementById("math-session");
const mathSessionList = document.getElementById("math-session-list");
const pdfTools = document.getElementById("pdf-tools");
const pdfZoomOut = document.getElementById("pdf-zoom-out");
const pdfZoomValue = document.getElementById("pdf-zoom-value");
const pdfZoomIn = document.getElementById("pdf-zoom-in");
const pdfSearchInput = document.getElementById("pdf-search-input");
const pdfSearchPrevious = document.getElementById("pdf-search-previous");
const pdfSearchNext = document.getElementById("pdf-search-next");
const pdfSearchCount = document.getElementById("pdf-search-count");
const pdfMessage = document.getElementById("pdf-message");

// ---------------------------------------------------------------------------
// Phone layout: on a narrow screen the two side panels become slide-over
// sheets, opened from the bottom bar. One sheet at a time; the scrim (or the
// same bar button) closes it. On wide screens the bar is display:none and
// none of this runs.

const narrowScreen = matchMedia("(max-width: 960px)");

function currentSheet() {
  if (document.body.classList.contains("sheet-library")) return "library";
  if (document.body.classList.contains("sheet-history")) return "history";
  if (document.body.classList.contains("sheet-more")) return "more";
  return null;
}

function setSheet(which) {
  document.body.classList.toggle("sheet-library", which === "library");
  document.body.classList.toggle("sheet-history", which === "history");
  document.body.classList.toggle("sheet-more", which === "more");
  tabLibrary.setAttribute("aria-expanded", String(which === "library"));
  tabHistory.setAttribute("aria-expanded", String(which === "history"));
  tabMore.setAttribute("aria-expanded", String(which === "more"));
}

/** The documents / what-happened buttons open sheets over the reading
 * surface; from any other surface they first bring the reading back. */
function sheetTab(which) {
  if (document.body.dataset.view !== "read") {
    shell?.show("read");
    setSheet(which);
    return;
  }
  setSheet(currentSheet() === which ? null : which);
}

tabLibrary.addEventListener("click", () => sheetTab("library"));
tabHistory.addEventListener("click", () => sheetTab("history"));
tabMore.addEventListener("click", () => setSheet(currentSheet() === "more" ? null : "more"));
sheetScrim.addEventListener("click", () => setSheet(null));

const params = new URLSearchParams(location.search);
const SIM = params.get("sim") === "1";
const settings = loadSettings();
initInstallUx();
// wasm is the default engine — parity with the JS reference matcher is
// proven by test/parity.test.mjs; ?engine=js (or the setting) opts back
// into the reference implementation.
const ENGINE_MODE = (params.get("engine") ?? settings.engine) === "js" ? "js" : "wasm";
const RELAY_URL = params.get("relay") || "ws://127.0.0.1:8787";

/** The motion setting picks the water: same physics, different medium. */
const motionParams = () => MOTION_PARAMS[settings.motion] ?? MOTION_PARAMS.usual;
const markerMedium = () => {
  const p = motionParams();
  return medium({ viscosity: 0.9, tension: p.tension, entry: p.entry, drag: 6 });
};

const state = {
  doc: null, // { id, title, text, blocks?, provenance?, createdAt, revision }
  blocks: [], // <p> elements
  blockTexts: [],
  docTokens: [],
  tokenBlock: [],
  tokenMeta: [],
  currentBlock: -1,
  lastMatch: null, // { score, blockIndex }
  lastReadingMatch: null, // frozen when a final segment is ordinary reading
  matcher: null, // js or wasm engine
  engineKind: "",
  pendingAsk: null, // { candidates, reason, evidence }
  pdf: null, // source document + stable text/search model + current visual scale
};

const mathState = {
  active: false,
  expression: null,
  kept: [],
};

const markerDriver = createMarkerDriver(marker, markerMedium);
const positionMemory = createPositionMemory({ save: putPosition, load: getPosition });
const intentStream = new IntentStream();
let shell = null; // the surface router (initShell) — set during boot

function setStatus(on, text) {
  statusDot.classList.toggle("on", on);
  statusText.textContent = text;
}

function blockCountOf(doc) {
  return doc?.blocks?.length || splitParagraphs(doc?.text ?? "").length;
}

function rememberPosition(blockIndex) {
  if (!state.doc) return;
  positionMemory.remember(state.doc, blockIndex, state.blocks.length);
  shell?.libraryChanged();
}

async function positionForDoc(doc) {
  return positionMemory.read(doc, blockCountOf(doc));
}

addEventListener("pagehide", () => void positionMemory.flushAll());
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") void positionMemory.flushAll();
});

// ---------------------------------------------------------------------------
// Rendering

async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  return pdfjs;
}

function pdfSourceBytes(sourceBytes) {
  if (sourceBytes instanceof Uint8Array) return sourceBytes.slice();
  if (Array.isArray(sourceBytes)) return new Uint8Array(sourceBytes);
  return new Uint8Array(Object.values(sourceBytes ?? {}));
}

function selectPdfBlock(blockIndex) {
  // A deliberate selection supersedes the previous spoken location.
  state.lastMatch = null;
  state.lastReadingMatch = null;
  state.matcher?.reset();
  state.currentBlock = blockIndex;
  moveMarker(blockIndex);
  rememberPosition(blockIndex);
}

async function createPdfSurface(doc, pages, container = article, scale = 1) {
  const pdfjs = await loadPdfJs();
  const model = createPdfReadingModel({ pages, zoom: scale });
  const pdfEngine = doc.pdfEngine?.activeEngine === "mupdf"
    ? await selectAvailablePdfEngine({ pdfjs })
    : selectPdfEngine({ pdfjs });
  const { loadingTask, document: pdfDocument, report } = await pdfEngine.open(
    pdfSourceBytes(doc.sourceBytes),
  );
  const blocks = await renderPdfPages({
    pdfjs,
    pdfDocument,
    container,
    pages: model.pages,
    scale: model.zoom,
    onBlockClick: selectPdfBlock,
  });
  return { pdfjs, model, loadingTask, pdfDocument, blocks, report };
}

function appendTextBlocks(blockDefs) {
  for (const [i, def] of blockDefs.entries()) {
    const heading = def.kind === "heading" && /^h[1-6]$/.test(def.locator ?? "") ? def.locator : "h2";
    const tag = def.kind === "heading" ? heading : def.kind === "code" ? "pre" : def.kind === "quote" ? "blockquote" : "p";
    const p = document.createElement(tag);
    p.classList.add("reading-block");
    p.dataset.kind = def.kind ?? "paragraph";
    p.textContent = def.text;
    p.dataset.block = String(i);
    if (def.locator?.startsWith("page:")) {
      p.dataset.page = def.locator.slice(5);
      p.classList.add("paged");
    }
    p.addEventListener("click", () => selectPdfBlock(i));
    article.appendChild(p);
    state.blocks.push(p);
    state.blockTexts.push(def.text);
  }
}

function resetPdfTools() {
  pdfTools.hidden = true;
  pdfSearchInput.value = "";
  pdfSearchCount.textContent = "";
  pdfMessage.textContent = "";
  pdfZoomOut.disabled = false;
  pdfZoomIn.disabled = false;
  pdfSearchPrevious.disabled = true;
  pdfSearchNext.disabled = true;
  article.classList.remove("pdf-document");
  globalThis.CSS?.highlights?.delete("jt-pdf-search");
}

let unmountImage = null;
async function renderDoc(doc) {
  unmountImage?.(); unmountImage = null;
  await state.pdf?.loadingTask?.destroy?.();
  for (const p of state.blocks) p.remove();
  for (const page of article.querySelectorAll(":scope > .pdf-page")) page.remove();
  resetPdfTools();
  article.classList.toggle("image-source", doc.provenance?.sourceKind === "image");
  Object.assign(state, {
    doc,
    blocks: [],
    blockTexts: [],
    docTokens: [],
    tokenBlock: [],
    tokenMeta: [],
    currentBlock: -1,
    lastMatch: null,
    lastReadingMatch: null,
    matcher: null,
    pdf: null,
  });
  marker.classList.remove("on");
  markerDriver.stop();

  const blockDefs = doc.blocks?.length
    ? doc.blocks
    : splitParagraphs(doc.text).map((text) => ({ text, kind: "paragraph" }));

  const hasPdfSource = doc.provenance?.sourceKind === "pdf" && doc.sourceBytes;
  if (doc.provenance?.sourceKind === "image" && doc.sourceBytes) {
    unmountImage = await mountImage(article, doc);
  } else if (hasPdfSource) {
    try {
      state.pdf = await createPdfSurface(doc, blockDefs);
      state.blocks = state.pdf.blocks;
      state.blockTexts = [...state.pdf.model.blockTexts];
      article.classList.add("pdf-document");
      pdfTools.hidden = false;
      pdfZoomValue.textContent = `${Math.round(state.pdf.model.zoom * 100)}%`;
      pdfZoomOut.disabled = state.pdf.model.zoom <= 0.75;
      pdfZoomIn.disabled = state.pdf.model.zoom >= 2.5;
      pdfMessage.textContent = doc.pdfEngine?.activeEngine
        && state.pdf.report.activeEngine !== doc.pdfEngine.activeEngine
        ? "MuPDF is unavailable here, so this PDF is being shown with PDF.js."
        : doc.refusal?.message ?? "";
    } catch (error) {
      appendTextBlocks(blockDefs);
      pdfMessage.textContent = "the PDF pages could not be rendered; the saved text is shown instead.";
      pdfTools.hidden = false;
      setStatus(true, `PDF rendering failed: ${error?.message ?? error}`);
    }
  } else {
    appendTextBlocks(blockDefs);
    if (doc.provenance?.sourceKind === "pdf") {
      setStatus(true, "the original PDF pages are unavailable; showing the saved text");
    }
  }

  for (const [i, text] of state.blockTexts.entries()) {
    for (const [tokenIndex, token] of tokenizeWithSpans(text).entries()) {
      state.docTokens.push(token.token);
      state.tokenBlock.push(i);
      state.tokenMeta.push({ blockIndex: i, tokenIndex });
    }
  }

  const { engine: m, kind, note } = await createMatchEngine(ENGINE_MODE, state.blockTexts);
  state.matcher = m;
  state.engineKind = kind;
  if (note) setStatus(true, note);
  if (window.__jt) window.__jt.engine = kind;
}

function targetForGlobalRange(start, end, preferredBlock = null) {
  const blockIndex = Number.isInteger(preferredBlock)
    ? preferredBlock
    : blockForRange(state.tokenBlock, start, end);
  const local = [];
  for (let i = start; i <= end; i++) {
    const meta = state.tokenMeta[i];
    if (meta?.blockIndex === blockIndex) local.push(meta.tokenIndex);
  }
  if (!local.length) return null;
  const tokenStart = Math.min(...local);
  const tokenEnd = Math.max(...local);
  const spans = tokenizeWithSpans(state.blockTexts[blockIndex] ?? "");
  const first = spans[tokenStart];
  const last = spans[tokenEnd];
  return {
    blockIndex,
    tokenStart,
    tokenEnd,
    quotedText: first && last
      ? state.blockTexts[blockIndex].slice(first.start, last.end)
      : "",
  };
}

function moveMarker(blockIdx, target = null) {
  const p = state.blocks[blockIdx];
  if (!p) return;
  const articleRect = article.getBoundingClientRect();
  const exact = target
    ? measureTokenRange(p, target.tokenStart, target.tokenEnd)
    : null;
  const rect = exact ?? p.getBoundingClientRect();
  marker.classList.add("on");
  markerDriver.moveTo({
    top: rect.top - articleRect.top - 4,
    left: rect.left - articleRect.left - 4,
    width: rect.width + 8,
    height: rect.height + 8,
  });
}

function anchorGeometryFor(blockIndex, tokenStart, tokenEnd) {
  const block = state.blocks[blockIndex];
  const page = block?.closest(".pdf-page");
  if (!page) return null;
  const rect = measureTokenRange(block, tokenStart, tokenEnd);
  if (!rect) return null;
  return normalizePdfGeometry(rect, page.getBoundingClientRect(), Number(page.dataset.page));
}

function clearPdfSearchPaint() {
  globalThis.CSS?.highlights?.delete("jt-pdf-search");
  for (const block of state.blocks) block?.classList.remove("pdf-search-fallback");
}

function paintPdfSearchHit(searchState, { scroll = true } = {}) {
  clearPdfSearchPaint();
  if (!searchState?.hit) return;
  const { blockIndex, charStart, charEnd } = searchState.hit;
  const block = state.blocks[blockIndex];
  if (!block) return;
  const range = domRangeForCharacters(block, charStart, charEnd);
  if (range && globalThis.CSS?.highlights && typeof globalThis.Highlight === "function") {
    globalThis.CSS.highlights.set("jt-pdf-search", new Highlight(range));
  } else {
    block.classList.add("pdf-search-fallback");
  }
  if (scroll) block.closest(".pdf-page")?.scrollIntoView({ behavior: "auto", block: "center" });
}

function showPdfSearchState(searchState, options) {
  const message = searchState.message ? ` · ${searchState.message}` : "";
  pdfSearchCount.textContent = `${searchState.countLabel}${message}`;
  pdfSearchPrevious.disabled = searchState.total === 0;
  pdfSearchNext.disabled = searchState.total === 0;
  paintPdfSearchHit(searchState, options);
}

function heldPdfBlockIndex() {
  const activeEntry = [...engine.entries]
    .reverse()
    .find((entry) => entry.kind === "act" && !entry.undone && entry.arrival !== "lost");
  return activeEntry?.blockIndex ?? state.pdf?.model.searchState().hit?.blockIndex ?? state.currentBlock;
}

async function setPdfZoom(nextZoom) {
  if (!state.pdf) return;
  const previousZoom = state.pdf.model.zoom;
  const zoom = state.pdf.model.setZoom(nextZoom);
  if (zoom === previousZoom) return;
  const heldIndex = heldPdfBlockIndex();
  const beforeTop = state.blocks[heldIndex]?.getBoundingClientRect().top ?? null;
  const staging = document.createElement("div");
  pdfZoomOut.disabled = true;
  pdfZoomIn.disabled = true;
  try {
    const blocks = await renderPdfPages({
      pdfjs: state.pdf.pdfjs,
      pdfDocument: state.pdf.pdfDocument,
      container: staging,
      pages: state.pdf.model.pages,
      scale: zoom,
      onBlockClick: selectPdfBlock,
    });
    markerDriver.stop();
    for (const page of article.querySelectorAll(":scope > .pdf-page")) page.remove();
    article.append(...staging.childNodes);
    state.blocks = blocks;
    state.pdf.blocks = blocks;
    await engine.load(state.doc.id);
    const afterTop = state.blocks[heldIndex]?.getBoundingClientRect().top ?? null;
    if (beforeTop !== null && afterTop !== null) {
      window.scrollBy({ top: afterTop - beforeTop, left: 0, behavior: "auto" });
    }
    if (Number.isInteger(heldIndex) && heldIndex >= 0) moveMarker(heldIndex);
    showPdfSearchState(state.pdf.model.searchState(), { scroll: false });
    pdfZoomValue.textContent = `${Math.round(zoom * 100)}%`;
  } catch (error) {
    state.pdf.model.setZoom(previousZoom);
    setStatus(true, `PDF zoom failed: ${error?.message ?? error}`);
  } finally {
    pdfZoomOut.disabled = state.pdf.model.zoom <= 0.75;
    pdfZoomIn.disabled = state.pdf.model.zoom >= 2.5;
  }
}

pdfZoomOut.addEventListener("click", () => void setPdfZoom(state.pdf?.model.zoom - 0.25));
pdfZoomIn.addEventListener("click", () => void setPdfZoom(state.pdf?.model.zoom + 0.25));
pdfSearchInput.addEventListener("input", () => {
  if (state.pdf) showPdfSearchState(state.pdf.model.setSearchQuery(pdfSearchInput.value));
});
pdfSearchPrevious.addEventListener("click", () => {
  if (state.pdf) showPdfSearchState(state.pdf.model.previousSearchHit());
});
pdfSearchNext.addEventListener("click", () => {
  if (state.pdf) showPdfSearchState(state.pdf.model.nextSearchHit());
});

// ---------------------------------------------------------------------------
// History panel

function fmtTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString();
  } catch {
    return iso;
  }
}

function arrivalWords(entry) {
  if (entry.migration === "legacy") {
    return "older record — whole block used because exact words were not stored";
  }
  return {
    exact: "exact text found",
    refound: "text found again after it moved",
    approximate: "whole block used because the exact words were unavailable",
    lost: "this text may have moved/changed",
  }[entry.arrival] ?? "";
}

function spanLabel(e) {
  return e.blockEnd != null && e.blockEnd !== e.blockIndex
    ? `blocks ${e.blockIndex + 1}–${e.blockEnd + 1}`
    : `block ${e.blockIndex + 1}`;
}

/** Build the DOM for one history entry. Shared by the reading-side panel
 * and the full what-happened surface (which passes its own undo handler). */
function entryNode(e, { onUndo, onSend } = {}) {
  const li = document.createElement("li");
  li.className = `entry ${e.kind}${e.undone ? " struck" : ""}`;
  const head = document.createElement("div");
  head.className = "entry-head";
  const title = document.createElement("strong");
  title.textContent = `${historyTitleFor(e)} — ${spanLabel(e)}`;
  head.appendChild(title);
  const time = document.createElement("span");
  time.className = "entry-time";
  time.textContent = fmtTime(e.createdAt);
  head.appendChild(time);
  li.appendChild(head);

  const ev = document.createElement("div");
  ev.className = "entry-evidence";
  const bits = [];
  if (e.evidence) bits.push(`${e.modality === "voice" ? "heard" : "input"}: “${e.evidence}”`);
  if (e.matchedText) bits.push(`matched: “${e.matchedText}”`);
  if (e.confidence != null) bits.push(`match ${Math.round(e.confidence * 100)}%`);
  if (arrivalWords(e)) bits.push(arrivalWords(e));
  if (e.noteText) bits.push(`note: “${e.noteText}”`);
  if (e.mathSpeech) bits.push(`words: “${e.mathSpeech}”`);
  if (e.mathLatex) bits.push(`LaTeX: ${e.mathLatex}`);
  if (e.mathUnparsed?.length) bits.push(`unparsed: ${e.mathUnparsed.join(", ")}`);
  if (e.undoes) bits.push(`reverses ${e.undoes}`);
  ev.textContent = bits.join(" · ");
  li.appendChild(ev);

  const det = document.createElement("details");
  const sum = document.createElement("summary");
  sum.textContent = "full record";
  det.appendChild(sum);
  const pre = document.createElement("pre");
  pre.textContent = JSON.stringify({ cursor: e.cursor, proof: e.receipt }, null, 2);
  det.appendChild(pre);
  li.appendChild(det);

  if (e.kind === "act" && !e.undone) {
    const btn = document.createElement("button");
    btn.className = "undo-btn";
    btn.textContent = "undo";
    btn.addEventListener("click", () => onUndo?.(e));
    li.appendChild(btn);

    if (onSend) {
      const send = document.createElement("button");
      send.className = "send-btn";
      send.textContent = "send";
      send.title = "send this act to the connected device";
      send.addEventListener("click", () => onSend(e));
      li.appendChild(send);
    }
    shell?.attachSpacePicker(li, { entry: e });
  }
  return li;
}

function renderHistory(entries) {
  historyList.textContent = "";
  for (const e of [...entries].reverse()) {
    historyList.appendChild(
      entryNode(e, {
        onUndo: (entry) =>
          executeVerb("undo", {
            entryId: entry.id,
            modality: "pointer",
            evidence: "undo button clicked",
          }),
        onSend: (entry) => sendEntry(entry.id),
      })
    );
  }
  shell?.historyChanged();
}

// ---------------------------------------------------------------------------
// Act engine (acts confirm with a small physical disturbance — jt-water)

function renderMathInto(node, latex) {
  if (!latex) {
    node.textContent = "";
    return;
  }
  katex.render(latex, node, {
    throwOnError: false,
    output: "htmlAndMathml",
    strict: "warn",
  });
}

const engine = createActEngine({
  getBlocks: () => state.blocks,
  getBlockTexts: () => state.blockTexts,
  getDoc: () => state.doc,
  onChange: renderHistory,
  onApply: (p) => {
    if (!p.classList.contains("pdf-text-layer")) {
      confirmRipple(p, { energy: motionParams().energy });
    }
  },
  renderMath: (node, entry) => renderMathInto(node, entry.mathLatex),
  getAnchorGeometry: anchorGeometryFor,
});

// ---------------------------------------------------------------------------
// Intents (jt-speech) — the only command path

/**
 * Locate the block an anchor phrase points at. Spoken anchors are fuzzy and
 * may span a paragraph break ("rent is due to the deposit"), so on a failed
 * full-phrase match we retry with the phrase's head, then tail — the words
 * most likely to sit contiguously in the document.
 */
function findAnchorBlock(anchorText, prefer = "head") {
  const words = tokenize(anchorText);
  const tries = [words];
  const head = words.slice(0, 3);
  const tail = words.slice(-3);
  if (words.length > 3) tries.push(prefer === "tail" ? tail : head, prefer === "tail" ? head : tail);
  for (const t of tries) {
    if (t.length < 3) continue;
    const m = matchTranscript(state.docTokens, t.join(" "), {});
    if (m) return blockForRange(state.tokenBlock, m.start, m.end);
  }
  return -1;
}

function hideAsk() {
  state.pendingAsk = null;
  askBox.hidden = true;
  askOptions.textContent = "";
}

function showAsk(cmd) {
  state.pendingAsk = cmd;
  askOptions.textContent = "";
  for (const [i, cand] of cmd.candidates.entries()) {
    const btn = document.createElement("button");
    btn.className = "ask-option";
    btn.dataset.candidate = String(i);
    btn.textContent = describeCandidate(cand);
    btn.addEventListener("click", () => resolveAsk(i));
    askOptions.appendChild(btn);
  }
  const dismiss = document.createElement("button");
  dismiss.className = "ask-option ask-dismiss";
  dismiss.textContent = "none of these";
  dismiss.addEventListener("click", hideAsk);
  askOptions.appendChild(dismiss);
  askBox.hidden = false;
  setStatus(true, "that could mean two things — pick one");
  if (window.__jt) {
    window.__jt.ambiguities.push({
      reason: cmd.reason,
      evidence: cmd.evidence,
      candidates: cmd.candidates.map(describeCandidate),
    });
  }
}

function targetCandidateLabel(candidate) {
  const text = state.blockTexts[candidate.blockIndex] ?? "";
  const spans = tokenizeWithSpans(text);
  const first = spans[candidate.tokenStart];
  const last = spans[candidate.tokenEnd];
  if (!first || !last) return candidate.quotedText || `block ${candidate.blockIndex + 1}`;
  const prefix = text.slice(Math.max(0, first.start - 36), first.start).trimStart();
  const quote = text.slice(first.start, last.end);
  const suffix = text.slice(last.end, last.end + 36).trimEnd();
  return `${prefix} ‹${quote}› ${suffix}`.trim();
}

function showTargetAsk(cmd, modality, decision) {
  state.pendingAsk = {
    kind: "target",
    cmd,
    modality,
    reason: decision.reason,
    candidates: decision.candidates,
  };
  askOptions.textContent = "";
  for (const [i, candidate] of decision.candidates.entries()) {
    const btn = document.createElement("button");
    btn.className = "ask-option target-ask";
    btn.dataset.candidate = String(i);
    btn.textContent = targetCandidateLabel(candidate);
    btn.addEventListener("click", () => resolveAsk(i));
    askOptions.appendChild(btn);
  }
  const dismiss = document.createElement("button");
  dismiss.className = "ask-option ask-dismiss";
  dismiss.textContent = "none of these";
  dismiss.addEventListener("click", hideAsk);
  askOptions.appendChild(dismiss);
  askBox.hidden = false;
  setStatus(true, "I found more than one possible passage — pick the words you mean");
  if (window.__jt) {
    window.__jt.ambiguities.push({
      reason: decision.reason,
      evidence: cmd.evidence,
      candidates: decision.candidates.map(targetCandidateLabel),
    });
  }
}

function showSpaceAsk(result, entry, evidence) {
  state.pendingAsk = {
    type: "space",
    candidates: result.candidates,
    entry,
    evidence,
  };
  askOptions.textContent = "";
  for (const [i, candidate] of result.candidates.entries()) {
    const btn = document.createElement("button");
    btn.className = "ask-option space-ask";
    btn.dataset.candidate = String(i);
    btn.textContent = candidate.space.name;
    btn.addEventListener("click", () => resolveAsk(i));
    askOptions.appendChild(btn);
  }
  const dismiss = document.createElement("button");
  dismiss.className = "ask-option ask-dismiss";
  dismiss.textContent = "none of these";
  dismiss.addEventListener("click", hideAsk);
  askOptions.appendChild(dismiss);
  askBox.hidden = false;
  setStatus(true, "those space names sound alike — pick where this should go");
}

function showReturnAsk(documents, { evidence, modality }) {
  state.pendingAsk = { kind: "document-return", documents, evidence, modality };
  askOptions.textContent = "";
  for (const [i, doc] of documents.entries()) {
    const btn = document.createElement("button");
    btn.className = "ask-option";
    btn.dataset.candidate = String(i);
    btn.textContent = `go back to “${doc.title}”`;
    btn.addEventListener("click", () => resolveAsk(i));
    askOptions.appendChild(btn);
  }
  const dismiss = document.createElement("button");
  dismiss.className = "ask-option ask-dismiss";
  dismiss.textContent = "none of these";
  dismiss.addEventListener("click", hideAsk);
  askOptions.appendChild(dismiss);
  askBox.hidden = false;
  setStatus(true, "I found more than one document — pick one");
  if (window.__jt) {
    window.__jt.ambiguities.push({
      reason: "document names are equally close",
      evidence,
      candidates: documents.map((doc) => `go back to “${doc.title}”`),
    });
  }
}

async function resolveAsk(i) {
  const ask = state.pendingAsk;
  if (!ask) return;
  if (ask.kind === "target") {
    const candidate = ask.candidates[i];
    const labels = ask.candidates.map(targetCandidateLabel);
    hideAsk();
    if (candidate) {
      await executeVerb(ask.cmd.verbId, {
        ...ask.cmd,
        modality: ask.modality,
        target: candidate,
        targetChoice: {
          asked: true,
          reason: ask.reason,
          candidates: labels,
          chosen: targetCandidateLabel(candidate),
        },
      });
    }
    return;
  }
  if (ask.kind === "document-return") {
    const doc = ask.documents[i];
    hideAsk();
    if (doc) {
      await executeVerb("return", {
        document: doc,
        modality: ask.modality,
        evidence: ask.evidence,
      });
    }
    return;
  }
  const cand = ask.candidates[i];
  hideAsk();
  if (ask.type === "space") {
    if (cand?.space) await executeVerb("send-to-space", { entry: ask.entry, spaceId: cand.space.id });
    return;
  }
  if (!cand || cand.type === "reading") return;
  await runCommand(toCommand(cand), "pointer");
}

function performActAtTarget(verbId, args, target, targetChoice = null) {
  const blockIndex = target?.blockIndex ?? args.blockIndex ?? state.currentBlock;
  const matchedText =
    target?.quotedText ?? args.matchedText ?? state.blockTexts[blockIndex]?.slice(0, 120) ?? "";
  return engine.perform(verbId, blockIndex, {
    modality: args.modality,
    evidence: args.evidence,
    confidence: target?.score ?? args.confidence ?? state.lastMatch?.score ?? null,
    matchedText,
    noteText: args.noteText ?? "",
    tokenStart: target?.tokenStart ?? args.tokenStart,
    tokenEnd: target?.tokenEnd ?? args.tokenEnd,
    targetChoice,
    blockEnd: args.blockEnd,
    arrival: args.arrival,
  });
}

function emitCommandResult(intent, result, reason, { confidence, ambiguities = [] } = {}) {
  emitGlass({
    kind: "intentResult",
    result,
    ...(intent ? { intent } : {}),
    ...(confidence !== undefined ? { confidence } : {}),
    ambiguities,
    thresholds: {
      accept: TARGET_POLICY.minScore,
      askBelow: TARGET_POLICY.askBelow,
      closeGap: TARGET_POLICY.closeScoreGap,
    },
    reason,
  });
}

async function performTargeted(verbId, args) {
  if (args.target || Number.isInteger(args.blockIndex)) {
    return performActAtTarget(verbId, args, args.target ?? null, args.targetChoice ?? null);
  }
  const targetMatch = state.lastReadingMatch ?? state.lastMatch;
  const targetBlock = targetMatch?.blockIndex ?? state.currentBlock;
  if (targetBlock < 0) {
    emitCommandResult(verbId, "none", "No passage was available for this instruction.");
    setStatus(true, "read a line first so jt knows where you are");
    return null;
  }
  state.currentBlock = targetBlock;
  if (!targetMatch || targetMatch.blockIndex !== targetBlock) {
    emitCommandResult(verbId, "act", "Used the passage already in view.");
    return performActAtTarget(verbId, args, null);
  }
  const decision = decideTarget(targetMatch);
  if (decision.kind === "ask") {
    emitCommandResult(
      verbId,
      "ask",
      decision.reason === "more than one passage was similarly likely"
        ? `Asked because two passages scored within ${TARGET_POLICY.closeScoreGap.toFixed(2)}.`
        : "Asked because the passage match was uncertain.",
      {
        confidence: targetMatch.score,
        ambiguities: decision.candidates.map((candidate) => ({
          label: targetCandidateLabel(candidate),
          confidence: candidate.score,
        })),
      },
    );
    showTargetAsk({ ...args, verbId }, args.modality, decision);
    return null;
  }
  if (decision.kind === "none") {
    emitCommandResult(verbId, "none", "No passage cleared the match threshold.", { confidence: targetMatch.score });
    setStatus(true, "I could not place those words confidently — read the passage again");
    return null;
  }
  emitCommandResult(verbId, "act", "The instruction and passage were clear.", { confidence: decision.target.score });
  return performActAtTarget(verbId, args, decision.target);
}

async function performRange(verbId, args) {
  const from = findAnchorBlock(args.fromAnchor, "head");
  const to = findAnchorBlock(args.toAnchor, "tail");
  if (from < 0 || to < 0) {
    emitCommandResult(verbId, "none", "One or both spoken passage anchors were not found.", { confidence: args.confidence });
    setStatus(true, "couldn't find those words in the document");
    return null;
  }
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const ranged = await engine.perform(verbId, lo, {
    blockEnd: hi,
    modality: args.modality,
    evidence: args.evidence,
    confidence: args.confidence ?? null,
    matchedText: state.blockTexts[lo]?.slice(0, 120) ?? "",
  });
  emitCommandResult(verbId, ranged ? "act" : "none", ranged ? "The requested passage range was highlighted." : "The passage range could not be highlighted.", { confidence: args.confidence });
  return ranged;
}

async function undoVerb(args) {
  if (args.entry) {
    const entry = args.entry;
    entry.undone = true;
    entry.cursor = { ...entry.cursor, undoAvailable: false };
    await putRecord(entry);
    const undoEntry = makeActEntry({
      docId: entry.docId,
      revision: args.document?.revision ?? 1,
      blockIndex: entry.blockIndex,
      blockEnd: entry.blockEnd,
      verbId: "undo",
      modality: args.modality ?? "pointer",
      evidence: args.evidence ?? "undo button clicked",
      undoes: entry.id,
    });
    await putRecord(undoEntry);
    emitGlass({
      kind: "actCommitted",
      act: "undo",
      input: args.evidence ?? "undo button clicked",
      target: { blockId: `${entry.docId}-block-${entry.blockIndex}`, blockIndex: entry.blockIndex },
    });
    emitCommandResult("undo", "act", "The saved act was undone.");
    return undoEntry;
  }
  const done = await engine.undo(args.entryId ?? null, {
    modality: args.modality ?? "voice",
    evidence: args.evidence ?? "undo",
  });
  if (done) emitCommandResult("undo", "act", "The last saved act was undone.");
  else {
    emitCommandResult("undo", "none", "There was nothing left to undo.");
    setStatus(true, "nothing left to undo");
  }
  return done;
}

function showHistory() {
  if (narrowScreen.matches) setSheet("history");
  document.querySelector(".history")?.classList.add("attention");
  setTimeout(() => document.querySelector(".history")?.classList.remove("attention"), 1500);
  setStatus(true, `everything you have done is in the panel on the right (${engine.entries.length} so far)`);
  emitCommandResult("show-history", "handled", "The saved acts panel opened.");
  return null;
}

async function openDocumentVerb(args) {
  if (args.document) {
    const opened = await openDocument(args.document, args.options);
    emitCommandResult("open-document", "handled", `Opened “${args.document.title}”.`);
    return opened;
  }
  const docs = await getDocs();
  const want = (args.documentName ?? "").toLowerCase();
  const found = docs.find((doc) => doc.title.toLowerCase().includes(want));
  if (found) {
    const opened = await openDocument(found);
    emitCommandResult("open-document", "handled", `Opened “${found.title}”.`);
    return opened;
  }
  emitCommandResult("open-document", "none", `No document called “${args.documentName}” was found.`);
  setStatus(true, `no document called “${args.documentName}” here`);
  return null;
}

async function returnVerb(args) {
  let target = args.document ?? state.doc;
  if (!args.document && args.documentName) {
    const result = matchDocumentName(await getDocs(), args.documentName);
    if (result.kind === "none") {
      emitCommandResult("return", "none", `No document called “${args.documentName}” was found.`);
      setStatus(true, `no document called “${args.documentName}” here`);
      return null;
    }
    if (result.kind === "ambiguous") {
      emitCommandResult("return", "ask", "Asked because more than one document name was close.", {
        ambiguities: result.documents.map((document) => ({ label: document.title, confidence: 0 })),
      });
      showReturnAsk(result.documents, { evidence: args.evidence, modality: args.modality });
      return null;
    }
    target = result.document;
  }
  if (!target) {
    emitCommandResult("return", "none", "There was no open document to return to.");
    setStatus(true, "there is no open document to go back to");
    return null;
  }
  const opened = await openDocument(target, {
    modality: args.modality,
    returnReason: args.evidence,
    requirePosition: true,
  });
  emitCommandResult("return", opened ? "handled" : "none", opened ? `Returned to “${target.title}”.` : `No saved place was found in “${target.title}”.`);
  return opened;
}

const verbExecutionContext = {
  performTargeted,
  performRange,
  undo: undoVerb,
  showHistory,
  openDocument: openDocumentVerb,
  returnTo: returnVerb,
  sendTo: (args) => sendSpoken(args),
  sendToSpace: async ({ entry, spaceId }) => {
    const sent = await shell?.sendEntryToSpace(entry, spaceId);
    emitCommandResult("send-to-space", sent ? "handled" : "none", sent ? "The saved act was sent." : "The saved act could not be sent.");
    return sent;
  },
  keepMath: ({ modality = "pointer" } = {}) => keepMath(modality),
  openRoom: (room) => shell?.openRoom(room),
};

function executeVerb(id, args = {}) {
  return executeRegisteredVerb(id, verbExecutionContext, args);
}

async function runCommand(cmd, modality = "voice") {
  if (cmd.type === "reading") return null;
  if (cmd.type === "ask") {
    showAsk(cmd);
    return null;
  }
  if (!cmd.verbId) return null;
  return executeVerb(cmd.verbId, { ...cmd, modality });
}

// ---------------------------------------------------------------------------
// Spoken mathematics: one final-segment route, one durable act path

function renderMathPreview(expression, { syncWords = true } = {}) {
  mathState.expression = expression;
  if (syncWords) mathSpoken.value = expression?.speech ?? "";
  mathLatex.textContent = expression?.latex ?? "";
  mathRendered.textContent = "";
  if (expression?.latex) renderMathInto(mathRendered, expression.latex);
  const unknown = expression?.unparsed ?? [];
  mathUnparsed.hidden = unknown.length === 0;
  mathUnparsed.textContent = unknown.length
    ? `words the rule-based translator could not place: ${unknown.join(", ")}. they will stay with the record rather than being guessed.`
    : "";
  mathKeep.disabled = !expression?.latex;
}

function setMathMode(active, { announce = true } = {}) {
  mathState.active = active;
  mathWorkbench.hidden = !active;
  mathModeToggle.setAttribute("aria-pressed", String(active));
  mathModeToggle.textContent = active ? "leave math mode" : "start math mode";
  mathModeState.textContent = active
    ? "math mode is on — final words become mathematics"
    : "math mode is off";
  if (announce) {
    setStatus(
      true,
      active
        ? "math mode — speak an expression, then say “keep that”"
        : "math mode off — reading and spoken acts are back"
    );
  }
  if (active) mathSpoken.focus();
}

function renderMathSession() {
  mathSessionList.textContent = "";
  for (const item of mathState.kept) {
    const li = document.createElement("li");
    const words = document.createElement("span");
    words.className = "math-session-words";
    words.textContent = item.speech;
    li.appendChild(words);
    const rendered = document.createElement("span");
    rendered.className = "math-session-rendered";
    renderMathInto(rendered, item.latex);
    li.appendChild(rendered);
    mathSessionList.appendChild(li);
  }
  mathSession.hidden = mathState.kept.length === 0;
}

function isSpokenMathDocument(doc) {
  return doc?.title === "spoken mathematics" && doc.provenance?.sourceKind === "spoken";
}

async function openSpokenMathExpression(expression) {
  const docs = await getDocs();
  const existing = isSpokenMathDocument(state.doc)
    ? state.doc
    : docs.find(isSpokenMathDocument) ?? null;
  const doc = await makeSpokenMathDocument(existing, expression);
  await putDoc(doc);
  await openDocument(doc, { navigate: false });
  state.currentBlock = doc.blocks.length - 1;
  moveMarker(state.currentBlock);
  return { doc, blockIndex: state.currentBlock };
}

async function keepMath(modality) {
  const expression = mathState.expression;
  if (!expression?.latex) {
    setStatus(true, "nothing translatable to keep yet — speak or type an expression first");
    return null;
  }

  let doc = state.doc;
  let blockIndex = state.currentBlock;
  if (!doc || isSpokenMathDocument(doc)) {
    ({ doc, blockIndex } = await openSpokenMathExpression(expression));
  } else if (blockIndex < 0) {
    setStatus(true, "tap or read a document block first so the expression has an honest anchor");
    return null;
  }

  const entry = await engine.perform("math", blockIndex, {
    modality,
    evidence: expression.speech,
    confidence: null,
    matchedText: state.blockTexts[blockIndex]?.slice(0, 120) ?? "",
    mathSpeech: expression.speech,
    mathLatex: expression.latex,
    mathUnparsed: expression.unparsed,
  });
  if (!entry) return null;

  mathState.kept.push({
    entryId: entry.id,
    docId: doc.id,
    blockIndex,
    speech: expression.speech,
    latex: expression.latex,
    unparsed: [...expression.unparsed],
  });
  renderMathSession();
  setStatus(
    true,
    expression.unparsed.length
      ? `kept with ${expression.unparsed.length} unparsed word${expression.unparsed.length === 1 ? "" : "s"} named in the record`
      : "mathematics kept — history, undo, export and send are ready"
  );
  return entry;
}

async function onMathFinalSegment(segment) {
  const control = mathControl(segment, mathState.active);
  if (control === "enter") {
    setMathMode(true);
    return "enter";
  }
  if (control === "exit") {
    setMathMode(false);
    return "exit";
  }
  if (control === "keep") {
    await executeVerb("math-keep", { modality: "voice" });
    return "keep";
  }
  if (!mathState.active) return null;
  renderMathPreview(translateSpokenMath(segment));
  return "expression";
}

mathModeToggle.addEventListener("click", () => setMathMode(!mathState.active));
mathKeep.addEventListener("click", () => executeVerb("math-keep", { modality: "pointer" }));
mathSpoken.addEventListener("input", () => {
  renderMathPreview(translateSpokenMath(mathSpoken.value), { syncWords: false });
});

// ---------------------------------------------------------------------------
// Transcript pipeline (shared by mic and sim)

function onInterim(fullText, latestSegment = fullText) {
  if (mathState.active) return;
  // Recognition results include earlier finalized reading. A fresh command
  // must not replay that old text into the cursor after a pointer selection.
  const preview = new IntentStream().push({ text: latestSegment, final: true });
  if (preview.length && preview.every(event => toCommand(event).type !== "reading")) return;
  if (!state.matcher) return;
  emitGlass({ kind: "transcriptEvent", text: fullText, final: false, source: SIM ? "sim" : "speech" });
  const matchStarted = performance.now();
  const m = state.matcher.follow(fullText);
  emitGlass({ kind: "latencyMark", stage: "matcher", durationMs: performance.now() - matchStarted, budgetMs: 1 });
  if (!m || m.blockIndex == null || m.blockIndex < 0) return;
  const b = m.blockIndex;
  const target = targetForGlobalRange(m.start, m.end, b);
  const candidates = (m.candidates ?? [])
    .map((candidate) => ({
      ...targetForGlobalRange(candidate.start, candidate.end),
      score: candidate.score,
      start: candidate.start,
      end: candidate.end,
    }))
    .filter((candidate) => Number.isInteger(candidate.blockIndex));
  state.lastMatch = {
    score: m.confidence,
    blockIndex: b,
    start: m.start,
    end: m.end,
    target,
    candidates,
  };
  const blocks = state.blockTexts.map((_text, blockIndex) => ({
    blockId: `${state.doc?.id ?? "document"}-block-${blockIndex}`,
    blockIndex,
    score: 0,
    spans: [],
  }));
  for (const candidate of candidates) {
    const block = blocks[candidate.blockIndex];
    block.score = Math.max(block.score, candidate.score);
    block.spans.push({
      start: candidate.tokenStart,
      end: candidate.tokenEnd,
      score: candidate.score,
      unit: "token",
      ...(candidate.quotedText ? { text: candidate.quotedText } : {}),
    });
  }
  emitGlass({
    kind: "matchScores",
    query: fullText,
    blocks,
    selected: {
      blockId: `${state.doc?.id ?? "document"}-block-${b}`,
      blockIndex: b,
      start: target.tokenStart,
      end: target.tokenEnd,
      unit: "token",
    },
  });
  if (window.__jt) window.__jt.matches.push({ block: b, score: +m.confidence.toFixed(3) });
  if (b !== state.currentBlock) {
    state.currentBlock = b;
    if (window.__jt) window.__jt.current = b;
    state.blocks[b].scrollIntoView({ behavior: "smooth", block: "center" });
  }
  // The target span advances even while reading the same paragraph.
  moveMarker(b, target);
  rememberPosition(b);
}

async function onFinalSegment(segment) {
  emitGlass({ kind: "transcriptEvent", text: segment, final: true, source: SIM ? "sim" : "speech" });
  const mathResult = await onMathFinalSegment(segment);
  if (mathResult) return;
  const intentStarted = performance.now();
  const events = intentStream.push({ text: segment, final: true });
  emitGlass({ kind: "latencyMark", stage: "intent", durationMs: performance.now() - intentStarted, budgetMs: 5 });
  for (const ev of events) {
    const cmd = toCommand(ev);
    const classification = cmd.type === "reading" ? "reading" : cmd.type === "ask" ? "unresolved" : "command";
    emitGlass({
      kind: "segmentationDecision",
      segmentText: segment,
      classification,
      confidence: ev.confidence ?? (classification === "unresolved" ? 0.5 : 1),
      reason: cmd.reason ?? (classification === "reading" ? "This sounds like document text." : "This matches a known instruction."),
    });
    if (cmd.type === "reading") {
      emitCommandResult(null, "reading", "No instruction was found.", { confidence: ev.confidence });
      if (state.lastMatch) state.lastReadingMatch = state.lastMatch;
      continue;
    }
    if (cmd.type === "ask") {
      emitCommandResult(null, "ask", cmd.reason, {
        confidence: ev.confidence,
        ambiguities: (cmd.candidates ?? []).map((candidate) => ({
          label: describeCandidate(candidate),
          confidence: candidate.confidence ?? ev.confidence ?? 0,
        })),
      });
    }
    if (cmd.type !== "reading" && window.__jt) window.__jt.commands.push(cmd.type === "act" ? cmd.act : cmd.type);
    await runCommand(cmd, "voice");
  }
}

// ---------------------------------------------------------------------------
// Documents: library with provenance, ingestion via jt-connectors

async function refreshLibrary() {
  const docs = (await getDocs()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  docList.textContent = "";
  for (const d of docs) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.className = `doc-btn${state.doc?.id === d.id ? " open" : ""}`;
    btn.textContent = d.title;
    btn.addEventListener("click", () => executeVerb("open-document", { document: d }));
    li.appendChild(btn);
    if (d.provenance) {
      const prov = document.createElement("div");
      prov.className = "prov";
      const bits = [d.provenance.sourceKind];
      if (d.provenance.createdBy) bits.push(`created by ${d.provenance.createdBy}`);
      if (d.provenance.pageCount) bits.push(`${d.provenance.pageCount} pages`);
      bits.push(fmtBytes(d.provenance.byteSize));
      bits.push(shortDigest(d.provenance.contentDigest));
      prov.textContent = bits.filter(Boolean).join(" · ");
      prov.title = `${d.provenance.contentDigest}\ncaptured ${d.provenance.capturedAt}`;
      li.appendChild(prov);
    }
    docList.appendChild(li);
  }
  shell?.libraryChanged();
}

/** The reading surface's header: title + a tap-to-open provenance line. */
function renderDocHead(doc) {
  if (!doc) {
    docHead.hidden = true;
    readEmpty.hidden = false;
    micHint.hidden = true;
    return;
  }
  readEmpty.hidden = true;
  micHint.hidden = doc.provenance?.sourceKind === "image";
  docHead.hidden = false;
  docTitle.textContent = doc.title;
  document.getElementById("download-original").hidden = !doc.sourceBytes;
  const p = doc.provenance;
  docProvBtn.hidden = !p;
  docProv.hidden = true;
  docProvBtn.setAttribute("aria-expanded", "false");
  if (p) {
    const bits = [
      `came in as ${p.sourceKind}`,
      p.createdBy ? `created by ${p.createdBy}` : "",
      p.pageCount ? `${p.pageCount} pages` : "",
      fmtBytes(p.byteSize),
      `fingerprint ${shortDigest(p.contentDigest)}`,
      `captured ${fmtTime(p.capturedAt)}`,
    ];
    if (p.spaceImport) {
      bits.push(`from space ${p.spaceImport.spaceName}`);
      bits.push(
        `original source ${p.original?.sourceTitle ?? p.original?.sourceId ?? "unknown"}`,
        p.original?.sourceRevision ?? "",
        p.original?.sourceDigest ?? "",
        `moment ${p.spaceImport.contentHash}`,
      );
    }
    docProv.textContent = bits.filter(Boolean).join(" · ");
  }
}

document.getElementById("download-original").addEventListener("click", () => {
  const doc = state.doc;
  if (!doc?.sourceBytes) return;
  const kind = doc.provenance?.sourceKind;
  const ext = kind === "pdf" ? "pdf" : kind === "markdown" ? "md" : doc.sourceMime === "text/html" ? "html" : "txt";
  const mime = doc.sourceMime || (kind === "pdf" ? "application/pdf" : kind === "markdown" ? "text/markdown" : "text/plain");
  const url = URL.createObjectURL(new Blob([pdfSourceBytes(doc.sourceBytes)], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = doc.provenance?.name || `${doc.title}.${ext}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
});

docProvBtn.addEventListener("click", () => {
  docProv.hidden = !docProv.hidden;
  docProvBtn.setAttribute("aria-expanded", String(!docProv.hidden));
});

async function openDocument(
  doc,
  {
    navigate = true,
    modality = "pointer",
    returnReason = "opened from documents",
    requirePosition = false,
  } = {}
) {
  await renderDoc(doc);
  await engine.load(doc.id);
  renderDocHead(doc);
  await refreshLibrary();
  if (narrowScreen.matches) setSheet(null); // picking a document closes the sheet
  if (navigate) shell?.show("read");
  const position = await positionForDoc(doc);
  if (!position) {
    setStatus(
      true,
      requirePosition ? `I have not kept a place in “${doc.title}” yet` : `open: ${doc.title}`
    );
    return null;
  }
  state.currentBlock = position.blockIndex;
  state.lastMatch = null;
  moveMarker(position.blockIndex);
  returnToPlace(state.blocks[position.blockIndex], markerMedium());
  const entry = await engine.recordReturn(position.blockIndex, {
    modality,
    evidence: returnReason,
    matchedText: state.blockTexts[position.blockIndex]?.slice(0, 120) ?? "",
  });
  setStatus(true, `back at block ${position.blockIndex + 1} of ${position.blockCount}`);
  return entry;
}

/** Store an IngestResult (jt-connectors shape) as a jt document. */
async function addIngested(result, nameHint = "") {
  const viewableImagePdf = result.refusal?.kind === "image-only" && result.sourceBytes;
  const viewableImage = result.provenance.sourceKind === "image" && result.sourceBytes && result.imageSource;
  if (!result.blocks.length && !viewableImagePdf && !viewableImage) {
    setStatus(true, result.refusal?.message ?? "nothing readable in that — try another file");
    return null;
  }
  const text = result.blocks.map((b) => b.text).join("\n\n");
  const doc = {
    id: rid("doc"),
    title:
      result.provenance.title ||
      nameHint ||
      result.provenance.name ||
      titleFrom(text, "untitled"),
    text,
    blocks: result.blocks,
    provenance: result.provenance,
    warnings: result.warnings,
    ...(result.pdfEngine ? { pdfEngine: result.pdfEngine } : {}),
    ...(result.sourceBytes ? { sourceBytes: result.sourceBytes } : {}),
    ...(result.sourceMime ? { sourceMime: result.sourceMime } : {}),
    ...(result.imageSource ? { imageSource: result.imageSource } : {}),
    ...(result.refusal ? { refusal: result.refusal } : {}),
    createdAt: nowIso(),
    revision: 1,
  };
  await putDoc(doc);
  try {
    await openDocument(doc);
  } catch {
    // Persistence has already committed. Never report a failed save or prompt
    // a duplicate import just because the reader could not open the result.
    shell?.show("home");
    setStatus(false, `Saved “${doc.title}”. The reader couldn’t open it; reopen it from your library.`);
    return doc;
  }
  if (result.refusal) setStatus(true, result.refusal.message);
  else if (result.warnings.length) setStatus(true, `opened with notes: ${result.warnings[0]}`);
  return doc;
}

async function addDocument(text, nameHint = "") {
  const result = await ingestText(text, { name: nameHint || undefined });
  return addIngested(result, nameHint);
}

async function ingestFile(f) {
  if (/\.(png|jpe?g|webp|gif)$/i.test(f.name) || /^image\//.test(f.type)) {
    try { return await addIngested(await ingestImage(f), f.name); }
    catch (error) { setStatus(false, error.message); return null; }
  }
  if (/\.pdf$/i.test(f.name) || f.type === "application/pdf") {
    setStatus(true, `reading ${f.name}…`);
    const pdfjs = await loadPdfJs();
    const pdfEngine = await selectAvailablePdfEngine({ pdfjs });
    const bytes = new Uint8Array(await f.arrayBuffer());
    const result = await ingestPdfBrowser(pdfEngine, bytes, { name: f.name });
    return addIngested(result, f.name.replace(/\.pdf$/i, ""));
  }
  if (/\.(txt|md)$/i.test(f.name) || /^text\//.test(f.type)) {
    const rawBytes = new Uint8Array(await f.arrayBuffer());
    const result = await ingestText(new TextDecoder().decode(rawBytes), { name: f.name, rawBytes });
    return addIngested(result, f.name.replace(/\.(txt|md)$/i, ""));
  }
  setStatus(true, "JETT opens PDF, Markdown, text, PNG, JPEG, WebP and GIF.");
  return null;
}

let readerIntakeBusy = false;
async function keepFromReader(action) {
  if (readerIntakeBusy) {
    setStatus(false, "A file is still being saved. Try again when it finishes.");
    return null;
  }
  readerIntakeBusy = true;
  fileInput.disabled = true;
  pasteAdd.disabled = true;
  pasteBox.readOnly = true;
  try {
    return await action();
  } catch {
    setStatus(false, "Couldn’t save. Your original and pasted text are unchanged. Check storage, then try again.");
    return null;
  } finally {
    readerIntakeBusy = false;
    fileInput.disabled = false;
    pasteAdd.disabled = false;
    pasteBox.readOnly = false;
  }
}
fileInput.addEventListener("change", async () => {
  const f = fileInput.files?.[0];
  if (f) await keepFromReader(() => ingestFile(f));
  fileInput.value = "";
});

pasteAdd.addEventListener("click", async () => {
  if (!pasteBox.value.trim()) { pasteBox.focus(); return; }
  const result = await keepFromReader(async () => addIngested(await ingestPaste({ text: pasteBox.value })));
  if (result) pasteBox.value = "";
});

addEventListener("dragover", (e) => {
  if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
});
addEventListener("drop", async (e) => {
  if (!e.dataTransfer?.files?.length) return; // preserve normal text dragging
  e.preventDefault();
  for (const file of e.dataTransfer.files) {
    const saved = await keepFromReader(() => ingestFile(file));
    if (!saved) break; // keep the error visible; do not hide a failure with later success
  }
});

addEventListener("resize", () => {
  if (state.currentBlock >= 0) moveMarker(state.currentBlock);
});

// ---------------------------------------------------------------------------
// Sync (jt-sync): moments to another device, three spoken words to pair

const inbox = [];

function renderInbox() {
  inboxList.textContent = "";
  for (const item of [...inbox].reverse()) {
    const li = document.createElement("li");
    li.className = "inbox-item";
    const head = document.createElement("div");
    head.className = "entry-head";
    const title = document.createElement("strong");
    title.textContent = item.moment.provenance.sourceTitle || "a moment";
    head.appendChild(title);
    const badge = document.createElement("span");
    badge.className = `badge ${item.verified ? "ok" : "bad"}`;
    badge.textContent = item.verified ? "verified" : "not verified";
    badge.title = item.verified
      ? `content hash checked on arrival\n${item.contentHash}`
      : item.reason ?? "hash mismatch";
    head.appendChild(badge);
    li.appendChild(head);
    const what = document.createElement("div");
    what.className = "entry-evidence";
    what.textContent = item.moment.receipt?.result ?? "";
    li.appendChild(what);
    const prov = document.createElement("div");
    prov.className = "prov";
    prov.textContent = `from ${item.moment.transport?.fromDeviceId ?? "?"} · source ${shortDigest(
      item.moment.provenance.sourceDigest
    )} · ${fmtTime(item.receivedAt)}`;
    li.appendChild(prov);
    const det = document.createElement("details");
    const sum = document.createElement("summary");
    sum.textContent = "full moment";
    det.appendChild(sum);
    const pre = document.createElement("pre");
    pre.textContent = JSON.stringify(item.moment, null, 2);
    det.appendChild(pre);
    li.appendChild(det);
    shell?.attachSpacePicker(li, {
      moment: item.moment,
      sourceContentHash: item.contentHash,
    });
    inboxList.appendChild(li);
  }
  const empty = document.getElementById("inbox-empty");
  if (empty) empty.hidden = inbox.length > 0;
}

const sync = createSyncSurface({
  relayUrl: RELAY_URL,
  deviceId: rid("dev"),
  onArrive: async (item) => {
    inbox.push(item);
    renderInbox();
    try {
      await putInbox(item);
    } catch {
      /* inbox persistence is best-effort */
    }
    setStatus(true, `a moment arrived${item.verified ? " — verified" : " — could not be verified"}`);
  },
  onState: (s) => {
    shareState.textContent = s.paired
      ? "connected — kept acts can travel now"
      : s.connected
        ? "waiting for the other device…"
        : "";
  },
});

shareStart.addEventListener("click", async () => {
  try {
    const code = await sync.open();
    shareCode.hidden = false;
    shareCode.textContent = `on the other device, say or type: ${code.split("-").join(" ")}`;
  } catch (err) {
    setStatus(true, `sharing is unavailable: ${err?.message ?? err}`);
  }
});

joinBtn.addEventListener("click", async () => {
  try {
    await sync.join(joinCode.value);
    setStatus(true, "connected to the other device");
  } catch (err) {
    setStatus(true, String(err?.message ?? err));
  }
});

async function sendEntry(entryId) {
  const entry = engine.entries.find((e) => e.id === entryId && e.kind === "act" && !e.undone);
  if (!entry) return null;
  try {
    const out = await sync.send(entry, state.doc, state.blockTexts);
    setStatus(
      true,
      out.delivered && out.hashMatch
        ? "sent — the other device verified it arrived intact"
        : "sent, but the other device could not verify it"
    );
    return out;
  } catch (err) {
    setStatus(true, String(err?.message ?? err));
    return null;
  }
}

async function momentForKeptEntry(entry) {
  const doc = state.doc?.id === entry.docId ? state.doc : await getDoc(entry.docId);
  if (!doc) throw new Error("the source document for that act is not on this device");
  const blockTexts = doc.blocks?.length
    ? doc.blocks.map((block) => block.text)
    : splitParagraphs(doc.text);
  return momentFromEntry(entry, doc, blockTexts);
}

/** "send this to amber brook cedar" — pair by the spoken words, then send
 * the latest kept act. */
async function sendSpoken(cmd) {
  const latest = [...engine.entries].reverse().find((e) => e.kind === "act" && !e.undone);
  if (!latest) {
    emitCommandResult("send", "none", "There was no saved act to send.");
    setStatus(true, "nothing kept yet — highlight or note something first");
    return null;
  }
  const destination = shell?.resolvePersonSpace(cmd.recipient) ?? { kind: "none" };
  if (destination.kind === "match") {
    const sent = await shell.sendEntryToSpace(latest, destination.space.id);
    emitCommandResult("send", sent ? "handled" : "none", sent ? `Sent to “${destination.space.name}”.` : `Could not send to “${destination.space.name}”.`);
    return sent;
  }
  if (destination.kind === "ambiguous") {
    emitCommandResult("send", "ask", "Asked because more than one destination name was close.", {
      ambiguities: destination.candidates.map(({ space }) => ({ label: space.name, confidence: 0 })),
    });
    showSpaceAsk(destination, latest, cmd.evidence);
    return null;
  }
  if (!codeFromSpoken(cmd.recipient)) {
    emitCommandResult("send", "none", `No destination called “${cmd.recipient}” was found.`);
    setStatus(true, `no space called “${cmd.recipient}” in your current memberships`);
    return null;
  }
  try {
    if (!sync.state.paired) await sync.join(cmd.recipient);
    const sent = await sendEntry(latest.id);
    const verified = sent?.delivered === true && sent?.hashMatch === true;
    emitCommandResult(
      "send",
      verified ? "handled" : "none",
      verified ? "The saved act was sent and checked." : sent ? "The other device could not verify the saved act." : "The saved act could not be sent.",
    );
    return sent;
  } catch (err) {
    emitCommandResult("send", "none", "The saved act could not be sent.");
    setStatus(true, String(err?.message ?? err));
    return null;
  }
}

// ---------------------------------------------------------------------------
// Live mic — one permission ask, then a small state machine the header
// reflects honestly: listening / paused / voice off / blocked / unavailable.

const mic = { state: "off", stop: null };

function setMicState(state, statusMsg, on = state === "listening") {
  mic.state = state;
  if (statusMsg) setStatus(on, statusMsg);
  if (SIM) return;
  const label = {
    off: "turn on voice",
    listening: "pause listening",
    paused: "resume listening",
  }[state];
  voiceToggle.hidden = !label;
  if (label) voiceToggle.textContent = label;
  shell?.micChanged(state);
}

function startMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    setMicState("unavailable", "this browser cannot listen yet — jt still reads; try Chrome for voice", false);
    return;
  }
  const denied = () =>
    setMicState("denied", "the microphone is blocked — allow it in the browser's site settings, then reload", false);
  navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then((stream) => {
      stream.getTracks().forEach((t) => t.stop());
      const rec = new SR();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = settings.lang;
      let alive = true;
      let finalized = 0; // how many final results we've already handled
      rec.onresult = (e) => {
        let full = "";
        for (const res of e.results) full += `${res[0].transcript} `;
        onInterim(full, e.results[e.results.length - 1]?.[0]?.transcript ?? "");
        for (let i = finalized; i < e.results.length; i++) {
          if (e.results[i].isFinal) {
            finalized = i + 1;
            onFinalSegment(e.results[i][0].transcript);
          }
        }
      };
      rec.onend = () => {
        if (!alive) return;
        finalized = 0;
        try {
          rec.start();
        } catch {
          /* already started */
        }
      };
      rec.onerror = (e) => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          alive = false;
          denied();
        }
      };
      mic.stop = () => {
        alive = false;
        try {
          rec.stop();
        } catch {
          /* already stopped */
        }
      };
      rec.start();
      settings.set("mic", "on");
      setMicState("listening", "listening — read a line, then speak an act");
    })
    .catch(denied);
}

function pauseMic() {
  mic.stop?.();
  setMicState("paused", "paused — jt is not listening until you resume", false);
}

voiceToggle.addEventListener("click", () => {
  if (mic.state === "listening") pauseMic();
  else startMic(); // off or paused: (re)start — permission is already remembered
});

// ---------------------------------------------------------------------------
// Sim (?sim=1): scripted transcript through the same pipeline. ?fast=1 for
// automated verification. The script reads two passages, performs three
// acts, undoes the last, then speaks a genuinely ambiguous range highlight —
// which the app must ask about, never guess.

function emitSimReport(doc, { error = null, stepsCompleted = 0 } = {}) {
  const entries = engine.entries;
  window.__jt.records = entries;
  window.__jt.done = !error;
  const report = {
    sim: true,
    docId: doc?.id ?? null,
    engine: state.engineKind,
    provenance: doc?.provenance ?? null,
    matches: window.__jt.matches.length,
    blocksHit: [...new Set(window.__jt.matches.map((match) => match.block))],
    commands: window.__jt.commands,
    ambiguities: window.__jt.ambiguities,
    askPending: !!state.pendingAsk,
    stepsCompleted,
    error: error ? String(error?.message ?? error) : null,
    entries: entries.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      act: entry.act,
      blockIndex: entry.blockIndex,
      blockEnd: entry.blockEnd ?? null,
      undone: entry.undone,
      undoes: entry.undoes,
      confidence: entry.confidence,
      evidence: entry.evidence,
      anchor: entry.anchor ?? null,
      arrival: entry.arrival ?? null,
      targetChoice: entry.targetChoice ?? null,
      cursor: entry.cursor,
      receipt: entry.receipt,
    })),
  };
  window.__jt.report = report;
  document.getElementById("jt-report")?.remove();
  const node = document.createElement("script");
  node.type = "application/json";
  node.id = "jt-report";
  node.textContent = JSON.stringify(report);
  document.body.appendChild(node);
  setStatus(
    true,
    error ? `sim stopped after step ${stepsCompleted}: ${report.error}` : "sim complete — see the history panel",
  );
  return report;
}

async function startSim() {
  const fast = params.get("fast") === "1";
  const tick = fast ? 12 : 300;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  window.__jt = {
    sim: true,
    docId: null,
    matches: [],
    commands: [],
    ambiguities: [],
    current: -1,
    done: false,
    records: [],
    report: null,
    engine: "",
  };
  const doc = await addDocument(STARTER_DOC, "sim run");
  window.__jt.docId = doc.id;
  setStatus(true, "simulating speech (?sim=1)");

  // Deliberate mishearings the fuzzy matcher must absorb.
  const mishear = { grace: "grays", deposit: "the posit", inspection: "inspections" };
  const script = [
    { read: 3 }, // "Rent is due on the first..."
    { say: "highlight this" },
    { read: 4 }, // "The deposit is one months rent..."
    { say: "add a note check the inspection date before move out" },
    { say: "mark this important" },
    { say: "undo" },
    // Two plausible splits — jt-speech returns AmbiguousResult, the app asks.
    { say: "highlight from rent is due to the deposit to the final inspection" },
  ];

  let transcript = "";
  let stepsCompleted = 0;
  let failure = null;
  try {
    for (const step of script) {
      const words = step.read != null
        ? tokenize(state.blockTexts[step.read]).map((word) => mishear[word] ?? word)
        : step.say.split(" ");
      let segment = "";
      for (const word of words) {
        segment += `${word} `;
        onInterim(transcript + segment, segment);
        await sleep(tick);
      }
      transcript += segment;
      await onFinalSegment(segment);
      stepsCompleted++;
      await sleep(tick * 4);
    }
  } catch (error) {
    failure = error;
  } finally {
    emitSimReport(doc, { error: failure, stepsCompleted });
  }
  if (failure) throw failure;
}

// ---------------------------------------------------------------------------
// Test hooks (stable surface for headless drivers)

window.__jtApp = {
  entries: () => engine.entries,
  ask: () => state.pendingAsk,
  resolveAsk,
  inbox: () => inbox,
  syncOpen: () => sync.open(),
  syncJoin: (code) => sync.join(code),
  syncSendLatest: () => {
    const latest = [...engine.entries].reverse().find((e) => e.kind === "act" && !e.undone);
    return latest ? sendEntry(latest.id) : null;
  },
  syncState: () => sync.state,
  engineKind: () => state.engineKind,
  sheet: () => currentSheet(),
  setSheet,
  // shell hooks (headless drivers)
  view: () => document.body.dataset.view,
  showView: (v) => shell?.show(v),
  registry: verbRegistry,
  currentDoc: () => state.doc,
  micState: () => mic.state,
  exportData: () => shell?.exportData(),
  voiceSegment: (text) => onFinalSegment(text),
  follow: (text, latestSegment) => onInterim(text, latestSegment),
  perform: (act, blockIndex, opts) => {
    const verb = verbRegistry.resolve(act);
    return executeVerb(verb?.id ?? act, {
      blockIndex,
      modality: "pointer",
      evidence: "test hook",
      ...opts,
    });
  },
  spaces: {
    feed: () => shell?.spaceFeed() ?? [],
    personSpaces: () => shell?.personSpaces() ?? [],
    sendEntry: (entry, spaceId) => shell?.sendEntryToSpace(entry, spaceId),
    placeMoment: (moment, spaceId, options) => shell?.placeMomentInSpace(moment, spaceId, options),
  },
  math: {
    active: () => mathState.active,
    expression: () => mathState.expression,
    kept: () => mathState.kept,
    segment: (text) => onFinalSegment(text),
    keep: (modality = "pointer") => executeVerb("math-keep", { modality }),
  },
  currentBlock: () => state.currentBlock,
  addDocument,
  openDocument: (doc) => executeVerb("open-document", { document: doc, options: { navigate: false } }),
  segment: (text) => onFinalSegment(text),
  position: {
    read: () => (state.doc ? positionForDoc(state.doc) : null),
    flush: () => positionMemory.flushAll(),
  },
};

// ---------------------------------------------------------------------------
// Boot

async function boot() {
  if (await mountGlassDevRoute()) {
    window.__jtApp.booted = true;
    return;
  }
  shell = initShell({
    settings,
    SIM,
    engineState: () => ({ kind: state.engineKind, mode: ENGINE_MODE }),
    currentDoc: () => state.doc,
    getDocs,
    getSpaceFeed,
    putSpaceFeed,
    putDoc,
    getRecords,
    getPositions,
    positionForDoc,
    relativeReadTime,
    getInbox: () => inbox,
    entryNode,
    openDocument: (doc) =>
      openDocument(doc, { modality: "pointer", returnReason: "opened from home" }),
    ingestFile,
    addIngested,
    addDocument,
    ingestPaste,
    starterDoc: STARTER_DOC,
    startMic,
    micState: () => mic.state,
    setStatus,
    shortDigest,
    fmtBytes,
    fmtTime,
    setSheet,
    momentForEntry: momentForKeptEntry,
    spacesChanged: () => {
      renderHistory(engine.entries);
      renderInbox();
    },
    executeVerb,
  });

  try {
    await shell.loadSpaceFeed();
  } catch {
    /* first run */
  }

  try {
    for (const item of await getInbox()) inbox.push(item);
    if (inbox.length) renderInbox();
  } catch {
    /* first run */
  }
  if (SIM) {
    settings.set("welcomed", true);
    shell.show("read", { silent: true });
    window.__jtApp.booted = true;
    await startSim();
    return;
  }

  const docs = await getDocs();
  if (docs.length) {
    const latest = docs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    await openDocument(latest, {
      navigate: false,
      modality: "pointer",
      returnReason: "page reopened",
    });
  } else {
    renderDocHead(null); // designed empty reading surface
    await refreshLibrary();
  }

  if (!settings.welcomed) {
    shell.show("welcome", { silent: true });
    setStatus(false, "welcome");
  } else {
    shell.route(); // honor the hash, or land home
    if (settings.mic === "on") startMic();
    else setMicState("off", "voice is off — reading works; speaking waits for you", false);
  }
  window.__jtApp.booted = true;
}

boot();
