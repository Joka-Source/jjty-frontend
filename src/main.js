// jt — you open your document, you speak, and the thing you meant happens,
// with a record you can inspect and undo. One mic permission; after that,
// speaking is the interface.
//
// Live path: webkitSpeechRecognition, continuous + interim. Reading aloud
// glides the highlight to the block you're reading (src/match.js). A spoken
// cue ("highlight this", "mark this important", "note that ...", "undo")
// performs an act at the current block; every act writes a cursor + receipt
// pair (schema-pure, see contracts/) to IndexedDB.
//
// Sim path (?sim=1): a scripted transcript drives the exact same pipeline for
// micless testing; ?fast=1 compresses time. Results are exposed on
// window.__jt and serialized into a #jt-report DOM node for headless runs.

import "./style.css";
import { tokenize, matchTranscript } from "./match.js";
import { splitParagraphs, titleFrom, STARTER_DOC } from "./doc.js";
import { parseCommand } from "./commands.js";
import { createActEngine } from "./acts.js";
import { putDoc, getDocs } from "./db.js";
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

const params = new URLSearchParams(location.search);
const SIM = params.get("sim") === "1";

const state = {
  doc: null, // { id, title, text, createdAt, revision }
  blocks: [],
  docTokens: [],
  tokenBlock: [],
  lastIndex: -1,
  currentBlock: -1,
  lastMatch: null, // { score, blockIndex }
};

function setStatus(on, text) {
  statusDot.classList.toggle("on", on);
  statusText.textContent = text;
}

// ---------------------------------------------------------------------------
// Rendering

function renderDoc(doc) {
  for (const p of state.blocks) p.remove();
  Object.assign(state, {
    doc,
    blocks: [],
    docTokens: [],
    tokenBlock: [],
    lastIndex: -1,
    currentBlock: -1,
    lastMatch: null,
  });
  marker.classList.remove("on");
  const paragraphs = splitParagraphs(doc.text);
  for (const [i, text] of paragraphs.entries()) {
    const p = document.createElement("p");
    p.textContent = text;
    p.dataset.block = String(i);
    p.addEventListener("click", () => {
      state.currentBlock = i;
      moveMarker(i);
    });
    article.appendChild(p);
    state.blocks.push(p);
    for (const tok of tokenize(text)) {
      state.docTokens.push(tok);
      state.tokenBlock.push(i);
    }
  }
}

function blockFor(match) {
  const counts = new Map();
  for (let i = match.start; i <= match.end; i++) {
    const b = state.tokenBlock[i];
    counts.set(b, (counts.get(b) ?? 0) + 1);
  }
  let best = -1;
  let bestCount = 0;
  for (const [b, c] of counts) {
    if (c > bestCount) {
      best = b;
      bestCount = c;
    }
  }
  return best;
}

function moveMarker(blockIdx) {
  const p = state.blocks[blockIdx];
  if (!p) return;
  marker.style.top = `${p.offsetTop - 8}px`;
  marker.style.height = `${p.offsetHeight + 16}px`;
  marker.classList.add("on");
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

function renderHistory(entries) {
  historyList.textContent = "";
  for (const e of [...entries].reverse()) {
    const li = document.createElement("li");
    li.className = `entry ${e.kind}${e.undone ? " struck" : ""}`;
    const head = document.createElement("div");
    head.className = "entry-head";
    const title = document.createElement("strong");
    title.textContent = `${ACT_TITLES[e.act] ?? e.act} — block ${e.blockIndex}`;
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
    }
    historyList.appendChild(li);
  }
}

// ---------------------------------------------------------------------------
// Act engine

const engine = createActEngine({
  getBlocks: () => state.blocks,
  getDoc: () => state.doc,
  onChange: renderHistory,
});

async function runCommand(cmd, modality = "voice") {
  if (cmd.type === "undo") {
    const done = await engine.undo(null, { modality, evidence: cmd.evidence });
    if (!done) setStatus(true, "nothing left to undo");
    return done;
  }
  if (state.currentBlock < 0) {
    setStatus(true, "read a line first so jt knows where you are");
    return null;
  }
  const matchedText = state.blocks[state.currentBlock]?.textContent?.slice(0, 120) ?? "";
  return engine.perform(cmd.type, state.currentBlock, {
    modality,
    evidence: cmd.evidence,
    confidence: state.lastMatch?.score ?? null,
    matchedText,
    noteText: cmd.noteText ?? "",
  });
}

