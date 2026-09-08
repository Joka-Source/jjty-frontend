import {initReaderPageBrowser} from './reader-page-browser.js';
import {initReaderPageNavigation} from './reader-page-navigation.js';
import {exportCombinedPdf} from './pdf-combined.js';
import {reviewOrigin,reviewedCopyMetadata} from './reviewed-copy.js';
import {initAnnotationToolbar} from './annotation-toolbar.js';
import {selectionStillCurrent} from './pdf-selection.js';
import { createReaderSession } from './reader-session.js';
import { initReaderChrome } from './reader-chrome.js';
import { initBentoPanel } from "./bento-panel.js";
import { createCaptureJournal } from './capture-journal.js';
import { createCommandJournal } from './command-journal.js';
import { mountCommandJournal } from './command-journal-panel.js';
import { createProductAnalytics } from './product-analytics.js';
import { createVoiceCapture } from './voice-capture.js';
import { initVoiceSettings } from './voice-settings.js';
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
import "./reader-page-browser.css";
import { initServerPanel } from "./server-panel.js";
import { initPdfFormPanel } from "./pdf-form-panel.js";
import { initPdfContents } from "./pdf-contents.js";
import { initPdfReview } from "./pdf-review.js";
import { initLibraryBackupPanel } from "./library-backup-panel.js";
import { initDocumentRename } from "./document-rename.js";
import { initPdfAnnotationPanel } from "./pdf-annotation-panel.js";
import { ingestImage, mountImage } from "./images.js";
import "../vendor/katex/katex.min.css";
import "pdfjs-dist/web/pdf_viewer.css";
import katex from "../vendor/katex/katex.mjs";
import { tokenize, tokenizeWithSpans, TARGET_POLICY } from "./match.js";
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
  fitPdfScale,
  normalizePdfGeometry,
  renderPdfPages,
} from "./pdf-reading.js";
import { decideTarget, decidePhraseTarget } from "./targeting.js";
import { findRangeTargets } from "./range-targets.js";
import { createAnchor, resolveAnchor } from "./anchors.js";
import { contentDigest } from "./ingest.js";
import {
  putDoc,
  putDocIfAbsent,
  getDoc,
  getDocs,
  getRecords,
  putRecord,
  putRecords,
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

const commandJournal = createCommandJournal();
const captureJournal = createCaptureJournal(commandJournal);
const productAnalytics = createProductAnalytics(commandJournal);
mountCommandJournal(commandJournal, productAnalytics);

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
  rejectedReading: false,
  pendingReadingRejected: false,
  lastReadingMatch: null, // frozen when a final segment is ordinary reading
  matcher: null, // js or wasm engine
  engineKind: "",
  pendingAsk: null, // { candidates, reason, evidence }
  readerView: null,
  pdf: null, // source document + stable text/search model + current visual scale
};

let pageNavigation = null;
let pageBrowser = null;
let readerChrome = null;
let annotationTools = null;
let readerPersistence = '';
let switchingReader = false;
let readerTitles = new Map();
const readerSession = createReaderSession({onError(message){
  readerPersistence = message;
  readerChrome?.showPersistenceError(message);
}});
function renderReaderChrome(){
  pageNavigation?.refresh();
  const session = readerSession.snapshot();
  readerChrome?.render({tabs:session.tabs.map(id=>({id,title:readerTitles.get(id) || 'Document'})),activeId:state.doc?.id===session.activeId?session.activeId:null,workspace:state.readerView?.workspace || 'read',zoomMode:state.readerView?.zoomMode || 'fit-width',isPdf:state.doc?.provenance?.sourceKind==='pdf' && !!state.doc.sourceBytes});
  readerChrome?.showPersistenceError(readerPersistence);
  pageBrowser?.refresh();
}
function navigationState(){
  if(!state.pdf||!state.doc||document.body.dataset.view!=='read')return null;
  const pages=[...article.querySelectorAll(':scope > .pdf-page')],top=readerTop();if(!pages.length)return null;
  const current=pages.find(page=>page.getBoundingClientRect().bottom>top)||pages.at(-1);
  return {owner:`${state.doc.id}:${state.doc.provenance?.contentDigest}`,page:Number(current.dataset.page),total:pages.length,returnPage:state.readerView?.returnPlace?.pageNumber};
}
function navigateReaderPage(target,owner,options={}){return queueReader(()=>navigateReaderPageNow(target,owner,options));}
async function navigateReaderPageNow(target,owner,options={}){
  if(navigationState()?.owner!==owner)throw new Error('The document changed. Choose a page in the current document.');
  annotationTools?.beforeLeave();captureReaderView();const departure={...state.readerView};
  const place=target==='return'?departure.returnPlace:null;
  const pageNumber=place?.pageNumber??target;
  const pages=[...article.querySelectorAll(':scope > .pdf-page')];
  if(!Number.isInteger(pageNumber)||pageNumber<1||pageNumber>pages.length)throw new Error('That page is unavailable.');
  const samePage=target!=='return'&&!options.hit&&pageNumber===navigationState().page;
  if(place){await setPdfZoomNow(place.zoom,place.zoomMode,false,true);}
  if(navigationState()?.owner!==owner)throw new Error('Return to the Reader to continue this page jump.');
  cancelStagedRange();
  annotationTools?.clearSelection();getSelection()?.removeAllRanges();
  positionSelectionVersions.set(state.doc.id,(positionSelectionVersions.get(state.doc.id)??0)+1);
  const page=article.querySelector(`.pdf-page[data-page="${pageNumber}"]`);
  const blockIndex=options.hit?.blockIndex??(place&&state.blocks[place.blockIndex]?.closest('.pdf-page')===page?place.blockIndex:state.blocks.findIndex(block=>block?.closest('.pdf-page')===page));
  selectPdfBlock(blockIndex);if(blockIndex<0){marker.classList.remove('on');state.rejectedReading=true;}
  const hitRect=options.hit?domRangeForCharacters(state.blocks[blockIndex],options.hit.charStart,options.hit.charEnd)?.getBoundingClientRect():null;
  const offset=place?.pageOffset??(hitRect?(hitRect.top-page.getBoundingClientRect().top)/page.getBoundingClientRect().height:0);
  state.readerView={...state.readerView,pageNumber,pageOffset:offset,blockIndex,returnPlace:place?null:samePage?departure.returnPlace:departure.returnPlace??{pageNumber:departure.pageNumber,pageOffset:departure.pageOffset,blockIndex:departure.blockIndex,zoom:departure.zoom,zoomMode:departure.zoomMode}};
  pageNavigation?.refresh();
  const rect=page.getBoundingClientRect();scrollBy({top:rect.top+offset*rect.height-readerTop(),behavior:'instant'});
  readerSession.update(state.doc,state.readerView);if(options.focus!==false){setStatus(true,`${place?'Returned to':'Opened'} page ${pageNumber}.`);page.tabIndex=-1;page.focus({preventScroll:true});}pageNavigation?.refresh();
}

