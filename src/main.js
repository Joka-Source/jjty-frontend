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
import { tokenize, matchTranscript } from "./match.js";
import { splitParagraphs, titleFrom, STARTER_DOC } from "./doc.js";
import { IntentStream, toCommand, describeCandidate } from "./intents.js";
import { createMatchEngine, blockForRange } from "./engine.js";
import { createMarkerDriver, confirmRipple } from "./motion.js";
import { ingestText, ingestPaste, ingestPdfBrowser, shortDigest, fmtBytes } from "./ingest.js";
import { createSyncSurface } from "./sync.js";
import { createActEngine } from "./acts.js";
import { putDoc, getDocs, putInbox, getInbox } from "./db.js";
import { rid, nowIso } from "./records.js";

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

const params = new URLSearchParams(location.search);
const SIM = params.get("sim") === "1";
// wasm is the default engine — parity with the JS reference matcher is
// proven by test/parity.test.mjs; ?engine=js opts back into the reference.
const ENGINE_MODE = params.get("engine") === "js" ? "js" : "wasm";
const RELAY_URL = params.get("relay") || "ws://127.0.0.1:8787";

const state = {
  doc: null, // { id, title, text, blocks?, provenance?, createdAt, revision }
  blocks: [], // <p> elements
  blockTexts: [],
  docTokens: [],
  tokenBlock: [],
  currentBlock: -1,
  lastMatch: null, // { score, blockIndex }
  matcher: null, // js or wasm engine
  engineKind: "",
  pendingAsk: null, // { candidates, reason, evidence }
};

const markerDriver = createMarkerDriver(marker);
const intentStream = new IntentStream();

function setStatus(on, text) {
  statusDot.classList.toggle("on", on);
  statusText.textContent = text;
}

// ---------------------------------------------------------------------------
// Rendering

async function renderDoc(doc) {
  for (const p of state.blocks) p.remove();
  Object.assign(state, {
    doc,
    blocks: [],
    blockTexts: [],
    docTokens: [],
    tokenBlock: [],
    currentBlock: -1,
    lastMatch: null,
    matcher: null,
  });
  marker.classList.remove("on");
  markerDriver.stop();

  const blockDefs = doc.blocks?.length
    ? doc.blocks
    : splitParagraphs(doc.text).map((text) => ({ text, kind: "paragraph" }));

  for (const [i, def] of blockDefs.entries()) {
    const p = document.createElement("p");
    p.textContent = def.text;
    p.dataset.block = String(i);
    if (def.locator?.startsWith("page:")) {
      p.dataset.page = def.locator.slice(5);
      p.classList.add("paged");
    }
    p.addEventListener("click", () => {
      state.currentBlock = i;
      moveMarker(i);
    });
    article.appendChild(p);
    state.blocks.push(p);
    state.blockTexts.push(def.text);
    for (const tok of tokenize(def.text)) {
      state.docTokens.push(tok);
      state.tokenBlock.push(i);
    }
  }

  const { engine: m, kind, note } = await createMatchEngine(ENGINE_MODE, state.blockTexts);
  state.matcher = m;
  state.engineKind = kind;
  if (note) setStatus(true, note);
  if (window.__jt) window.__jt.engine = kind;
}

function moveMarker(blockIdx) {
  const p = state.blocks[blockIdx];
  if (!p) return;
  marker.classList.add("on");
  markerDriver.moveTo(p.offsetTop - 8, p.offsetHeight + 16);
}

// ---------------------------------------------------------------------------
// History panel

function fmtTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString();
  } catch {
    return iso;
  }
}

const ACT_TITLES = {
  highlight: "highlighted",
  important: "marked important",
  note: "note added",
  undo: "undone",
};

function spanLabel(e) {
  return e.blockEnd != null && e.blockEnd !== e.blockIndex
    ? `blocks ${e.blockIndex}–${e.blockEnd}`
    : `block ${e.blockIndex}`;
}

