// jt — the shell. One coherent set of surfaces around the reading core:
//
//   welcome   first run only: what jt is, then the one microphone question
//   home      the library as the front door (ingest + provenance + empty state)
//   read      the existing reading surface (main.js owns it; untouched here)
//   history   everything that happened, across documents, undo everywhere
//   share     pairing in plain words + the inbox of arrived moments
//   spaces    the organizational layer (real store, honestly marked early)
//   settings  voice, motion, engine, data in/out, about
//   rooms     designed surfaces for what is not built yet
//
// Navigation is a hash router (#/home …) so every surface is a real,
// linkable place. Surface changes arrive on jt-water motion (surfaceArrive),
// not CSS easing. main.js calls initShell() with its live hooks and keeps
// owning the reading pipeline; nothing in here touches the matcher, the
// intent stream, or the sim.

import { surfaceArrive } from "./motion.js";
import { OrgStore, SPACE_KINDS, MEMBER_ROLES, ValidationError } from "./org.js";
import { LANGS, MOTION_LEVELS, loadPerson, savePerson, clearSettings } from "./settings.js";
import { nowIso } from "./records.js";
import { deriveRangeSegments } from "./anchors.js";
import { splitParagraphs } from "./doc.js";
import { contentDigest } from "./ingest.js";
import {
  documentFromSpaceFeedItem,
  makeSpaceFeedItem,
  resolveSpaceName as matchSpaceName,
} from "./space-flow.js";
import pkg from "../package.json" with { type: "json" };
import { renderCapabilities } from "./capabilities.js";
import { verbRegistry } from "./registry/index.js";

const VIEWS = ["welcome", "home", "read", "history", "share", "spaces", "settings", "capabilities", "rooms"];

const $ = (id) => document.getElementById(id);