function readerTop(){
  const bottom=document.getElementById('reader-chrome')?.getBoundingClientRect().bottom;
  return Number.isFinite(bottom) && bottom>0 ? bottom+12 : 110;
}
function readerAvailableWidth(){
  if(document.body.dataset.view!=='read')return 0;
  const css=getComputedStyle(article);
  return Math.max(0,article.clientWidth-parseFloat(css.paddingLeft||0)-parseFloat(css.paddingRight||0)-2);
}
function captureReaderView({force=false,persist=true}={}){
  if((switchingReader && !force) || !state.doc || document.body.dataset.view!=='read')return;
  const top=readerTop();
  const pages=[...article.querySelectorAll(':scope > .pdf-page')];
  const page=pages.find(node=>node.getBoundingClientRect().bottom>top) || pages.at(-1);
  const rect=page?.getBoundingClientRect();
  const view={...state.readerView,blockIndex:state.currentBlock,search:state.pdf?.model.searchState().query || '',zoom:state.pdf?.model.zoom || 1};
  if(page && rect?.height){view.pageNumber=Number(page.dataset.page);view.pageOffset=(top-rect.top)/rect.height;}
  const tool=document.getElementById('bento-tool');if(tool)view.bentoTool=tool.value;
  state.readerView=view;if(persist)readerSession.update(state.doc,view);
}
function restoreReaderView(){
  if(!state.doc || !state.readerView || document.body.dataset.view!=='read')return;
  const view=state.readerView;
  const pages=[...article.querySelectorAll(':scope > .pdf-page')];
  const page=pages[Math.min(pages.length-1,Math.max(0,view.pageNumber-1))];
  if(page){const rect=page.getBoundingClientRect();window.scrollBy({top:rect.top+view.pageOffset*rect.height-readerTop(),behavior:'auto'});}
  else if(view.blockIndex>=0)state.blocks[view.blockIndex]?.scrollIntoView({block:'start',behavior:'auto'});
  const tool=document.getElementById('bento-tool');
  if(tool && [...tool.options].some(option=>option.value===view.bentoTool))tool.value=view.bentoTool;
}
let readerScrollTimer;
addEventListener('scroll',()=>{clearTimeout(readerScrollTimer);readerScrollTimer=setTimeout(captureReaderView,400);},{passive:true});
addEventListener('pagehide',captureReaderView);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')captureReaderView();});

const mathState = {
  active: false,
  expression: null,
  kept: [],
};

const markerDriver = createMarkerDriver(marker, markerMedium);
const positionMemory = createPositionMemory({ save: putPosition, load: getPosition });
const positionSelectionVersions = new Map();
const intentStream = new IntentStream();
let shell = null; // the surface router (initShell) — set during boot

let stagedRange = null;
let rangeGeneration = 0;
let selectionSerial = 0;
const rangeCancel = document.createElement('button');
rangeCancel.id = 'cancel-voice-selection';
rangeCancel.type = 'button';
rangeCancel.textContent = 'Cancel selection';
rangeCancel.hidden = true;
rangeCancel.className = 'voice-toggle';
const voiceFeedback = document.createElement('section');
voiceFeedback.id = 'voice-feedback';
voiceFeedback.setAttribute('aria-label', 'Voice feedback');
voiceFeedback.hidden = true;
const selectionStatus = document.createElement('p');
selectionStatus.setAttribute('role', 'status');
const heardText = document.createElement('p');
heardText.id = 'voice-heard';
voiceFeedback.append(selectionStatus, heardText, rangeCancel);
article.before(voiceFeedback);
function showHeard(text, final = false) {
  const words = String(text).trim();
  heardText.textContent = words ? `${final ? 'Heard' : 'Hearing'}: ${words.slice(-160)}` : '';
  heardText.hidden = !words;
  voiceFeedback.hidden = !words && !stagedRange;
}
rangeCancel.addEventListener('click', () => cancelStagedRange(true));
addEventListener('keydown', event => {
  if (event.key === 'Escape' && stagedRange) cancelStagedRange(true);
});
function cancelStagedRange(announce = false, invalidateQueue = true) {
  const hadRange = !!stagedRange;
  stagedRange = null;
  if (invalidateQueue) rangeGeneration++;
  rangeCancel.hidden = true;
  selectionStatus.textContent = '';
  selectionStatus.hidden = true;
  voiceFeedback.hidden = !heardText.textContent;
  if (state.pendingAsk?.args?.stagedGeneration != null) hideAsk();
  if (announce && hadRange) setStatus(true, 'Selection cancelled — nothing highlighted.');
}
function parseStagedRange(text) {
  const clean = String(text).trim().replace(/[.!?]+$/, '');
  if (/^(?:cancel|stop) (?:selection|highlighting|highlight|range)$/i.test(clean)) return {type:'cancel'};
  const start = /^(?:start|begin) highlighting(?: (?:from|at))?(?: (.+))?$/i.exec(clean);
  if (start) return {type:'start', phrase:start[1]?.trim()};
  const end = /^(?:till|until|up to|end highlighting at) (.+)$/i.exec(clean);
  return end ? {type:'end', phrase:end[1].trim(), explicit:/^end highlighting at /i.test(clean)} : null;
}
function rangeSource() { return state.blockTexts.join('\n\n'); }
async function handleStagedRange(command, snapshot, evidence) {
  if (command.type === 'cancel') { cancelStagedRange(true, false); return; }
  if (snapshot.rangeGeneration !== rangeGeneration || snapshot.docId !== state.doc?.id || snapshot.rangeSource !== rangeSource()) return;
  if (command.type === 'start') {
    cancelStagedRange(false, false);
    hideAsk();
    let phrase = command.phrase;
    let target = null;
    if (!phrase || /^(?:here|this|this term)$/i.test(phrase)) {
      target = snapshot.match?.target;
      if (!target || snapshot.match.score < 0.78) {
        setStatus(true, 'Read the starting words first, or say “start highlighting from” followed by the exact words.'); return;
      }
      phrase = target.quotedText;
    }
    const candidates = findRangeTargets(state.blockTexts, phrase);
    if (!candidates.length) { setStatus(true, 'The starting words were not found — say the exact words in the document.'); return; }
    if (target && !candidates.some(c => c.blockIndex === target.blockIndex && c.tokenStart === target.tokenStart && c.tokenEnd === target.tokenEnd)) return;
    stagedRange = {docId:state.doc.id, source:rangeSource(), fromAnchor:phrase, rangeStart:target, generation:++selectionSerial};
    const visibleStart = target ?? (candidates.length === 1 ? candidates[0] : null);
    if (visibleStart) {
      state.currentBlock = visibleStart.blockIndex;
      const start = state.tokenMeta.findIndex(t => t.blockIndex === visibleStart.blockIndex && t.tokenIndex === visibleStart.tokenStart);
      const end = state.tokenMeta.findIndex(t => t.blockIndex === visibleStart.blockIndex && t.tokenIndex === visibleStart.tokenEnd);
      state.lastMatch = {score:1, blockIndex:visibleStart.blockIndex, start, end, target:visibleStart, candidates:[{...visibleStart,score:1}]};
      state.lastReadingMatch = state.lastMatch;
      state.rejectedReading = false;
      state.pendingReadingRejected = false;
      moveMarker(visibleStart.blockIndex, visibleStart);
      state.blocks[visibleStart.blockIndex]?.scrollIntoView({behavior:'smooth',block:'center'});
      rememberPosition(visibleStart.blockIndex);
    }
    rangeCancel.hidden = false;
    setStatus(true, 'Start saved');
    return;
  }
  if (!stagedRange) { setStatus(true, 'Choose a start first — say “start highlighting from” and the starting words.'); return; }
  const selection = stagedRange;
  if (selection.docId !== state.doc?.id || selection.source !== rangeSource()) { cancelStagedRange(true); return; }
  await executeVerb('highlight-range', {
    fromAnchor:selection.fromAnchor, toAnchor:command.phrase, rangeStart:selection.rangeStart,
    rangeDocumentId:selection.docId, stagedSource:selection.source, stagedGeneration:selection.generation,
    modality:'voice', evidence, traceId:snapshot.traceId,
  });
}