function renderHistory(entries) {
  historyList.textContent = "";
  for (const e of [...entries].reverse()) {
    const li = document.createElement("li");
    li.className = `entry ${e.kind}${e.undone ? " struck" : ""}`;
    const head = document.createElement("div");
    head.className = "entry-head";
    const title = document.createElement("strong");
    title.textContent = `${ACT_TITLES[e.act] ?? e.act} — ${spanLabel(e)}`;
    head.appendChild(title);
    const time = document.createElement("span");
    time.className = "entry-time";
    time.textContent = fmtTime(e.createdAt);
    head.appendChild(time);
    li.appendChild(head);

    const ev = document.createElement("div");
    ev.className = "entry-evidence";
    const bits = [];
    if (e.evidence) bits.push(`heard: “${e.evidence}”`);
    if (e.matchedText) bits.push(`matched: “${e.matchedText}”`);
    if (e.confidence != null) bits.push(`match ${Math.round(e.confidence * 100)}%`);
    if (e.noteText) bits.push(`note: “${e.noteText}”`);
    if (e.undoes) bits.push(`reverses ${e.undoes}`);
    ev.textContent = bits.join(" · ");
    li.appendChild(ev);

    const det = document.createElement("details");
    const sum = document.createElement("summary");
    sum.textContent = "full record";
    det.appendChild(sum);
    const pre = document.createElement("pre");
    pre.textContent = JSON.stringify({ cursor: e.cursor, receipt: e.receipt }, null, 2);
    det.appendChild(pre);
    li.appendChild(det);

    if (e.kind === "act" && !e.undone) {
      const btn = document.createElement("button");
      btn.className = "undo-btn";
      btn.textContent = "undo";
      btn.addEventListener("click", () =>
        engine.undo(e.id, { modality: "pointer", evidence: "undo button clicked" })
      );
      li.appendChild(btn);

      const send = document.createElement("button");
      send.className = "send-btn";
      send.textContent = "send";
      send.title = "send this act to the connected device";
      send.addEventListener("click", () => sendEntry(e.id));
      li.appendChild(send);
    }
    historyList.appendChild(li);
  }
}

// ---------------------------------------------------------------------------
// Act engine (acts confirm with a small physical disturbance — jt-water)