export function initShell(ctx) {
  const { settings } = ctx;
  let view = "read";
  let org = OrgStore.load(localStorage);
  let person = loadPerson(localStorage);
  let feed = [];
  const saveOrg = () => org.save(localStorage);

  // --- routing -------------------------------------------------------------

  function sectionOf(v) {
    return v === "read" ? null : $(`view-${v}`);
  }

  function show(next, { silent = false, hash = null } = {}) {
    if (!VIEWS.includes(next)) next = "home";
    if (!settings.welcomed && !ctx.SIM) next = "welcome";
    const prev = view;
    ctx.onViewChange?.(next, prev);
    view = next;
    document.body.dataset.view = next;
    if (prev !== next) scrollTo(0, 0);
    for (const v of VIEWS) {
      const sec = sectionOf(v);
      if (sec) sec.hidden = v !== next;
    }
    for (const a of document.querySelectorAll("[data-view-link]")) {
      if (a.dataset.viewLink === next) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    }
    $("tab-home")?.classList.toggle("current", next === "home");
    ctx.setSheet(null);
    const wantHash = hash ?? (next === "read" ? "#/read" : `#/${next}`);
    if (location.hash !== wantHash) history.replaceState(null, "", wantHash);
    refresh(next);
    const sec = sectionOf(next);
    if (sec && !silent && prev !== next) surfaceArrive(sec);
    ctx.afterViewChange?.(next, prev);
  }

  function route() {
    const m = location.hash.match(/^#\/([a-z]+)(?:\/([a-z0-9-]+))?/);
    const next = m && VIEWS.includes(m[1]) && m[1] !== "welcome" ? m[1] : "home";
    if (next === "rooms" && m?.[2] && renderDesignedRoom(m[2])) {
      show("rooms", { silent: true, hash: `#/rooms/${m[2]}` });
      return;
    }
    show(next, { silent: true });
  }

  addEventListener("hashchange", () => {
    const m = location.hash.match(/^#\/([a-z]+)(?:\/([a-z0-9-]+))?/);
    const target = m ? m[1] : "home";
    if (target === "rooms" && m?.[2] && renderDesignedRoom(m[2])) {
      show("rooms", { hash: `#/rooms/${m[2]}` });
    } else if (target !== view || location.hash !== `#/${target}`) {
      show(target);
    }
  });

  function refresh(v) {
    if (v === "home") renderHome();
    if (v === "history") renderHistoryAll();
    if (v === "spaces") renderOrg();
    if (v === "settings") renderSettingsState();
    if (v === "capabilities") {
      renderCapabilities($("capability-list"), verbRegistry, { openRoom });
    }
  }

  function renderDesignedRoom(id) {
    const verb = verbRegistry.get(id);
    if (!verb || verb.status !== "designed") return false;
    const room = $("designed-room");
    room.textContent = "";
    const title = document.createElement("h2");
    title.textContent = id.replaceAll("-", " ");
    room.appendChild(title);
    const copy = document.createElement("p");
    copy.className = "hint";
    copy.textContent = verb.roomDescription;
    room.appendChild(copy);
    const state = document.createElement("p");
    state.className = "room-soon";
    state.textContent = "designed — not built. this room explains the intended work and does not pretend to run it.";
    room.appendChild(state);
    return true;
  }

  function openRoom({ id }) {
    if (!renderDesignedRoom(id)) throw new Error(`no designed room for ${id}`);
    show("rooms", { hash: `#/rooms/${id}` });
  }

  // --- welcome (first run) -------------------------------------------------

  $("welcome-next").addEventListener("click", () => {
    $("welcome-step-1").hidden = true;
    $("welcome-step-2").hidden = false;
    surfaceArrive($("welcome-step-2"));
  });
  const finishWelcome = () => {
    settings.set("welcomed", true);
    show("home");
  };
  $("welcome-mic").addEventListener("click", () => {
    ctx.startMic(); // the browser asks once; the answer is remembered
    finishWelcome();
  });
  $("welcome-skip").addEventListener("click", () => {
    settings.set("mic", "off");
    finishWelcome();
    ctx.setStatus(false, "voice is off — reading works; speaking waits for you");
  });

  // --- home ----------------------------------------------------------------

  let homeRender = 0;
  async function renderHome() {
    const renderId = ++homeRender;
    const docs = (await ctx.getDocs()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (renderId !== homeRender) return;
    const query = $("home-search").value.trim().toLocaleLowerCase();
    const matching = docs.filter(d => !query || [d.title, ...(d.blocks ?? []).map(b => typeof b === "string" ? b : b.text ?? "")].join(" ").toLocaleLowerCase().includes(query));
    $("home-result-count").textContent = `${matching.length} ${matching.length === 1 ? "document" : "documents"}`;
    $("home-no-results").hidden = !query || matching.length > 0;
    $("home-empty").hidden = docs.length > 0;
    $("home-add-more").hidden = docs.length === 0;
    const list = $("home-doc-list");
    list.textContent = "";
    const current = ctx.currentDoc();
    for (const d of matching) {
      const li = document.createElement("li");
      li.className = "home-doc";
      const kind = document.createElement("span");
      kind.className = "document-kind";
      kind.textContent = d.provenance?.sourceKind === "image" ? "IMG" : d.provenance?.sourceKind === "pdf" ? "PDF" : d.provenance?.sourceKind === "markdown" ? "MD" : "TXT";
      kind.setAttribute("aria-hidden", "true");
      li.appendChild(kind);
      const btn = document.createElement("button");
      btn.className = `doc-btn${current?.id === d.id ? " open" : ""}`;
      btn.textContent = d.title;
      btn.addEventListener("click", () => ctx.executeVerb("open-document", { document: d }));
      li.appendChild(btn);
      const prov = document.createElement("div");
      prov.className = "prov";
      if (d.provenance) {
        const p = d.provenance;
        prov.textContent = [p.sourceKind, p.pageCount && `${p.pageCount} pages`, ctx.fmtBytes(p.byteSize)]
          .filter(Boolean)
          .join(" · ");
        prov.title = `${p.contentDigest}\ncaptured ${p.capturedAt}`;
      } else {
        prov.textContent = "added by hand";
      }
      li.appendChild(prov);
      const position = await ctx.positionForDoc(d);
      if (renderId !== homeRender) return;
      const place = document.createElement("div");
      place.className = "home-position";
      place.textContent = d.imageSource ? `${d.imageSource.width} × ${d.imageSource.height}` : position
        ? `block ${position.blockIndex + 1} of ${position.blockCount} · ${ctx.relativeReadTime(position.updatedAt)}`
        : "not started";
      li.appendChild(place);
      list.appendChild(li);
    }
  }

  $("home-search").addEventListener("input", () => renderHome());
  let intakeBusy = false;
  async function keepFromHome(action, failureCopy) {
    if (intakeBusy) return null;
    intakeBusy = true;
    const message = $("home-intake-state");
    const controls = [$("home-file-input"), $("home-file-input-2"), $("home-paste-add"), $("home-sample")];
    controls.forEach(control => { control.disabled = true; });
    $("home-paste-box").readOnly = true;
    message.hidden = false;
    message.textContent = "Keeping this on your device…";
    try {
      const result = await action();
      if (!result) {
        message.textContent = "This file could not be opened. Try a readable PDF, Markdown, text, PNG, JPEG, WebP or GIF file.";
        return null;
      }
      message.hidden = true;
      return result;
    } catch {
      message.textContent = failureCopy;
      return null;
    } finally {
      intakeBusy = false;
      controls.forEach(control => { control.disabled = false; });
      $("home-paste-box").readOnly = false;
    }
  }
  const homeIngest = async (input) => {
    const f = input.files?.[0];
    if (!f) return;
    await keepFromHome(() => ctx.ingestFile(f), "Couldn’t save this file. The original is unchanged. Check available storage, then choose it again.");
    input.value = ""; // choosing the same source again must trigger change
  };
  $("home-file-input").addEventListener("change", (e) => homeIngest(e.target));
  $("home-file-input-2").addEventListener("change", (e) => homeIngest(e.target));
  $("home-sample").addEventListener("click", () => keepFromHome(
    () => ctx.addDocument(ctx.starterDoc, "a sample page"),
    "Couldn’t keep the sample. Check available storage, then try again."
  ));
  $("home-paste-add").addEventListener("click", async () => {
    const box = $("home-paste-box");
    if (!box.value.trim()) { box.focus(); return; }
    const result = await keepFromHome(
      async () => ctx.addIngested(await ctx.ingestPaste({ text: box.value })),
      "Couldn’t save. Your text is still here. Check available storage, then try again."
    );
    if (result) box.value = "";
  });

  // --- history (the full what-happened surface) ----------------------------

  let historyFilter = "all";
  let historyQuery = "";
  let historyRenderVersion = 0;

  async function allEntries() {
    const docs = await ctx.getDocs();
    const byDoc = new Map(docs.map((d) => [d.id, d]));
    const wanted = historyFilter === "all" ? docs : docs.filter((d) => d.id === historyFilter);
    const rows = [];
    const searchTexts = new Map();
    for (const d of wanted) {
      const records = await ctx.getRecords(d.id);
      const blockTexts = d.blocks?.length ? d.blocks.map(block => block.text) : splitParagraphs(d.text);
      const docDigest = records.some(e => e.rangeAnchor)
        ? d.provenance?.contentDigest ?? await contentDigest(d.text ?? blockTexts.join("\n\n")) : null;
      for (const e of records) {
        rows.push(e);
        let passage = [e.anchor?.quotedText, e.matchedText].filter(Boolean).join(" ");
        if (e.rangeAnchor) {
          // Rebuild from the current source and both validated endpoints. A
          // stale derived cache must never make unrelated middle text match.
          try { passage = deriveRangeSegments(e.rangeAnchor, { blockTexts, docDigest }).map(segment => segment.quotedText).join(" "); }
          catch { passage = ""; }
        }
        searchTexts.set(e.id, [passage, e.noteText].filter(Boolean).join(" ").normalize("NFKC").toLocaleLowerCase());
      }
    }
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { rows, byDoc, docs, searchTexts };
  }

  /** Undo an act that may belong to a document that is not open: the record
   * is marked undone and an undo record is written, exactly like the live
   * engine does — the open document goes through the engine so its page
   * updates too. */
  async function undoAnywhere(e, byDoc) {
    const current = ctx.currentDoc();
    if (current && e.docId === current.id) {
      await ctx.executeVerb("undo", {
        entryId: e.id,
        modality: "pointer",
        evidence: "undo button clicked",
      });
    } else {
      const doc = byDoc.get(e.docId);
      await ctx.executeVerb("undo", {
        entry: e,
        document: doc,
        modality: "pointer",
        evidence: "undo button clicked",
      });
    }
    renderHistoryAll();
  }

  async function renderHistoryAll() {
    const version = ++historyRenderVersion;
    $("history-search-status").textContent = historyQuery.trim() ? "Searching…" : "Loading records…";
    $("history-all").hidden = true;
    $("history-empty").hidden = true;
    const { rows, byDoc, docs, searchTexts } = await allEntries();
    if (version !== historyRenderVersion) return;
    const terms = historyQuery.normalize("NFKC").toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    const visible = terms.length ? rows.filter(e => {
      if (e.kind !== "act" || e.undone) return false;
      const text = searchTexts.get(e.id) ?? "";
      return terms.every(term => text.includes(term));
    }) : rows;
    const sel = $("history-filter");
    sel.textContent = "";
    const all = document.createElement("option");
    all.value = "all";
    all.textContent = "everything";
    sel.appendChild(all);
    for (const d of docs) {
      const o = document.createElement("option");
      o.value = d.id;
      o.textContent = d.title;
      sel.appendChild(o);
    }
    sel.value = historyFilter;
    const list = $("history-all");
    list.textContent = "";
    list.hidden = false;
    $("history-empty").hidden = visible.length > 0;
    $("history-empty").textContent = terms.length ? "No saved passages or notes match these words." : "No saved records yet. Highlight a passage or add a note to find it here.";
    $("history-search-status").textContent = `${visible.length} ${terms.length ? "matches" : "records"}`;
    for (const e of visible) {
      const node = ctx.entryNode(e, {
        onUndo: (entry) => undoAnywhere(entry, byDoc),
        onJump: async entry => {
          const doc = byDoc.get(entry.docId);
          if (!doc) return;
          try { await ctx.openSavedPassage(doc, entry); }
          catch { ctx.setStatus(true, "This saved passage could not be opened. Please try again."); }
        },
      });
      const from = document.createElement("div");
      from.className = "prov";
      from.textContent = `in “${byDoc.get(e.docId)?.title ?? e.docId}”`;
      node.prepend(from);
      list.appendChild(node);
    }
  }

  $("history-search").addEventListener("input", e => {
    historyQuery = e.target.value;
    renderHistoryAll();
  });

  $("history-filter").addEventListener("change", (e) => {
    historyFilter = e.target.value;
    renderHistoryAll();
  });

  // --- spaces (provisional org layer) --------------------------------------

  function fillSelect(sel, options, { value = (o) => o, label = (o) => o } = {}) {
    const prev = sel.value;
    sel.textContent = "";
    for (const o of options) {
      const opt = document.createElement("option");
      opt.value = value(o);
      opt.textContent = label(o);
      sel.appendChild(opt);
    }
    if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
  }

  function orgError(err) {
    const box = $("org-error");
    if (!err) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    box.textContent =
      err instanceof ValidationError
        ? `the contract said no: ${err.message}`
        : String(err.message ?? err);
  }

  function personSpaces() {
    return person ? org.spacesOf(person.id).filter(Boolean) : [];
  }

  function nextArrivalTime() {
    const now = Date.now();
    const previous = feed.length ? Date.parse(feed[feed.length - 1].arrivedAt) : 0;
    return new Date(Math.max(now, previous + 1)).toISOString();
  }

  async function placeMomentInSpace(moment, spaceId, { sourceContentHash = null } = {}) {
    const space = org.spaces.get(spaceId);
    if (!space || !personSpaces().some((candidate) => candidate.id === spaceId)) {
      throw new Error("that space is not one of your current spaces");
    }
    const item = await makeSpaceFeedItem({
      moment,
      space,
      spaceContext: org.spaceContextFor(spaceId, { visibility: "space" }),
      person,
      at: nextArrivalTime(),
      sourceContentHash,
    });
    await ctx.putSpaceFeed(item);
    feed.push(item);
    feed.sort((a, b) => a.arrivedAt.localeCompare(b.arrivedAt) || a.id.localeCompare(b.id));
    if (view === "spaces") renderOrg();
    ctx.setStatus(true, `sent to ${space.name} — saved in its local feed`);
    return item;
  }

  async function sendEntryToSpace(entry, spaceId) {
    return placeMomentInSpace(await ctx.momentForEntry(entry), spaceId);
  }

  function attachSpacePicker(node, source) {
    const picker = document.createElement("div");
    picker.className = "space-picker";
    const available = personSpaces();
    if (!available.length) {
      const empty = document.createElement("p");
      empty.className = "hint space-picker-empty";
      empty.append("choose who you are in ");
      const link = document.createElement("a");
      link.href = "#/spaces";
      link.textContent = "spaces";
      empty.append(link, " before sending here");
      picker.appendChild(empty);
      node.appendChild(picker);
      return picker;
    }

    const label = document.createElement("label");
    const text = document.createElement("span");
    text.textContent = "send to space";
    const select = document.createElement("select");
    select.setAttribute("aria-label", "space destination");
    fillSelect(select, available, { value: (space) => space.id, label: (space) => space.name });
    label.append(text, select);
    const send = document.createElement("button");
    send.type = "button";
    send.className = "space-send-confirm";
    send.textContent = "send to space";
    send.addEventListener("click", async () => {
      send.disabled = true;
      try {
        if (source.entry) {
          await ctx.executeVerb("send-to-space", { entry: source.entry, spaceId: select.value });
        }
        else await placeMomentInSpace(source.moment, select.value, {
          sourceContentHash: source.sourceContentHash ?? null,
        });
      } catch (err) {
        ctx.setStatus(true, String(err?.message ?? err));
      } finally {
        send.disabled = false;
      }
    });
    picker.append(label, send);
    node.appendChild(picker);
    return picker;
  }

  function momentExcerpt(moment) {
    return moment.blocks
      .map((block) => (block.kind === "math" ? block.spoken || block.content : block.content))
      .filter(Boolean)
      .join("\n\n");
  }

  function renderFeedItem(item) {
    const li = document.createElement("li");
    li.className = "space-feed-item";
    li.dataset.feedId = item.id;
    li.dataset.arrivedAt = item.arrivedAt;

    const head = document.createElement("div");
    head.className = "space-feed-head";
    const title = document.createElement("strong");
    title.textContent = item.moment.provenance?.sourceTitle || "a moment";
    const time = document.createElement("span");
    time.textContent = ctx.fmtTime(item.arrivedAt);
    head.append(title, time);
    li.appendChild(head);

    const excerpt = document.createElement("p");
    excerpt.className = "space-excerpt";
    excerpt.textContent = momentExcerpt(item.moment);
    li.appendChild(excerpt);

    const provenance = document.createElement("p");
    provenance.className = "space-provenance";
    const source = item.moment.provenance ?? {};
    provenance.textContent = [
      `source ${source.sourceTitle ?? source.sourceId ?? "unknown"}`,
      source.sourceRevision,
      source.sourceDigest,
    ].filter(Boolean).join(" · ");
    li.appendChild(provenance);

    const hashLabel = document.createElement("span");
    hashLabel.className = "space-hash-label";
    hashLabel.textContent = "moment hash";
    const hash = document.createElement("code");
    hash.className = "space-hash";
    hash.textContent = item.contentHash;
    li.append(hashLabel, hash);

    const details = document.createElement("details");
    details.className = "space-evidence";
    const summary = document.createElement("summary");
    summary.textContent = "evidence and provenance";
    details.appendChild(summary);
    const evidence = document.createElement("p");
    evidence.textContent = [
      item.moment.cursor?.capturedEvidence && `captured evidence: “${item.moment.cursor.capturedEvidence}”`,
      item.moment.cursor?.proposedIntention,
      item.moment.receipt?.result,
    ].filter(Boolean).join(" · ");
    details.appendChild(evidence);
    const full = document.createElement("pre");
    full.textContent = JSON.stringify({
      cursor: item.moment.cursor,
      proof: item.moment.receipt,
      provenance: item.moment.provenance,
      sourceSpaceContext: item.sourceSpaceContext,
      spaceContext: item.moment.spaceContext,
    }, null, 2);
    details.appendChild(full);
    li.appendChild(details);

    const keep = document.createElement("button");
    keep.type = "button";
    keep.className = "keep-space-document";
    keep.textContent = "keep to my documents";
    keep.addEventListener("click", async () => {
      const doc = await documentFromSpaceFeedItem(item);
      await ctx.putDoc(doc);
      await ctx.executeVerb("open-document", { document: doc });
      ctx.setStatus(true, "kept in your documents with its source intact");
    });
    li.appendChild(keep);
    return li;
  }

  function appendSpaceFeed(row, space) {
    const section = document.createElement("section");
    section.className = "space-feed-section";
    const heading = document.createElement("h4");
    heading.textContent = "moments — arrival order";
    section.appendChild(heading);
    const items = feed.filter((item) => item.spaceId === space.id);
    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "hint";
      empty.textContent = "no moments here yet";
      section.appendChild(empty);
    } else {
      const list = document.createElement("ol");
      list.className = "space-feed";
      for (const item of items) list.appendChild(renderFeedItem(item));
      section.appendChild(list);
    }
    row.appendChild(section);
  }

  function renderOrg() {
    person = loadPerson(localStorage);
    fillSelect($("space-kind"), SPACE_KINDS);
    fillSelect($("member-role"), MEMBER_ROLES);
    const insts = [...org.institutions.values()];
    fillSelect($("space-inst"), insts, { value: (i) => i.id, label: (i) => i.name });
    const spaces = [...org.spaces.values()];
    fillSelect($("member-space"), spaces, {
      value: (s) => s.id,
      label: (s) => `${s.name} (${s.kind})`,
    });
    $("form-space").hidden = insts.length === 0;
    $("form-member").hidden = spaces.length === 0;
    $("org-empty").hidden = insts.length > 0;
    $("space-person").textContent = person
      ? `you are ${person.name} on this device — send-to-space shows only current memberships.`
      : "choose who you are on this device to send moments only to spaces you belong to.";

    let people = {};
    try {
      people = JSON.parse(localStorage.getItem("jt.people") || "{}");
    } catch {
      people = {};
    }
    const nameFor = (personId) =>
      Object.entries(people).find(([, id]) => id === personId)?.[0] ?? personId.replace(/^per-/, "");

    const tree = $("org-tree");
    tree.textContent = "";
    for (const inst of insts) {
      const box = document.createElement("div");
      box.className = "org-inst";
      const h = document.createElement("h3");
      h.textContent = inst.name;
      if (inst.kind) {
        const k = document.createElement("span");
        k.className = "org-kind";
        k.textContent = inst.kind;
        h.appendChild(k);
      }
      box.appendChild(h);
      const instSpaces = spaces.filter((s) => s.institutionId === inst.id);
      if (!instSpaces.length) {
        const none = document.createElement("p");
        none.className = "hint";
        none.textContent = "no spaces inside yet — add a class, a hostel, a club above.";
        box.appendChild(none);
      }
      for (const s of instSpaces) {
        const row = document.createElement("div");
        row.className = "org-space";
        row.dataset.spaceId = s.id;
        const name = document.createElement("strong");
        name.textContent = s.name;
        row.appendChild(name);
        const kind = document.createElement("span");
        kind.className = "org-kind";
        kind.textContent = s.kind;
        row.appendChild(kind);
        const members = org.membersOf(s.id);
        const ul = document.createElement("ul");
        ul.className = "org-members";
        for (const m of members) {
          const li = document.createElement("li");
          li.dataset.personId = m.personId;
          const idBits = m.institutionalIdentity?.rollNumber
            ? ` · roll ${m.institutionalIdentity.rollNumber}`
            : "";
          const memberName = nameFor(m.personId);
          li.append(`${memberName} — ${m.role}${idBits}`);
          if (person?.id === m.personId) {
            const mine = document.createElement("span");
            mine.className = "you-badge";
            mine.textContent = "you on this device";
            li.appendChild(mine);
          } else {
            const choose = document.createElement("button");
            choose.type = "button";
            choose.className = "make-self";
            choose.textContent = "this is me";
            choose.addEventListener("click", () => {
              person = { id: m.personId, name: memberName };
              savePerson(person, localStorage);
              renderOrg();
              ctx.spacesChanged();
            });
            li.appendChild(choose);
          }
          ul.appendChild(li);
        }
        if (!members.length) {
          const li = document.createElement("li");
          li.className = "hint";
          li.textContent = "nobody here yet";
          ul.appendChild(li);
        }
        row.appendChild(ul);
        appendSpaceFeed(row, s);
        box.appendChild(row);
      }
      tree.appendChild(box);
    }
  }

  $("form-institution").addEventListener("submit", (e) => {
    e.preventDefault();
    try {
      org.createInstitution({
        name: $("inst-name").value.trim(),
        kind: $("inst-kind").value.trim() || undefined,
      });
      saveOrg();
      $("inst-name").value = "";
      $("inst-kind").value = "";
      orgError(null);
      renderOrg();
    } catch (err) {
      orgError(err);
    }
  });

  $("form-space").addEventListener("submit", (e) => {
    e.preventDefault();
    try {
      org.createSpace({
        institutionId: $("space-inst").value,
        kind: $("space-kind").value,
        name: $("space-name").value.trim(),
      });
      saveOrg();
      $("space-name").value = "";
      orgError(null);
      renderOrg();
    } catch (err) {
      orgError(err);
    }
  });

  $("form-member").addEventListener("submit", (e) => {
    e.preventDefault();
    try {
      const name = $("member-name").value.trim();
      // people are local: the same name maps to the same person id on
      // this device, so one person can belong to many spaces
      const people = JSON.parse(localStorage.getItem("jt.people") || "{}");
      if (!people[name]) {
        people[name] = `per-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
        localStorage.setItem("jt.people", JSON.stringify(people));
      }
      const roll = $("member-roll").value.trim();
      const personId = people[name];
      org.addMember({
        personId,
        spaceId: $("member-space").value,
        role: $("member-role").value,
        institutionalIdentity: roll ? { rollNumber: roll } : undefined,
        joinedAt: nowIso(),
      });
      if ($("member-self").checked) {
        person = { id: personId, name };
        savePerson(person, localStorage);
      }
      saveOrg();
      $("member-name").value = "";
      $("member-roll").value = "";
      orgError(null);
      renderOrg();
      ctx.spacesChanged();
    } catch (err) {
      orgError(err);
    }
  });

  // --- settings ------------------------------------------------------------

  function choiceGroup(el, values, current, onPick, describe = (v) => v) {
    el.textContent = "";
    for (const v of values) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "choice";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", String(v === current));
      b.dataset.value = v;
      b.textContent = describe(v);
      b.addEventListener("click", () => {
        onPick(v);
        for (const other of el.children) {
          other.setAttribute("aria-checked", String(other === b));
        }
      });
      el.appendChild(b);
    }
  }

  function renderSettingsState() {
    const langSel = $("set-lang");
    if (!langSel.options.length) {
      fillSelect(langSel, LANGS, { value: (l) => l[0], label: (l) => l[1] });
      langSel.addEventListener("change", () => { settings.set("lang", langSel.value); ctx.voiceSettings.languageChanged(); });
    }
    langSel.value = settings.lang;
    ctx.voiceSettings.render();

    choiceGroup($("set-motion"), MOTION_LEVELS, settings.motion, (v) => settings.set("motion", v));

    const eng = ctx.engineState();
    choiceGroup(
      $("set-engine"),
      ["wasm", "js"],
      settings.engine,
      (v) => {
        settings.set("engine", v);
        $("engine-state").textContent =
          v === eng.mode
            ? engineStateLine()
            : "saved — takes hold the next time a document opens (reload)";
      },
      (v) => (v === "wasm" ? "compiled kernel (wasm)" : "reference matcher (js)")
    );
    $("engine-state").textContent = engineStateLine();

    micStateLine();
    $("about-version").textContent = `v${pkg.version}`;
  }

  function engineStateLine() {
    const eng = ctx.engineState();
    return eng.kind
      ? `running now: ${eng.kind === "wasm" ? "compiled kernel (wasm)" : "reference matcher (js)"} — both proven to match exactly`
      : "no document open yet — the engine starts with one";
  }

  function micStateLine() {
    const s = ctx.micState();
    $("set-voice-state").textContent = {
      off: "voice is off. jt reads fine without it; speaking is the fast way.",
      listening: "listening now.",
      starting: "waiting for the browser microphone. cancel from the top bar.",
      reconnecting: "voice interrupted. reconnecting; pause from the top bar.",
      error: "voice stopped. check your microphone and connection, then retry.",
      'local-unavailable': "on-device voice needs a supported, installed language. Check it below; no remote fallback.",
      paused: "paused — resume from the top bar.",
      denied: "the browser is blocking the microphone. allow it in site settings, then reload.",
      unavailable: "this browser cannot listen. reading and every record still work.",
    }[s] ?? "";
    if (ctx.micAudioHeld?.() && ["starting", "reconnecting"].includes(s)) {
      $("set-voice-state").textContent = s === "reconnecting"
        ? "microphone remains on. reconnecting recognition; pause from the top bar to turn it off."
        : "microphone is on. starting recognition; cancel from the top bar to turn it off.";
    }
    $("set-voice-on").hidden = !["off", "paused", "error", "denied", "local-unavailable"].includes(s);
  }

  $("set-voice-on").addEventListener("click", () => {
    ctx.startMic();
    micStateLine();
  });

  // data: export is a real file of everything on this device
  async function exportData() {
    const docs = await ctx.getDocs();
    const records = [];
    for (const d of docs) records.push(...(await ctx.getRecords(d.id)));
    return JSON.stringify(
      {
        format: "jt-export",
        version: pkg.version,
        exportedAt: nowIso(),
        settings: {
          lang: settings.lang,
          motion: settings.motion,
          engine: settings.engine,
        },
        documents: docs,
        records,
        positions: await ctx.getPositions(),
        arrived: ctx.getInbox(),
        spaces: org.toJSON(),
        spaceFeeds: await ctx.getSpaceFeed(),
      },
      null,
      2
    );
  }

  $("export-btn").addEventListener("click", async () => {
    const blob = new Blob([await exportData()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `jt-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  // delete-all: two explicit presses, then a clean slate
  let armed = false;
  $("delete-btn").addEventListener("click", async () => {
    const state = $("delete-state");
    if (!armed) {
      armed = true;
      $("delete-btn").textContent = "press again to really delete everything";
      state.textContent = "this removes every document, record, arrival, space, space feed and setting from this device. there is no undo for this one.";
      return;
    }
    clearSettings();
    localStorage.removeItem("jt.org");
    localStorage.removeItem("jt.people");
    await new Promise((resolve) => {
      const req = indexedDB.deleteDatabase("jt-web");
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
    location.replace(location.pathname); // start over, honestly empty
  });

  // --- rooms ---------------------------------------------------------------

  let mathToLatex = null;
  async function tryMath() {
    const input = $("math-input").value.trim();
    if (!input) return;
    if (!mathToLatex) {
      ({ spokenMathToLatex: mathToLatex } = await import("../vendor/jt-speech/math/spokenMathToLatex.js"));
    }
    const out = mathToLatex(input);
    const box = $("math-out");
    box.hidden = false;
    box.textContent = out.latex || "(nothing translatable yet)";
    const note = $("math-note");
    if (out.unparsed?.length) {
      note.hidden = false;
      note.textContent = `words the early version could not place: ${out.unparsed.join(", ")} — it says so rather than guessing.`;
    } else {
      note.hidden = true;
    }
  }
  $("math-try").addEventListener("click", tryMath);
  $("math-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") tryMath();
  });

  // --- phone bottom bar ----------------------------------------------------

  $("tab-home").addEventListener("click", () => show("home"));
  for (const a of document.querySelectorAll("#more-panel a")) {
    a.addEventListener("click", () => ctx.setSheet(null));
  }

  // --- the object main.js keeps --------------------------------------------

  return {
    show,
    route,
    openRoom,
    exportData,
    async loadSpaceFeed() {
      feed = await ctx.getSpaceFeed();
      feed.sort((a, b) => a.arrivedAt.localeCompare(b.arrivedAt) || a.id.localeCompare(b.id));
      if (view === "spaces") renderOrg();
      return feed;
    },
    spaceFeed: () => feed,
    personSpaces,
    resolvePersonSpace: (query) => matchSpaceName(query, personSpaces()),
    sendEntryToSpace,
    placeMomentInSpace,
    attachSpacePicker,
    view: () => view,
    libraryChanged: () => {
      if (view === "home") renderHome();
    },
    historyChanged: () => {
      if (view === "history") renderHistoryAll();
    },
    inboxChanged: () => {},
    micChanged: () => {
      if (view === "settings") micStateLine();
    },
    orgStore: () => org,
  };
}