function setStatus(on, text) {
  statusDot.classList.toggle("on", on);
  statusText.textContent = text;
  selectionStatus.textContent = stagedRange ? `Start saved: “${stagedRange.fromAnchor}”. Say “until” and the ending words.` : '';
  selectionStatus.hidden = !stagedRange;
  voiceFeedback.hidden = !stagedRange && !heardText.textContent;
}

function blockCountOf(doc) {
  return doc?.blocks?.length || splitParagraphs(doc?.text ?? "").length;
}

function rememberPosition(blockIndex) {
  if (!state.doc) return;
  // Even selecting a blank PDF page supersedes a pending saved-position restore.
  positionSelectionVersions.set(state.doc.id, (positionSelectionVersions.get(state.doc.id) ?? 0) + 1);
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
  state.rejectedReading = false;
  state.pendingReadingRejected = false;
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
  const model = createPdfReadingModel({ pages, zoom: scale, minZoom: 0.05 });
  const pdfEngine = doc.pdfEngine?.activeEngine === "mupdf"
    ? await selectAvailablePdfEngine({ pdfjs })
    : selectPdfEngine({ pdfjs });
  const { loadingTask, document: pdfDocument, report, readContents } = await pdfEngine.open(
    pdfSourceBytes(doc.sourceBytes),
  );
  try{
  const pageWidths=[];
  for(let number=1;number<=pdfDocument.numPages;number++){
    const page=await pdfDocument.getPage(number);pageWidths.push(page.getViewport({scale:1}).width);
  }
  if(state.readerView?.zoomMode==='fit-width'){
    const fit=fitPdfScale(readerAvailableWidth(),pageWidths);if(fit!==null)model.setZoom(fit);
  }
  const blocks = await renderPdfPages({
    pdfjs,
    pdfDocument,
    container,
    pages: model.pages,
    scale: model.zoom,
    onBlockClick: selectPdfBlock,
  });
  return { pdfjs, model, loadingTask, pdfDocument, blocks, report, readContents, pageWidths };
  }catch(error){await loadingTask?.destroy?.();throw error;}
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
  void pdfContents.setSource(null);
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

async function importReviewedPdf(bytes,name,metadata,options={}){
  const pdfjs=await loadPdfJs(),engine=await selectAvailablePdfEngine({pdfjs});
  const result=await ingestPdfBrowser(engine,bytes,{name});
  result.provenance={...result.provenance,derivedFrom:metadata.derivedFrom};
  return addIngested(result,name.replace(/\.pdf$/i,''),{id:metadata.id,...options});
}
const bentoPanel = initBentoPanel({
  getCurrentDocument: () => state.doc,
  getDocument: getDoc,
  importDocument: importReviewedPdf,
});
const serverPanel = initServerPanel({ saveDocument: putDoc });
const pdfContents=initPdfContents({sharedReturn:true,
  onNavigate(pageNumber,source){if(source!==state.pdf)return false;return pageBrowser?pageBrowser.navigate(pageNumber,navigationState()?.owner):navigateReaderPage(pageNumber,navigationState()?.owner);}
});
const pdfReview = initPdfReview({async saveCopy(bytes,name,origin,kind,{isCurrent}){
  const metadata=await reviewedCopyMetadata(bytes,origin,kind);
  const saved=await importReviewedPdf(bytes,name,metadata,{openIf:isCurrent});
  if(!saved)throw new Error('This copy could not be added to the library.');
  return saved;
}});
initLibraryBackupPanel({refresh: refreshLibrary});
const documentRename=initDocumentRename({onRenamed:async doc=>{
  if(state.doc?.id===doc.id && (state.doc.titleRevision??0)<=(doc.titleRevision??0)){
    state.doc.title=doc.title;state.doc.titleRevision=doc.titleRevision;renderDocHead(state.doc);
  }
  await refreshLibrary();
}});
const pdfFormPanel = initPdfFormPanel({ saveDocument: putDoc, getRecords, review: pdfReview });
const pdfAnnotationPanel = initPdfAnnotationPanel({ getRecords, review: pdfReview });
let unmountImage = null;
async function renderDoc(doc) {
  cancelStagedRange();
  showHeard('');
  documentRename.setDocument(null);
  hideAsk();
  serverPanel.setDocument(null);
  void pdfFormPanel.setDocument(null);
  pdfAnnotationPanel.setDocument(null);
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
    rejectedReading: false,
    pendingReadingRejected: false,
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
      state.pdf = await createPdfSurface(doc, blockDefs, article, state.readerView?.zoom ?? 1);
      void pdfContents.setSource(state.pdf);
      state.blocks = state.pdf.blocks;
      state.blockTexts = [...state.pdf.model.blockTexts];
      article.classList.add("pdf-document");
      pdfTools.hidden = false;
      pdfZoomValue.textContent = `${Math.round(state.pdf.model.zoom * 100)}%`;
      pdfZoomOut.disabled = state.pdf.model.zoom <= 0.05;
      pdfZoomIn.disabled = state.pdf.model.zoom >= 2.5;
      pdfMessage.textContent = doc.pdfEngine?.activeEngine
        && state.pdf.report.activeEngine !== doc.pdfEngine.activeEngine
        ? "MuPDF is unavailable here, so this PDF is being shown with PDF.js."
        : doc.refusal?.kind==="image-only"?"This PDF has no selectable text. You can still view its pages.":doc.refusal?.message ?? "";
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

function setPdfZoom(nextZoom,mode='custom'){
  const source=state.pdf;
  return queueReader(()=>source===state.pdf ? setPdfZoomNow(nextZoom,mode) : undefined);
}
async function setPdfZoomNow(nextZoom,mode='custom',preserveView=false,throwOnFailure=false) {
  annotationTools?.beforeLeave();
  if (!state.pdf) return;
  const source=state.pdf;
  if(!preserveView)captureReaderView();
  if(mode==='fit-width'){nextZoom=fitPdfScale(readerAvailableWidth(),source.pageWidths);if(nextZoom===null)return;}
  const previousView={...state.readerView},previousBlocks=state.blocks,previousPages=[...article.querySelectorAll(':scope > .pdf-page')];
  state.readerView={...state.readerView,zoomMode:mode};
  const previousZoom = state.pdf.model.zoom;
  const zoom = state.pdf.model.setZoom(nextZoom);
  if (zoom === previousZoom) {if(!preserveView)captureReaderView();renderReaderChrome();return;}
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
    source.blocks = blocks;
    await engine.load(state.doc.id);
    const afterTop = state.blocks[heldIndex]?.getBoundingClientRect().top ?? null;
    if (beforeTop !== null && afterTop !== null) {
      window.scrollBy({ top: afterTop - beforeTop, left: 0, behavior: "auto" });
    }
    if (Number.isInteger(heldIndex) && heldIndex >= 0) moveMarker(heldIndex);
    showPdfSearchState(state.pdf.model.searchState(), { scroll: false });
    pdfZoomValue.textContent = `${Math.round(zoom * 100)}%`;
    serverPanel.setDocument(state.doc, state.pdf);
  } catch (error) {
    for(const page of article.querySelectorAll(':scope > .pdf-page'))page.remove();article.append(...previousPages);
    state.blocks=previousBlocks;source.blocks=previousBlocks;state.readerView=previousView;
    state.pdf.model.setZoom(previousZoom);showPdfSearchState(state.pdf.model.searchState(),{scroll:false});pdfZoomValue.textContent=`${Math.round(previousZoom*100)}%`;
    setStatus(true, `PDF zoom failed: ${error?.message ?? error}`);
    if(throwOnFailure)throw error;
  } finally {
    restoreReaderView();captureReaderView();renderReaderChrome();
    pdfZoomOut.disabled = state.pdf.model.zoom <= 0.05;
    pdfZoomIn.disabled = state.pdf.model.zoom >= 2.5;
  }
}

pdfZoomOut.addEventListener("click", () => void reportReaderFailure(setPdfZoom(state.pdf?.model.zoom - 0.25)));
pdfZoomIn.addEventListener("click", () => void reportReaderFailure(setPdfZoom(state.pdf?.model.zoom + 0.25)));
let searchRequest=0;
function searchReader(kind){
  const source=state.pdf,owner=navigationState()?.owner,query=pdfSearchInput.value,version=kind==='query'?++searchRequest:searchRequest;
  return queueReader(async()=>{
    if(source!==state.pdf||!owner||owner!==navigationState()?.owner||version!==searchRequest)return;
    annotationTools?.beforeLeave();
    const result=kind==='query'?source.model.setSearchQuery(query):kind==='next'?source.model.nextSearchHit():source.model.previousSearchHit();
    if(result.hit){
      const page=state.blocks[result.hit.blockIndex]?.closest('.pdf-page');
      if(page)await navigateReaderPageNow(Number(page.dataset.page),owner,{hit:result.hit,focus:false});
    }
    if(source!==state.pdf||owner!==navigationState()?.owner||version!==searchRequest)return;
    showPdfSearchState(result,{scroll:false});captureReaderView();
  }).catch(error=>{if(source===state.pdf&&version===searchRequest){pdfSearchInput.value=source.model.searchState().query;setStatus(true,error.message||'Search could not move to this result.');}});
}
pdfSearchInput.addEventListener('input',()=>void searchReader('query'));
pdfSearchPrevious.addEventListener('click',()=>void searchReader('previous'));
pdfSearchNext.addEventListener('click',()=>void searchReader('next'));


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
function entryNode(e, { onUndo, onSend, onJump } = {}) {
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

  if (onJump && e.anchor && e.kind === "act" && !e.undone) {
    const jump = document.createElement("button");
    jump.className = "jump-btn";
    jump.textContent = "Go to passage";
    jump.addEventListener("click", () => onJump(e));
    li.appendChild(jump);
  }

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
  annotationTools?.refresh();
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
  setStatus(true, decision.matchType === 'suggestion'
    ? "Did you mean these words? Choose a passage to highlight."
    : "I found more than one possible passage — pick the words you mean");
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
  if (ask.kind === 'range-target') {
    const candidate=ask.candidates[i];hideAsk();
    if(candidate && state.doc?.id===ask.args.rangeDocumentId){
      return executeVerb(ask.verbId,{...ask.args,[ask.endpoint]:candidate,
        rangeChoices:[...(ask.args.rangeChoices || []),ask.labels[i]],
        rangeAlternatives:[...(ask.args.rangeAlternatives || []),...ask.labels]});
    }
    return;
  }
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
  const traceId = args.traceId ?? args.voiceTarget?.traceId;
  if (traceId) commandJournal.record(traceId,{stage:'target',status:'matched',intent:verbId,blockIndex:target?.blockIndex ?? args.blockIndex ?? state.currentBlock,tokenStart:target?.tokenStart ?? args.tokenStart,tokenEnd:target?.tokenEnd ?? args.tokenEnd});
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
  if (args.targetPhrase && !args.target && !Number.isInteger(args.blockIndex)) {
    const decision = decidePhraseTarget(state.blockTexts,args.targetPhrase);
    const traceId = args.traceId ?? args.voiceTarget?.traceId;
    if (traceId) commandJournal.record(traceId,{stage:'target',status:decision.kind==='commit'?'matched':decision.kind==='ask'?'ambiguous':'missing',intent:verbId});
    if (decision.kind === 'ask') {
      showTargetAsk({...args,verbId},args.modality,decision);
      return null;
    }
    if (decision.kind === 'none') {
      setStatus(true,'Those named words were not found. Say the words shown in the document, or select them first.');
      return null;
    }
    return performActAtTarget(verbId,args,decision.target);
  }
  if (args.target || Number.isInteger(args.blockIndex)) {
    return performActAtTarget(verbId, args, args.target ?? null, args.targetChoice ?? null);
  }
  if (args.voiceTarget?.rejectedReading) {
    emitCommandResult(verbId, 'none', 'The most recent reading did not match a passage.');
    setStatus(true, 'Those words did not match — read the passage again or select it before highlighting.');
    return null;
  }
  const targetMatch = args.voiceTarget ? args.voiceTarget.match : state.lastReadingMatch ?? state.lastMatch;
  const targetBlock = targetMatch?.blockIndex ?? args.voiceTarget?.blockIndex ?? state.currentBlock;
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
  const traceId = args.traceId ?? args.voiceTarget?.traceId;
  if (traceId) commandJournal.record(traceId,{stage:'target',status:decision.kind === 'ask'?'ambiguous':decision.kind === 'none'?'missing':'matched',intent:verbId});
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
  const doc=state.doc;if(!doc)return null;
  if (args.stagedGeneration != null && (args.stagedGeneration !== stagedRange?.generation || args.stagedSource !== rangeSource())) return null;
  const rangeArgs={...args,rangeDocumentId:args.rangeDocumentId ?? doc.id};
  if(rangeArgs.rangeDocumentId!==doc.id)return null;
  const allCandidates={rangeStart:findRangeTargets(state.blockTexts,args.fromAnchor),rangeEnd:findRangeTargets(state.blockTexts,args.toAnchor)};
  if(!allCandidates.rangeStart.length || !allCandidates.rangeEnd.length){
    setStatus(true,"I couldn't find the complete endpoint phrases — use the words shown in the document.");
    emitCommandResult(verbId,'none','A complete range endpoint was not found.');return null;
  }
  const endpoints={};
  for(const endpoint of ['rangeStart','rangeEnd']){
    const candidates=allCandidates[endpoint];
    const selected=args[endpoint];
    endpoints[endpoint]=selected && candidates.find(c=>c.blockIndex===selected.blockIndex && c.tokenStart===selected.tokenStart && c.tokenEnd===selected.tokenEnd);
    if(!endpoints[endpoint] && candidates.length===1)endpoints[endpoint]=candidates[0];
    if(!endpoints[endpoint] && candidates.length>1){
      if(candidates.length>20){setStatus(true,'Those words occur in many places — include more words for the range endpoint.');return null;}
      const labels=candidates.map(candidate=>{
        const page=/^page:(\d+)$/.exec(doc.blocks?.[candidate.blockIndex]?.locator || '');
        return `${page?`Page ${page[1]}`:`Passage ${candidate.blockIndex+1}`} · ${targetCandidateLabel(candidate)}`;
      });
      state.pendingAsk={kind:'range-target',verbId,args:{...rangeArgs,...endpoints},endpoint,candidates,labels};
      askOptions.replaceChildren();
      for(const [i,candidate] of candidates.entries()){
        const button=document.createElement('button');button.className='ask-option range-ask';button.dataset.candidate=String(i);
        button.textContent=labels[i];
        button.addEventListener('click',()=>resolveAsk(i));askOptions.append(button);
      }
      const cancel=document.createElement('button');cancel.className='ask-option ask-dismiss';cancel.textContent='Cancel range';cancel.addEventListener('click',()=>{if(args.stagedGeneration != null)cancelStagedRange(true);else hideAsk();});askOptions.append(cancel);
      askBox.hidden=false;setStatus(true,`Choose where the range ${endpoint==='rangeStart'?'starts':'ends'}.`);
      emitCommandResult(verbId,'ask','The complete endpoint phrase occurs more than once.');return null;
    }
  }
  const from=endpoints.rangeStart,to=endpoints.rangeEnd;
  if (!from || !to) {
    emitCommandResult(verbId, "none", "One or both spoken passage anchors were not found.", { confidence: args.confidence });
    setStatus(true, "couldn't find those words in the document");
    return null;
  }
  if(from.blockIndex>to.blockIndex || (from.blockIndex===to.blockIndex && (from.tokenStart>to.tokenStart || from.tokenEnd>to.tokenEnd))){
    setStatus(true,'The end comes before the start — say the range in reading order.');
    emitCommandResult(verbId,'none','Range endpoints were reversed.');return null;
  }
  const blockTexts=[...state.blockTexts],docDigest=doc.provenance?.contentDigest ?? await contentDigest(doc.text ?? blockTexts.join('\n\n'));
  if(state.doc?.id!==doc.id)return null;
  if (args.stagedGeneration != null && (args.stagedGeneration !== stagedRange?.generation || args.stagedSource !== rangeSource())) return null;
  const rangeAnchor={version:1,start:createAnchor({...from,blockTexts,docDigest}),end:createAnchor({...to,blockTexts,docDigest})};
  const ranged = await engine.perform(verbId, from.blockIndex, {
    rangeAnchor,
    blockEnd: to.blockIndex,
    modality: args.modality,
    evidence: args.evidence,
    confidence: args.confidence ?? null,
    matchedText: `${from.quotedText} … ${to.quotedText}`,
    targetChoice:args.rangeChoices?.length?{asked:true,reason:'Repeated range endpoint',candidates:args.rangeAlternatives || [],chosen:args.rangeChoices.join(' → ')}:null,
  });
  if (ranged && args.stagedGeneration != null && args.stagedGeneration === stagedRange?.generation) { cancelStagedRange(false, false); setStatus(true, "Passage highlighted — say undo to remove the whole selection."); }
  emitCommandResult(verbId, ranged ? "act" : "none", ranged ? "The requested passage range was highlighted." : "The passage range could not be highlighted.", { confidence: args.confidence });
  return ranged;
}

async function undoVerb(args) {
  if (args.entry) {
    const entry = args.entry;
    const updated = { ...entry, undone: true,
      cursor: { ...entry.cursor, undoAvailable: false } };
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
    await putRecords([updated, undoEntry]);
    Object.assign(entry, updated);
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
  return {kind:"history-opened"};
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

async function executeVerb(id, args = {}) {
  const traceId = args.traceId ?? args.voiceTarget?.traceId ?? commandJournal.begin({source:args.modality ?? 'pointer',rawText:args.evidence});
  const started = performance.now();
  commandJournal.record(traceId,{stage:'intent',status:'parsed',intent:id,expected:['highlight','highlight-range','annotate','mark-important','math-keep'].includes(id)?'durable-entry':id==='undo'?'undo':'unknown'});
  try {
    const result = await executeRegisteredVerb(id, verbExecutionContext, {...args,traceId});
    // These entries are returned only after the act engine's IndexedDB write.
    // A pre-save intentResult("act") is a targeting decision, never this receipt.
    const saved = !!(result?.id && result?.receipt && result?.cursor);
    const noEffect = result == null || result === false;
    commandJournal.record(traceId,{stage:'result',status:saved?'saved':noEffect?'no-op':'handled',intent:id,actual:saved?'durable-entry':noEffect?'none':result.kind==='history-opened'?'history':'unknown',durationMs:performance.now()-started});
    return result;
  } catch (error) {
    commandJournal.record(traceId,{stage:'result',status:'failed',intent:id,actual:'error',durationMs:performance.now()-started});
    if (error?.name !== "RecordSaveError") throw error;
    setStatus(false, "Could not save that change. Your saved work is unchanged. Try again.");
    return null;
  }
}

async function runCommand(cmd, modality = "voice", voiceTarget = undefined) {
  if (cmd.type === "reading") return null;
  if (cmd.type === "ask") {
    showAsk(cmd);
    return null;
  }
  if (!cmd.verbId) return null;
  return executeVerb(cmd.verbId, { ...cmd, modality, voiceTarget });
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
  if (active) cancelStagedRange();
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
  return doc?.provenance?.sourceKind === "spoken";
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

async function onMathFinalSegment(segment, traceId) {
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
    await executeVerb("math-keep", { modality: "voice", traceId });
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
  showHeard(latestSegment);
  const rangePreview = parseStagedRange(latestSegment);
  if (mathState.active || (rangePreview && (rangePreview.type !== 'end' || rangePreview.explicit || stagedRange))) return;
  // Recognition results include earlier finalized reading. A fresh command
  // must not replay that old text into the cursor after a pointer selection.
  const preview = new IntentStream().push({ text: latestSegment, final: true });
  if (preview.length && preview.every(event => toCommand(event).type !== "reading")) {
    // An incomplete command may have hidden the live guide as unmatched.
    // Once recognized as a command, restore its still-valid prior target.
    if (!state.rejectedReading && state.currentBlock >= 0) {
      if (state.pendingReadingRejected) setStatus(true, 'Following your selection');
      state.pendingReadingRejected = false;
      const match = state.lastReadingMatch ?? state.lastMatch;
      moveMarker(match?.blockIndex ?? state.currentBlock, match?.target ?? null);
    }
    return;
  }
  if (!state.matcher) return;
  emitGlass({ kind: "transcriptEvent", text: fullText, final: false, source: SIM ? "sim" : "speech" });
  const matchStarted = performance.now();
  const m = state.matcher.follow(fullText);
  emitGlass({ kind: "latencyMark", stage: "matcher", durationMs: performance.now() - matchStarted, budgetMs: 1 });
  if (!m || m.blockIndex == null || m.blockIndex < 0) {
    if (tokenize(latestSegment).length) {
      state.pendingReadingRejected = true;
      markerDriver.stop();
      marker.classList.remove('on');
      setStatus(true, 'Heard you, but those words do not match this document.');
    }
    return;
  }
  if (state.rejectedReading || state.pendingReadingRejected) setStatus(true, 'Following your reading');
  state.rejectedReading = false;
  state.pendingReadingRejected = false;
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

let speechQueue = Promise.resolve();
function onFinalSegment(segment, {source = SIM?'sim':'voice'} = {}) {
  const traceId = commandJournal.begin({source,rawText:segment,...(source==='voice'?{captureId:captureJournal.currentId()}: {})});
  showHeard(segment, true);
  emitGlass({ kind: "transcriptEvent", text: segment, final: true, source: SIM ? "sim" : "speech" });
  const intentStarted = performance.now();
  const stagedCommand = mathState.active ? null : parseStagedRange(segment);
  const events = intentStream.push({ text: segment, final: true });
  const hasReading = !mathState.active && (!stagedCommand || (stagedCommand.type === 'end' && !stagedCommand.explicit && !stagedRange)) && events.some(event => toCommand(event).type === 'reading');
  // Interim 'mark this' may become 'mark this important'. Only a finalized
  // reading rejection invalidates authority; command prefixes cannot erase it.
  if (hasReading && state.pendingReadingRejected) {
    state.rejectedReading = true;
    state.lastMatch = null;
    state.lastReadingMatch = null;
  }
  // Freeze reading evidence at recognition arrival, before a later interim
  // transcript can move the cursor while an earlier action is being saved.
  if (hasReading && state.lastMatch) {
    state.lastReadingMatch = state.lastMatch;
  }
  const snapshot = {
    traceId, rangeGeneration, rangeSource:rangeSource(), rejectedReading:state.rejectedReading,
    intentDuration: performance.now() - intentStarted,
    docId: state.doc?.id,
    match: stagedCommand?.type === 'start' ? state.lastMatch ?? state.lastReadingMatch : state.lastReadingMatch ?? state.lastMatch,
    blockIndex: state.currentBlock,
  };
  const run = speechQueue.then(() => {
    const documentAction = mathState.active || events.some(event => ["act", "range", "undo"].includes(toCommand(event).type));
    if (documentAction && snapshot.docId !== state.doc?.id) {
      commandJournal.record(traceId,{stage:'result',status:'rejected',actual:'none'});
      setStatus(false, "The document changed before that instruction ran. Read the passage and try again.");
      return null;
    }
    if (stagedCommand && (stagedCommand.type !== 'end' || stagedCommand.explicit || stagedRange)) {
      commandJournal.record(traceId,{stage:'intent',status:'parsed',intent:stagedCommand.type === 'start'?'start-highlighting':stagedCommand.type === 'end'?'end-highlighting':'stop-highlighting'});
      return handleStagedRange(stagedCommand, snapshot, segment).then(result=>{
        if(!commandJournal.list().find(row=>row.id===traceId)?.events.some(event=>event.stage==='result')) commandJournal.record(traceId,{stage:'result',status:stagedCommand.type==='cancel'?'cancelled':stagedRange?'pending':'no-op',actual:stagedCommand.type==='start'&&stagedRange?'range-start':'none'});
        return result;
      });
    }
    return processFinalSegment(segment, events, snapshot);
  });
  // One failed command must not poison the following commands.
  speechQueue = run.catch(() => { commandJournal.record(traceId,{stage:'result',status:'failed',actual:'error'}); });
  return run;
}

async function processFinalSegment(segment, events, snapshot) {
  const mathResult = await onMathFinalSegment(segment,snapshot.traceId);
  if (mathResult) {
    if(mathResult !== 'keep') commandJournal.record(snapshot.traceId,{stage:'result',status:'handled',actual:'unknown'});
    return;
  }
  emitGlass({ kind: "latencyMark", stage: "intent", durationMs: snapshot.intentDuration, budgetMs: 5 });
  for (const ev of events) {
    const cmd = toCommand(ev);
    commandJournal.record(snapshot.traceId,{stage:'intent',status:cmd.type === 'ask'?'ambiguous':'parsed',intent:cmd.verbId ?? (cmd.type === 'reading'?'reading':'unknown'),durationMs:snapshot.intentDuration});
    const classification = cmd.type === "reading" ? "reading" : cmd.type === "ask" ? "unresolved" : "command";
    emitGlass({
      kind: "segmentationDecision",
      segmentText: segment,
      classification,
      confidence: ev.confidence ?? (classification === "unresolved" ? 0.5 : 1),
      reason: cmd.reason ?? (classification === "reading" ? "This sounds like document text." : "This matches a known instruction."),
    });
    if (cmd.type === "reading") {
      commandJournal.record(snapshot.traceId,{stage:'result',status:'no-op',actual:'none',intent:'reading'});
      emitCommandResult(null, "reading", "No instruction was found.", { confidence: ev.confidence });
      continue;
    }
    if (cmd.type === "ask") {
      commandJournal.record(snapshot.traceId,{stage:'result',status:'pending',actual:'none'});
      emitCommandResult(null, "ask", cmd.reason, {
        confidence: ev.confidence,
        ambiguities: (cmd.candidates ?? []).map((candidate) => ({
          label: describeCandidate(candidate),
          confidence: candidate.confidence ?? ev.confidence ?? 0,
        })),
      });
    }
    if (cmd.type !== "reading" && window.__jt) window.__jt.commands.push(cmd.type === "act" ? cmd.act : cmd.type);
    await runCommand(cmd, "voice", snapshot);
  }
}

// ---------------------------------------------------------------------------
// Documents: library with provenance, ingestion via jt-connectors

async function refreshLibrary() {
  const docs = (await getDocs()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  readerTitles=new Map(docs.map(doc=>[doc.id,doc.title]));renderReaderChrome();
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
  documentRename.setDocument(doc);
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
  bentoPanel.update(doc);
  document.getElementById("download-original").hidden = !doc.sourceBytes;
  document.getElementById("review-original").hidden = !doc.sourceBytes || doc.provenance?.sourceKind !== "pdf";
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

function organizeDocument(){
  annotationTools?.beforeLeave();
  const parent=state.doc;if(!parent?.sourceBytes||parent.provenance?.sourceKind!=='pdf')return;
  const identity=reviewOrigin(parent),ownsReview=pdfReview.prepare('Including your saved highlights, notes and form answers…');
  return queueReader(async()=>{
    const isCurrent=()=>ownsReview()&&state.doc?.id===identity.documentId&&state.doc?.provenance?.contentDigest===identity.contentDigest;
    try{
      if(!isCurrent())return;
      await pdfFormPanel.flush(identity.documentId);
      if(!isCurrent())return;
      const source=await getDoc(identity.documentId);
      if(!isCurrent())return;
      if(!source||source.provenance?.contentDigest!==identity.contentDigest)throw new Error('The source changed. Reopen the document before organizing it.');
      const records=await getRecords(source.id);
      if(!isCurrent())return;
      const undone=new Set(records.filter(r=>r.docId===source.id&&r.act==='undo').map(r=>r.undoes));
      const hasMarks=records.some(r=>r.docId===source.id&&r.kind==='act'&&['highlight','note','important'].includes(r.act)&&!r.undone&&!undone.has(r.id));
      const hasForms=source.formDraft&&Object.keys(source.formDraft.values||{}).length>0;
      const bytes=hasMarks||hasForms?(await exportCombinedPdf({source,savedFormDraft:source.formDraft??null,committedRecords:records,allowFormOnly:true})).bytes:pdfSourceBytes(source.sourceBytes).slice();
      if(!isCurrent())return;
      await pdfReview.open(bytes,`${(source.provenance.name||source.title||'document').replace(/\.pdf$/i,'')}-organized.pdf`,{kind:hasMarks||hasForms?'saved-work':'original',origin:identity});
    }catch(error){if(ownsReview()){pdfReview.close();throw error;}}
  });
}

document.getElementById("review-original").addEventListener("click", () => {
  const doc = state.doc;
  if (!doc?.sourceBytes || doc.provenance?.sourceKind !== "pdf") return;
  pdfReview.open(pdfSourceBytes(doc.sourceBytes), doc.provenance?.name || `${doc.title}.pdf`, { kind: "original", origin:reviewOrigin(doc) });
});

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

let documentQueue = Promise.resolve();
function queueReader(task){
  const run=documentQueue.then(task);documentQueue=run.catch(()=>{});return run;
}
function openDocument(doc, options = {}) {return queueReader(()=>openDocumentNow(doc,options));}
async function openDocumentNow(doc,options={}){
  if(options.openIf&&!options.openIf())return doc;
  annotationTools?.beforeLeave();
  const session=readerSession.snapshot();
  captureReaderView();
  if(state.doc){await positionMemory.flush(state.doc.id);await pdfFormPanel.flush(state.doc.id);}
  if(options.openIf&&!options.openIf())return doc;
  const held=Object.hasOwn(session.views,doc.id);
  const selectionVersion=positionSelectionVersions.get(doc.id) ?? 0;
  const view=readerSession.get(doc);
  if(doc.provenance?.sourceKind!=='pdf' || !doc.sourceBytes)view.workspace='read';
  switchingReader=true;
  state.readerView=view;
  try{
    const result=await openDocumentContents(doc,options);
    if(!held || options.savedAnchor || options.requirePosition || (positionSelectionVersions.get(doc.id) ?? 0)!==selectionVersion)captureReaderView({force:true,persist:false});
    if(state.pdf){
      if(view.zoomMode==='fit-width')await setPdfZoomNow(null,'fit-width');
      pdfSearchInput.value=view.search;
      showPdfSearchState(state.pdf.model.setSearchQuery(view.search),{scroll:false});
    }
    readerTitles.set(doc.id,doc.title);readerSession.open(doc);readerSession.update(doc,state.readerView);
    renderReaderChrome();
    if(held && !options.savedAnchor && !options.requirePosition)restoreReaderView();
    return result;
  }catch(error){
    await releaseReader();shell?.show('home');renderReaderChrome();
    setStatus(true,`Could not open this document. Reopen it from Library to retry: ${error.message}`);throw error;
  }
  finally{switchingReader=false;}
}
async function activateReaderTab(id){
  return queueReader(async()=>{
    if(state.doc?.id===id && readerSession.snapshot().activeId===id){shell?.show('read');return;}
    const doc=await getDoc(id);
    if(!doc){setStatus(true,'This document is no longer available.');return;}
    return openDocumentNow(doc);
  });
}
async function closeReaderTab(id){
  return queueReader(async()=>{
    const session=readerSession.snapshot();if(!session.tabs.includes(id))return;
    if(session.activeId!==id){readerSession.close(id);renderReaderChrome();return;}
    annotationTools?.beforeLeave();
    captureReaderView();await positionMemory.flush(id);await pdfFormPanel.flush(id);
    const index=session.tabs.indexOf(id),remaining=session.tabs.filter(tab=>tab!==id);
    const next=remaining[Math.min(index,remaining.length-1)];
    if(next){const doc=await getDoc(next);if(!doc)throw new Error('The next document is unavailable.');await openDocumentNow(doc);}
    else{
      await releaseReader();
      shell?.show('home');
    }
    readerSession.close(id);renderReaderChrome();
  });
}
async function releaseReader(){
      cancelStagedRange();hideAsk();markerDriver.stop();marker.classList.remove('on');
      try{await state.pdf?.loadingTask?.destroy?.();}catch{/* A failed renderer must still release its UI. */}unmountImage?.();unmountImage=null;
      for(const block of state.blocks)block.remove();for(const page of article.querySelectorAll(':scope > .pdf-page'))page.remove();
      resetPdfTools();state.doc=null;state.pdf=null;state.blocks=[];state.blockTexts=[];state.currentBlock=-1;state.readerView=null;state.docTokens=[];state.tokenBlock=[];state.tokenMeta=[];state.lastMatch=null;state.lastReadingMatch=null;state.matcher=null;
      documentRename.setDocument(null);serverPanel.setDocument(null);await pdfFormPanel.setDocument(null);pdfAnnotationPanel.setDocument(null);renderDocHead(null);
}
function reportReaderFailure(promise){return promise.catch(error=>setStatus(true,error?.message || 'Could not change document.'));}


async function openDocumentContents(
  doc,
  {
    navigate = true,
    modality = "pointer",
    returnReason = "opened from documents",
    requirePosition = false,
    savedAnchor = null,
  } = {}
) {
  const selectionVersion = positionSelectionVersions.get(doc.id) ?? 0;
  await renderDoc(doc);
  // A queued open or source edit may carry a pre-rename document object.
  // Refresh only naming metadata; preserve that operation's content snapshot.
  const stored=await getDoc(doc.id);
  if((stored?.titleRevision??0)>(doc.titleRevision??0)){
    doc.title=stored.title;doc.titleRevision=stored.titleRevision;
  }
  await engine.load(doc.id);
  renderDocHead(doc);
  serverPanel.setDocument(doc, state.pdf);
  void pdfFormPanel.setDocument(doc);
  pdfAnnotationPanel.setDocument(doc);
  await refreshLibrary();
  if (narrowScreen.matches) setSheet(null); // picking a document closes the sheet
  if (navigate) shell?.show("read");
  if (savedAnchor) {
    if ((positionSelectionVersions.get(doc.id) ?? 0) !== selectionVersion) return null;
    const openedDocument = state.doc;
    const docDigest = doc.provenance?.contentDigest ?? await contentDigest(doc.text ?? state.blockTexts.join("\n\n"));
    if (state.doc !== openedDocument || state.doc?.id !== doc.id || (positionSelectionVersions.get(doc.id) ?? 0) !== selectionVersion) return null;
    const target = resolveAnchor(savedAnchor, { blockTexts: state.blockTexts, docDigest });
    if (target.arrival === "lost") {
      setStatus(true, "The saved words could not be located in this document.");
      return null;
    }
    state.currentBlock = target.blockIndex;
    state.lastMatch = null;
    state.lastReadingMatch = null;
    state.matcher?.reset();
    state.blocks[target.blockIndex]?.scrollIntoView({ block: "center" });
    moveMarker(target.blockIndex, target);
    setStatus(true, `Saved passage: “${target.quotedText}”`);
    return target;
  }
  const position = await positionForDoc(doc);
  if ((positionSelectionVersions.get(doc.id) ?? 0) !== selectionVersion) return null;
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
async function addIngested(result, nameHint = "", options = {}) {
  const viewableImagePdf = result.refusal?.kind === "image-only" && result.sourceBytes;
  const viewableImage = result.provenance.sourceKind === "image" && result.sourceBytes && result.imageSource;
  if (!result.blocks.length && !viewableImagePdf && !viewableImage) {
    setStatus(true, result.refusal?.message ?? "nothing readable in that — try another file");
    return null;
  }
  const text = result.blocks.map((b) => b.text).join("\n\n");
  let doc = {
    id: options.id || rid("doc"),
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
  if (options.id) doc = await putDocIfAbsent(doc);
  else await putDoc(doc);
  if(options.openIf&&!options.openIf()){try{await refreshLibrary();}catch{}return doc;}
  try {
    await openDocument(doc,{openIf:options.openIf});
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

const mic = { state: "off", audioHeld: false };

function setMicState(state, statusMsg, on = state === "listening") {
  mic.state = state;
  if (statusMsg) setStatus(on, statusMsg);
  if (SIM) return;
  const label = {
    off: "turn on voice",
    listening: "pause listening",
    paused: "resume listening",
    starting: "cancel voice",
    reconnecting: "pause listening",
    error: "retry voice",
    denied: "retry voice",
    'local-unavailable': "retry voice",
  }[state];
  voiceToggle.hidden = !label;
  if (label) {
    voiceToggle.textContent = label;
    voiceToggle.setAttribute('aria-label', label);
    voiceToggle.dataset.compactLabel = ({off:'Voice',listening:'Pause',paused:'Resume',starting:'Cancel',reconnecting:'Pause'})[state] || 'Retry voice';
  }
  shell?.micChanged(state);
}

const capture = createVoiceCapture({
  Recognition: window.SpeechRecognition || window.webkitSpeechRecognition,
  lang: () => settings.lang,
  processingMode: () => settings.voiceProcessing,
  acquireAudio: () => navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false}),
  onInterim,
  onFinal: onFinalSegment,
  onState: (state, reason, { audioHeld = false } = {}) => {
    captureJournal.record(state,reason,{audioHeld},settings.voiceProcessing);
    mic.audioHeld = audioHeld;
    if (['paused','off','denied','error','unavailable','local-unavailable'].includes(state)) { cancelStagedRange(); showHeard(''); }
    if (state === 'error' && reason?.startsWith('local-')) state = 'local-unavailable';
    const messages = {
      starting: "starting voice — waiting for the browser microphone",
      listening: "listening — read a line, then speak an act",
      reconnecting: "voice interrupted — reconnecting",
      paused: "paused — jt is not listening until you resume",
      denied: "microphone access is blocked — check this site's microphone permission, then retry",
      unavailable: "this browser cannot listen yet — reading still works",
      error: "voice stopped — check your microphone and connection, then retry",
      'local-unavailable': "on-device voice is unavailable for this language — check or download it in settings; no remote fallback",
    };
    if (state === "listening") settings.set("mic", "on");
    if (["paused", "denied", "error", "local-unavailable"].includes(state)) settings.set("mic", "off");
    const message = reason === "recognition-no-results"
      ? "speech was detected but no words came back — voice is off; try on-device speech in settings or retry"
      : audioHeld && state === "reconnecting"
      ? "microphone remains on — reconnecting recognition; pause to turn it off"
      : audioHeld && state === "starting"
        ? "microphone is on — starting recognition; cancel to turn it off"
        : messages[state];
    setMicState(state, message, state === "listening");
  },
});
function startMic() { capture.start(); }
function pauseMic() { capture.pause(); }
const voiceSettings = initVoiceSettings({settings, pause:pauseMic, Recognition:window.SpeechRecognition || window.webkitSpeechRecognition});
window.addEventListener("pagehide", () => {
  if (["starting", "listening", "reconnecting"].includes(mic.state)) pauseMic();
  else capture.dispose();
});
voiceToggle.addEventListener("click", () => {
  if (["starting", "listening", "reconnecting"].includes(mic.state)) pauseMic();
  else startMic();
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
  commandJournal,
  productAnalytics,
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
  micAudioHeld: () => mic.audioHeld,
  exportData: () => shell?.exportData(),
  voiceSegment: (text) => onFinalSegment(text,{source:'sim'}),
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
    segment: (text) => onFinalSegment(text,{source:'sim'}),
    keep: (modality = "pointer") => executeVerb("math-keep", { modality }),
  },
  readerSession: () => readerSession.snapshot(),
  currentBlock: () => state.currentBlock,
  addDocument,
  openDocument: (doc) => executeVerb("open-document", { document: doc, options: { navigate: false } }),
  segment: (text) => onFinalSegment(text,{source:'sim'}),
  position: {
    read: () => (state.doc ? positionForDoc(state.doc) : null),
    flush: () => positionMemory.flushAll(),
  },
};

// ---------------------------------------------------------------------------
// Boot

readerChrome=initReaderChrome({
  organize:organizeDocument,
  activate:id=>reportReaderFailure(activateReaderTab(id)),
  close:id=>closeReaderTab(id).catch(error=>{setStatus(true,error?.message || 'Could not close document.');throw error;}),
  setWorkspace:workspace=>{if(!state.doc)return;annotationTools?.beforeLeave();state.readerView={...state.readerView,workspace};readerSession.update(state.doc,state.readerView);renderReaderChrome();},
  fitWidth:()=>reportReaderFailure(setPdfZoom(null,'fit-width')),
});
pageNavigation=initReaderPageNavigation({read:navigationState,navigate:navigateReaderPage});
pageBrowser=initReaderPageBrowser({read:navigationState,navigate:navigateReaderPage});
annotationTools=initAnnotationToolbar({currentDoc:()=>state.doc,root:article,canUndo:()=>engine.entries.some(e=>e.kind==='act'&&!e.undone),
  run:(kind,target,noteText)=>{const owner=state.doc?.id;return queueReader(async()=>{
    if(state.doc?.id!==owner)throw new Error('The document changed. Try again in the current document.');
    if(kind==='undo')return executeVerb('undo',{modality:'pointer'});
    if(!selectionStillCurrent(target,state.doc,article))throw new Error('The document changed. Select its words again.');
    if(target.start.blockIndex!==target.end.blockIndex){
      if(kind!=='highlight')throw new Error('Select words on one page for this note.');
      return executeVerb('highlight-range',{fromAnchor:target.start.quotedText,toAnchor:target.end.quotedText,rangeStart:target.start,rangeEnd:target.end,rangeDocumentId:target.docId,modality:'pointer',evidence:'Selected PDF words'});
    }
    return executeVerb(kind,{...target.start,noteText,modality:'pointer',evidence:'Selected PDF words',matchedText:target.quote});
  });},review:()=>document.getElementById('pdf-annotation-preview').click(),
});
renderReaderChrome();
let readerResizeTimer;
addEventListener('resize',()=>{clearTimeout(readerResizeTimer);readerResizeTimer=setTimeout(()=>{if(state.readerView?.zoomMode==='fit-width')void reportReaderFailure(setPdfZoom(null,'fit-width'));},120);});

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
    onViewChange(next,prev){if(prev==='read' && next!==prev)captureReaderView();},
    afterViewChange(next,prev){if(next==='read' && prev!==next && !switchingReader)requestAnimationFrame(()=>{
      void reportReaderFailure(queueReader(async()=>{if(document.body.dataset.view!=='read')return;if(state.readerView?.zoomMode==='fit-width')await setPdfZoomNow(null,'fit-width',true);restoreReaderView();}));
    });},
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
    openSavedPassage: (doc, entry) => openDocument(doc, { savedAnchor: entry.anchor }),
    openDocument: (doc) =>
      openDocument(doc, { modality: "pointer", returnReason: "opened from home" }),
    ingestFile,
    addIngested,
    addDocument,
    ingestPaste,
    starterDoc: STARTER_DOC,
    startMic,
    voiceSettings,
    micState: () => mic.state,
    micAudioHeld: () => mic.audioHeld,
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
  readerTitles=new Map(docs.map(doc=>[doc.id,doc.title]));
  readerSession.reconcile(docs);renderReaderChrome();
  const restored=docs.find(doc=>doc.id===readerSession.snapshot().activeId);
  if(restored){await openDocument(restored,{navigate:false,modality:'pointer',returnReason:'page reopened'});}
  else{renderDocHead(null);await refreshLibrary();}

  if (!settings.welcomed) {
    setMicState("off", null, false);
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