const engine = createActEngine({
  getBlocks: () => state.blocks,
  getDoc: () => state.doc,
  onChange: renderHistory,
  onApply: (p) => confirmRipple(p),
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

async function resolveAsk(i) {
  const ask = state.pendingAsk;
  if (!ask) return;
  const cand = ask.candidates[i];
  hideAsk();
  if (!cand || cand.type === "reading") return;
  await runCommand(toCommand(cand), "pointer");
}

async function runCommand(cmd, modality = "voice") {
  switch (cmd.type) {
    case "reading":
      return null; // the interim matcher already followed it
    case "ask":
      showAsk(cmd);
      return null;
    case "undo": {
      const done = await engine.undo(null, { modality, evidence: cmd.evidence });
      if (!done) setStatus(true, "nothing left to undo");
      return done;
    }
    case "show": {
      document.querySelector(".history")?.classList.add("attention");
      setTimeout(() => document.querySelector(".history")?.classList.remove("attention"), 1500);
      setStatus(true, `everything you have done is in the panel on the right (${engine.entries.length} so far)`);
      return null;
    }
    case "open": {
      const docs = await getDocs();
      const want = cmd.documentName.toLowerCase();
      const found = docs.find((d) => d.title.toLowerCase().includes(want));
      if (found) await openDocument(found);
      else setStatus(true, `no document called “${cmd.documentName}” here`);
      return null;
    }
    case "send":
      return sendSpoken(cmd);
    case "range": {
      const from = findAnchorBlock(cmd.fromAnchor, "head");
      const to = findAnchorBlock(cmd.toAnchor, "tail");
      if (from < 0 || to < 0) {
        setStatus(true, "couldn't find those words in the document");
        return null;
      }
      const lo = Math.min(from, to);
      const hi = Math.max(from, to);
      return engine.perform("highlight", lo, {
        blockEnd: hi,
        modality,
        evidence: cmd.evidence,
        confidence: cmd.confidence ?? null,
        matchedText: state.blockTexts[lo]?.slice(0, 120) ?? "",
      });
    }
    case "act": {
      if (state.currentBlock < 0) {
        setStatus(true, "read a line first so jt knows where you are");
        return null;
      }
      const matchedText = state.blockTexts[state.currentBlock]?.slice(0, 120) ?? "";
      return engine.perform(cmd.act, state.currentBlock, {
        modality,
        evidence: cmd.evidence,
        confidence: state.lastMatch?.score ?? null,
        matchedText,
        noteText: cmd.noteText ?? "",
      });
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Transcript pipeline (shared by mic and sim)

function onInterim(fullText) {
  if (!state.matcher) return;
  const m = state.matcher.follow(fullText);
  if (!m || m.blockIndex == null || m.blockIndex < 0) return;
  const b = m.blockIndex;
  state.lastMatch = { score: m.confidence, blockIndex: b };
  if (window.__jt) window.__jt.matches.push({ block: b, score: +m.confidence.toFixed(3) });
  if (b !== state.currentBlock) {
    state.currentBlock = b;
    if (window.__jt) window.__jt.current = b;
    moveMarker(b);
    state.blocks[b].scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

async function onFinalSegment(segment) {
  const events = intentStream.push({ text: segment, final: true });
  for (const ev of events) {
    const cmd = toCommand(ev);
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
    btn.addEventListener("click", () => openDocument(d));
    li.appendChild(btn);
    if (d.provenance) {
      const prov = document.createElement("div");
      prov.className = "prov";
      const bits = [d.provenance.sourceKind];
      if (d.provenance.pageCount) bits.push(`${d.provenance.pageCount} pages`);
      bits.push(fmtBytes(d.provenance.byteSize));
      bits.push(shortDigest(d.provenance.contentDigest));
      prov.textContent = bits.filter(Boolean).join(" · ");
      prov.title = `${d.provenance.contentDigest}\ncaptured ${d.provenance.capturedAt}`;
      li.appendChild(prov);
    }
    docList.appendChild(li);
  }
}

async function openDocument(doc) {
  await renderDoc(doc);
  await engine.load(doc.id);
  await refreshLibrary();
  setStatus(true, `open: ${doc.title}`);
}

/** Store an IngestResult (jt-connectors shape) as a jt document. */
async function addIngested(result, nameHint = "") {
  if (!result.blocks.length) {
    setStatus(true, "nothing readable in that — try another file");
    return null;
  }
  const text = result.blocks.map((b) => b.text).join("\n\n");
  const doc = {
    id: rid("doc"),
    title: result.provenance.title || nameHint || titleFrom(text, "untitled"),
    text,
    blocks: result.blocks,
    provenance: result.provenance,
    warnings: result.warnings,
    createdAt: nowIso(),
    revision: 1,
  };
  await putDoc(doc);
  await openDocument(doc);
  if (result.warnings.length) setStatus(true, `opened with notes: ${result.warnings[0]}`);
  return doc;
}

async function addDocument(text, nameHint = "") {
  const result = await ingestText(text, { name: nameHint || undefined });
  return addIngested(result, nameHint);
}

async function ingestFile(f) {
  if (/\.pdf$/i.test(f.name) || f.type === "application/pdf") {
    setStatus(true, `reading ${f.name}…`);
    const pdfjs = await import("pdfjs-dist");
    const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const bytes = new Uint8Array(await f.arrayBuffer());
    const result = await ingestPdfBrowser(pdfjs, bytes, { name: f.name });
    return addIngested(result, f.name.replace(/\.pdf$/i, ""));
  }
  if (/\.(txt|md)$/i.test(f.name) || /^text\//.test(f.type)) {
    const result = await ingestText(await f.text(), { name: f.name });
    return addIngested(result, f.name.replace(/\.(txt|md)$/i, ""));
  }
  setStatus(true, "jt reads .txt, .md and .pdf for now");
  return null;
}

fileInput.addEventListener("change", async () => {
  const f = fileInput.files?.[0];
  if (f) await ingestFile(f);
  fileInput.value = "";
});

pasteAdd.addEventListener("click", async () => {
  if (pasteBox.value.trim()) {
    const result = await ingestPaste({ text: pasteBox.value });
    await addIngested(result);
    pasteBox.value = "";
  }
});

addEventListener("dragover", (e) => e.preventDefault());
addEventListener("drop", async (e) => {
  e.preventDefault();
  const f = e.dataTransfer?.files?.[0];
  if (f) await ingestFile(f);
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
    inboxList.appendChild(li);
  }
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

/** "send this to amber brook cedar" — pair by the spoken words, then send
 * the latest kept act. */
async function sendSpoken(cmd) {
  const latest = [...engine.entries].reverse().find((e) => e.kind === "act" && !e.undone);
  if (!latest) {
    setStatus(true, "nothing kept yet — highlight or note something first");
    return null;
  }
  try {
    if (!sync.state.paired) await sync.join(cmd.recipient);
    return await sendEntry(latest.id);
  } catch (err) {
    setStatus(true, String(err?.message ?? err));
    return null;
  }
}

// ---------------------------------------------------------------------------
// Live mic

function startMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    setStatus(false, "speech recognition unavailable — open in Chrome, or append ?sim=1");
    return;
  }
  const denied = () =>
    setStatus(false, "microphone denied — reload and allow, or append ?sim=1");
  navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then((stream) => {
      stream.getTracks().forEach((t) => t.stop());
      const rec = new SR();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-US";
      let alive = true;
      let finalized = 0; // how many final results we've already handled
      rec.onresult = (e) => {
        let full = "";
        for (const res of e.results) full += `${res[0].transcript} `;
        onInterim(full);
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
      rec.start();
      setStatus(true, "listening — read a line, then speak an act");
    })
    .catch(denied);
}

// ---------------------------------------------------------------------------
// Sim (?sim=1): scripted transcript through the same pipeline. ?fast=1 for
// automated verification. The script reads two passages, performs three
// acts, undoes the last, then speaks a genuinely ambiguous range highlight —
// which the app must ask about, never guess.

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
  for (const step of script) {
    const words = step.read != null
      ? tokenize(state.blockTexts[step.read]).map((w) => mishear[w] ?? w)
      : step.say.split(" ");
    let segment = "";
    for (const w of words) {
      segment += `${w} `;
      onInterim(transcript + segment);
      await sleep(tick);
    }
    transcript += segment;
    await onFinalSegment(segment);
    await sleep(tick * 4);
  }

  // Serialize the outcome for headless verification.
  const entries = engine.entries;
  window.__jt.records = entries;
  window.__jt.done = true;
  const report = {
    sim: true,
    docId: doc.id,
    engine: state.engineKind,
    provenance: doc.provenance ?? null,
    matches: window.__jt.matches.length,
    blocksHit: [...new Set(window.__jt.matches.map((m) => m.block))],
    commands: window.__jt.commands,
    ambiguities: window.__jt.ambiguities,
    askPending: !!state.pendingAsk,
    entries: entries.map((e) => ({
      id: e.id,
      kind: e.kind,
      act: e.act,
      blockIndex: e.blockIndex,
      blockEnd: e.blockEnd ?? null,
      undone: e.undone,
      undoes: e.undoes,
      confidence: e.confidence,
      evidence: e.evidence,
      cursor: e.cursor,
      receipt: e.receipt,
    })),
  };
  window.__jt.report = report;
  const node = document.createElement("script");
  node.type = "application/json";
  node.id = "jt-report";
  node.textContent = JSON.stringify(report);
  document.body.appendChild(node);
  setStatus(true, "sim complete — see the history panel");
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
};

// ---------------------------------------------------------------------------
// Boot

async function boot() {
  try {
    for (const item of await getInbox()) inbox.push(item);
    if (inbox.length) renderInbox();
  } catch {
    /* first run */
  }
  if (SIM) {
    await startSim();
    return;
  }
  const docs = await getDocs();
  if (docs.length) {
    const latest = docs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    await openDocument(latest);
  } else {
    await addDocument(STARTER_DOC, "a short lease");
  }
  startMic();
}

boot();