// ---------------------------------------------------------------------------
// Transcript pipeline (shared by mic and sim)

function onInterim(fullText) {
  const m = matchTranscript(state.docTokens, fullText, {
    lastIndex: state.lastIndex >= 0 ? state.lastIndex : undefined,
  });
  if (!m) return;
  state.lastIndex = m.end;
  const b = blockFor(m);
  state.lastMatch = { score: m.score, blockIndex: b };
  if (window.__jt) window.__jt.matches.push({ block: b, score: +m.score.toFixed(3) });
  if (b !== state.currentBlock) {
    state.currentBlock = b;
    if (window.__jt) window.__jt.current = b;
    moveMarker(b);
    state.blocks[b].scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

async function onFinalSegment(segment) {
  const cmd = parseCommand(segment);
  if (cmd) {
    if (window.__jt) window.__jt.commands.push(cmd.type);
    await runCommand(cmd, "voice");
  }
}

// ---------------------------------------------------------------------------
// Documents: library, ingestion

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
    docList.appendChild(li);
  }
}

async function openDocument(doc) {
  renderDoc(doc);
  await engine.load(doc.id);
  await refreshLibrary();
  setStatus(true, `open: ${doc.title}`);
}

async function addDocument(text, nameHint = "") {
  const paragraphs = splitParagraphs(text);
  if (!paragraphs.length) return null;
  const doc = {
    id: rid("doc"),
    title: titleFrom(text, nameHint || "untitled"),
    text,
    createdAt: nowIso(),
    revision: 1,
  };
  await putDoc(doc);
  await openDocument(doc);
  return doc;
}

fileInput.addEventListener("change", async () => {
  const f = fileInput.files?.[0];
  if (f) await addDocument(await f.text(), f.name.replace(/\.(txt|md)$/i, ""));
  fileInput.value = "";
});

pasteAdd.addEventListener("click", async () => {
  if (pasteBox.value.trim()) {
    await addDocument(pasteBox.value);
    pasteBox.value = "";
  }
});

addEventListener("dragover", (e) => e.preventDefault());
addEventListener("drop", async (e) => {
  e.preventDefault();
  const f = e.dataTransfer?.files?.[0];
  if (!f) return;
  if (!/\.(txt|md)$/i.test(f.name) && !/^text\//.test(f.type)) return;
  await addDocument(await f.text(), f.name.replace(/\.(txt|md)$/i, ""));
});

addEventListener("resize", () => {
  if (state.currentBlock >= 0) moveMarker(state.currentBlock);
});

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
// automated verification. The script reads two passages, performs the three
// acts, then undoes the last one.

async function startSim() {
  const fast = params.get("fast") === "1";
  const tick = fast ? 12 : 300;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const doc = await addDocument(STARTER_DOC, "sim run");
  window.__jt = {
    sim: true,
    docId: doc.id,
    matches: [],
    commands: [],
    current: -1,
    done: false,
    records: [],
    report: null,
  };
  setStatus(true, "simulating speech (?sim=1)");

  // Deliberate mishearings the fuzzy matcher must absorb.
  const mishear = { grace: "grays", deposit: "the posit", inspection: "inspections" };
  const script = [
    { read: 3 }, // "Rent is due on the first..."
    { say: "highlight this" },
    { read: 4 }, // "The deposit is one months rent..."
    { say: "note that check the inspection date before move out" },
    { say: "mark this important" },
    { say: "undo" },
  ];

  let transcript = "";
  for (const step of script) {
    const words = step.read != null
      ? tokenize(state.blocks[step.read].textContent).map((w) => mishear[w] ?? w)
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
    matches: window.__jt.matches.length,
    blocksHit: [...new Set(window.__jt.matches.map((m) => m.block))],
    commands: window.__jt.commands,
    entries: entries.map((e) => ({
      id: e.id,
      kind: e.kind,
      act: e.act,
      blockIndex: e.blockIndex,
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
// Boot

async function boot() {
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
