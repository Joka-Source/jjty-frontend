import "./product.css";
import { installCompanion } from "./companion.js";
import {
  installTokens,
  loadPreferences,
  savePreferences,
  applyPreferences,
  matchNotebook,
} from "./product-ui.js";
import { createVoiceCapture } from "../src/voice-capture.js";
installTokens();
const preferences = loadPreferences();
applyPreferences(preferences);
let drawing = false,
  pendingPhrase = null;
let libraryView = "grid",
  librarySort = "updated",
  voicePanel = false,
  voiceState = "off",
  voiceMessage = "Read a phrase to move to it.",
  voiceHit = null;
import "../src/pwa.js";
import { reconcileSession } from "./session.js";
import { pageBackground } from "./paper.js";
import { toolIcon } from "./icons.js";
import { notebook, validate, appendItem, VERSION } from "./model.js";
import { loadWorkspace, saveWorkspace } from "./storage.js";
import { selectItems, moveItems } from "./selection.js";
import { importPdf } from "./pdf.js";
const app = document.querySelector("#app"),
  dialog = document.querySelector("#dialog");
const key = "jett-notebooks-v1";
let data = { version: VERSION, notebooks: [] },
  current = null,
  page = 0,
  tool = "pen",
  color = "#24476a",
  width = 2,
  filter = "all",
  query = "",
  sidebar = true,
  zoom = 0,
  undo = [],
  redo = [],
  saved = true;
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let storageError = "";
try {
  const stored = await loadWorkspace();
  const raw = stored ? null : localStorage.getItem(key);
  if (stored) data = validate(stored);
  else if (raw) {
    data = validate(JSON.parse(raw));
    await saveWorkspace(data);
  }
} catch {
  storageError =
    "Saved data could not be opened. It has not been overwritten. Restore a valid backup or reload after resolving browser storage.";
  saved = false;
}
const sessionKey = "jett-notebook-session-v1";
let session;
try {
  session = reconcileSession(
    JSON.parse(localStorage.getItem(sessionKey)),
    data.notebooks,
  );
} catch {
  session = reconcileSession(null, data.notebooks);
}
current = session.active;
page = current ? session.pages[current] : 0;
const histories = new Map();
function holdNotebook() {
  if (current) {
    session.pages[current] = page;
    histories.set(current, { undo, redo });
  }
}
function openNotebook(id) {
  if (current !== id) {
    voiceCapture.pause();
    voiceHit = null;
    pendingPhrase = null;
  }
  holdNotebook();
  current = id;
  if (!session.tabs.includes(id)) session.tabs.push(id);
  page = session.pages[id] || 0;
  const held = histories.get(id);
  undo = held?.undo || [];
  redo = held?.redo || [];
  render();
}
function home() {
  voiceCapture.pause();
  voicePanel = false;
  voiceHit = null;
  pendingPhrase = null;
  holdNotebook();
  current = null;
  render();
}
function closeNotebook(id) {
  if (current === id) {
    voiceCapture.pause();
    voicePanel = false;
    voiceHit = null;
    pendingPhrase = null;
  }
  const index = session.tabs.indexOf(id);
  holdNotebook();
  session.tabs = session.tabs.filter((tab) => tab !== id);
  delete session.pages[id];
  histories.delete(id);
  if (current === id) {
    current = null;
    const next = session.tabs[Math.max(0, index - 1)];
    if (next) {
      openNotebook(next);
      return;
    }
  }
  render();
}
function notify(s) {
  document.querySelector("#notice").textContent = s;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(
    () => (document.querySelector("#notice").textContent = ""),
    /failed|unavailable|Opening PDF|Importing page/i.test(s) ? 60000 : 5500,
  );
}
let saveRevision = 0;
function persist() {
  if (storageError) {
    notify(storageError);
    return false;
  }
  const revision = ++saveRevision;
  saved = false;
  saveWorkspace(data)
    .then(() => {
      if (revision === saveRevision) {
        saved = true;
        const status = app.querySelector(".footer span:last-child");
        if (status) status.textContent = "Saved on this browser";
      }
    })
    .catch(() => {
      saved = false;
      notify("Storage is unavailable. Export a backup before closing.");
    });
  return true;
}

function book() {
  return data.notebooks.find((n) => n.id === current);
}
function change(next) {
  voiceHit = null;
  next.updated = Date.now();
  undo.push(structuredClone(book()));
  redo = [];
  data.notebooks = data.notebooks.map((n) => (n.id === current ? next : n));
  persist();
  render();
}
function modal(title, body, submit) {
  rememberFocus();
  pauseForDialog();
  dialog.innerHTML = `<form><h2 id="dialog-title">${title}</h2>${body}<menu><button type="button" id="cancel">Cancel</button><button class="primary" type="submit">${{ "New notebook": "Create notebook", "Export notebook": "Export", "Find in notebook": "Find", "Move with your words": "Go to words", "Keyboard shortcuts": "Done", "Using this tool": "Done" }[title] || "Save changes"}</button></menu></form>`;
  dialog.querySelector("#cancel").onclick = () => dialog.close();
  dialog.querySelector("form").onsubmit = (e) => {
    e.preventDefault();
    const values = new FormData(e.target);
    dialog.close();
    submit(values);
  };
  dialog.showModal();
  dialog.querySelector("input,textarea,select")?.focus();
}
function create() {
  modal(
    "New notebook",
    `<label>Name<input name="title" required maxlength="100" placeholder="Untitled notebook"></label><label>Paper<select name="paper"><option value="grid">Squared paper</option><option value="ruled">Ruled paper</option><option value="dots">Dotted paper</option><option value="blank">Blank paper</option></select></label><label>Cover color<input name="color" type="color" value="#44c8de"></label>`,
    (f) => {
      const n = notebook(f.get("title"), f.get("paper"), f.get("color"));
      data.notebooks.push(n);
      persist();
      openNotebook(n.id);
    },
  );
  dialog.querySelector('[name="paper"]').value = preferences.paper;
  const preview = document.createElement("div");
  preview.className = "template-preview";
  preview.textContent = "A fresh page for your next idea";
  dialog.querySelector("h2").after(preview);
}
function download() {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "JETT-notebooks.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify("Notebook backup downloaded.");
}
function render() {
  if (current && !book()) current = null;
  if (current) editor();
  else library();
  holdNotebook();
  session.active = current;
  session = reconcileSession(session, data.notebooks);
  try {
    localStorage.setItem(sessionKey, JSON.stringify(session));
  } catch {
    /* Notebook storage and export remain available. */
  }
}
function library() {
  const list = data.notebooks
    .filter(
      (n) =>
        (filter === "trash" ? n.trashed : !n.trashed) &&
        (!filter.startsWith("folder:") || n.folder === filter.slice(7)) &&
        (filter !== "favorites" || n.favorite) &&
        n.title.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      librarySort === "title"
        ? a.title.localeCompare(b.title)
        : b.updated - a.updated,
    );
  app.innerHTML = `<div class="shell"><aside class="sidebar"><div class="brand">JETT<small>Documents, pen & voice</small></div><button class="nav ${filter === "all" ? "active" : ""}" data-filter="all">▤ &nbsp; Documents</button><button class="nav ${filter === "favorites" ? "active" : ""}" data-filter="favorites">☆ &nbsp; Favorites</button><button class="nav ${filter === "trash" ? "active" : ""}" data-filter="trash">♲ &nbsp; Trash</button>${[
    ...new Set(
      data.notebooks.filter((n) => !n.trashed && n.folder).map((n) => n.folder),
    ),
  ]
    .sort()
    .map(
      (folder) =>
        `<button class="nav" data-folder="${esc(folder)}">▱ ${esc(folder)}</button>`,
    )
    .join(
      "",
    )}<div class="bottom"><button id="settings">Settings</button><button id="shortcuts">Keyboard shortcuts</button><a href="/">Open document desk ↗</a><button id="backup">Export backup</button><button id="import">Restore backup</button><p class="local">Saved on this browser.<br>Export a backup to keep a separate copy.</p></div></aside><main class="library"><div class="heading"><h1>${filter === "favorites" ? "Favorites" : filter === "trash" ? "Trash" : filter.startsWith("folder:") ? esc(filter.slice(7)) : "Documents"}</h1><input class="search" aria-label="Search notebooks" placeholder="Search your notebooks" value="${esc(query)}"><button id="pdf-import">Import PDF</button><button class="primary" id="new">＋ New notebook</button><button id="create-more" aria-label="More creation options">⌄</button></div><div class="subhead"><span>${list.length} notebook${list.length === 1 ? "" : "s"}</span><div class="library-controls"><select id="library-sort" aria-label="Sort notebooks"><option value="updated" ${librarySort === "updated" ? "selected" : ""}>Last edited</option><option value="title" ${librarySort === "title" ? "selected" : ""}>Name</option></select><button id="library-view" aria-label="${libraryView === "grid" ? "Show list" : "Show grid"}">${libraryView === "grid" ? "List" : "Grid"}</button></div></div><div class="books ${libraryView}">${list.map((n) => `<div class="book"><button class="star" data-star="${n.id}" aria-label="${n.favorite ? "Unfavorite" : "Favorite"} ${esc(n.title)}">${n.favorite ? "★" : "☆"}</button><button data-open="${n.id}" aria-label="Open ${esc(n.title)}"><div class="cover" style="background:${n.color}"><span>${esc(n.title)}</span><small>JETT / NOTEBOOK</small></div><span class="book-title">${esc(n.title)}</span><span class="book-meta">${n.pages.length} page${n.pages.length > 1 ? "s" : ""} · ${new Date(n.updated).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span></button><button data-manage="${n.id}" aria-label="Manage ${esc(n.title)}">⋯ Options</button></div>`).join("")}</div>${!list.length ? `<div class="empty"><div style="font-size:50px">▤</div><h2>${query ? "No notebooks found" : filter === "trash" ? "Trash is empty" : "A little space for your next idea."}</h2><p>${query ? "Try another name." : filter === "trash" ? "Notebooks you move to Trash can be restored here." : "Create a notebook. Put pen to paper. Pick up where you left off."}</p>${!query && filter !== "trash" ? '<button id="empty-new" class="primary">Create a notebook</button>' : ""}</div>` : ""}</main></div>`;
  app.querySelectorAll("[data-filter]").forEach(
    (b) =>
      (b.onclick = () => {
        filter = b.dataset.filter;
        render();
      }),
  );
  app.querySelectorAll("[data-open]").forEach(
    (b) =>
      (b.onclick = () => {
        openNotebook(b.dataset.open);
      }),
  );
  app.querySelectorAll("[data-star]").forEach(
    (b) =>
      (b.onclick = () => {
        const n = data.notebooks.find((n) => n.id === b.dataset.star);
        n.favorite = !n.favorite;
        histories.delete(n.id);
        persist();
        render();
      }),
  );
  app.querySelectorAll("[data-folder]").forEach(
    (b) =>
      (b.onclick = () => {
        filter = "folder:" + b.dataset.folder;
        render();
      }),
  );
  app
    .querySelectorAll("[data-manage]")
    .forEach((b) => (b.onclick = () => manageNotebook(b.dataset.manage)));
  app.querySelector("#settings").onclick = settingsMenu;
  app.querySelector("#shortcuts").onclick = shortcutsMenu;
  app.querySelector("#library-sort").onchange = (e) => {
    librarySort = e.target.value;
    render();
  };
  app.querySelector("#library-view").onclick = () => {
    libraryView = libraryView === "grid" ? "list" : "grid";
    render();
  };
  app.querySelector("#pdf-import").onclick = () =>
    document.querySelector("#pdf-file").click();
  app.querySelector("#new").onclick = create;
  app.querySelector("#create-more").onclick = creationMenu;
  app.querySelector("#empty-new")?.addEventListener("click", create);
  app.querySelector("#backup").onclick = download;
  app.querySelector("#import").onclick = () =>
    document.querySelector("#restore").click();
  app.querySelector(".search").oninput = (e) => {
    const pos = e.target.selectionStart;
    query = e.target.value;
    library();
    const input = app.querySelector(".search");
    input.focus();
    input.setSelectionRange(pos, pos);
  };
}
function svgItems(items) {
  return items
    .map((i) =>
      i.type === "image"
        ? `<image href="${i.src}" x="${i.x}" y="${i.y}" width="${i.width}" height="${i.height}"/>`
        : i.type === "ink"
          ? `<polyline points="${i.points.map((p) => p.join(",")).join(" ")}" stroke="${i.color}" stroke-width="${i.width}" opacity="${i.opacity ?? 1}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
          : `${i.sticky ? `<rect x="${i.x - 12}" y="${i.y - 28}" width="320" height="100" fill="#fff1a6"/>` : ""}<text x="${i.x}" y="${i.y}" font-family="system-ui" font-size="20" fill="#24476a">${esc(i.text)}</text>`,
    )
    .join("");
}
function editor() {
  const n = book();
  page = Number.isInteger(page)
    ? Math.max(0, Math.min(page, n.pages.length - 1))
    : 0;
  app.innerHTML = `<div class="editor"><div class="tabbar"><button id="home" aria-label="Back to library">⌂</button><input id="title" aria-label="Notebook title" value="${esc(n.title)}" maxlength="100"><span style="margin-left:auto;font-size:12px">JETT</span></div>${
    session.tabs.length > 1
      ? `<nav class="notebook-tabs" aria-label="Open notebooks">${session.tabs
          .map((id) => {
            const tab = data.notebooks.find((n) => n.id === id);
            return tab
              ? `<span class="notebook-tab ${id === current ? "active" : ""}"><button data-tab-open="${id}" aria-current="${id === current ? "page" : "false"}">${esc(tab.title)}</button><button data-tab-close="${id}" aria-label="Close ${esc(tab.title)}">×</button></span>`
              : "";
          })
          .join("")}</nav>`
      : ""
  }<div class="toolbar"><button id="sidebar" aria-label="Toggle pages">▤</button><button id="find" aria-label="Find text">⌕</button><div class="tools">${[
    ["lasso", "⌁", "Lasso selection"],
    ["pen", "✎", "Pen"],
    ["rectangle", "□", "Rectangle"],
    ["laser", "•", "Laser pointer"],
    ["highlighter", "▰", "Highlighter"],
    ["text", "T", "Text"],
    ["sticky", "▧", "Sticky note"],
    ["image", "▣", "Image"],
    ["eraser", "◇", "Erase stroke"],
    ["read", "☞", "Read only"],
  ]
    .map(
      ([id, icon, label]) =>
        `<button data-tool="${id}" aria-label="${label}" title="${label}" aria-pressed="${tool === id}" class="${tool === id ? "selected" : ""}">${toolIcon(id)}</button>`,
    )
    .join(
      "",
    )}<input id="color" aria-label="Ink color" type="color" value="${color}"><select id="width" aria-label="Stroke width">${[2, 4, 8].map((w) => `<option ${width === w ? "selected" : ""} value="${w}">${w} px</option>`).join("")}</select></div><select id="zoom" aria-label="Page zoom">${[
    [0, "Fit"],
    [0.5, "50%"],
    [1, "100%"],
    [1.5, "150%"],
    [2, "200%"],
  ]
    .map(
      ([v, label]) =>
        `<option value="${v}" ${zoom === v ? "selected" : ""}>${label}</option>`,
    )
    .join(
      "",
    )}</select><button id="undo" aria-label="Undo" ${!undo.length ? "disabled" : ""}>↶</button><button id="redo" aria-label="Redo" ${!redo.length ? "disabled" : ""}>↷</button><button id="add" aria-label="Add page">＋</button><button id="export" aria-label="Export notebook">↥</button><button id="voice" aria-label="Voice cursor" aria-pressed="${voicePanel}">Voice</button><button id="page-options" aria-label="Page options">⋯</button></div>${toolContext()}${voicePanel ? voiceSurface() : ""}<div class="desk">${sidebar ? `<aside class="pages"><h3>Pages <span style="color:#8a96a5">${n.pages.length}</span></h3>${n.pages.some((p) => p.outline) ? `<nav aria-label="Document outline">${n.pages.map((p, i) => (p.outline ? `<button data-page="${i}" style="display:block;text-align:left">${esc(p.outline)}</button>` : "")).join("")}</nav>` : ""}${n.pages.map((p, i) => `<button data-page="${i}" class="thumb ${i === page ? "active" : ""}" aria-label="Page ${i + 1}"><svg viewBox="0 0 720 960" width="100%" height="85%">${pageBackground(p, n.paper)}${svgItems(p.items)}</svg>${i + 1}</button>`).join("")}<button id="add-side" aria-label="Add another page">＋ Add page</button></aside>` : ""}<main class="canvas-wrap"><div style="width:${zoom ? `${720 * zoom}px` : "min(720px, 100%)"}" class="paper ${n.pages[page].paper || n.paper} ${tool === "read" ? "read" : ""}"><svg id="ink" viewBox="0 0 720 960" role="img" aria-label="Notebook page ${page + 1}">${pageBackground(n.pages[page], n.paper)}${svgItems(n.pages[page].items)}${voiceMarker()}</svg></div></main></div><div class="footer"><span>${page + 1} of ${n.pages.length} · ${tool === "read" ? "Read only" : tool === "eraser" ? "Click near a stroke to erase" : tool === "text" ? "Click the paper to add text" : "Draw on the paper"}</span><span>${saved ? "Saved on this browser" : "Unsaved — export a backup"}</span></div></div>`;
  app.querySelector("#home").onclick = home;
  app
    .querySelectorAll("[data-tab-open]")
    .forEach((b) => (b.onclick = () => openNotebook(b.dataset.tabOpen)));
  app
    .querySelectorAll("[data-tab-close]")
    .forEach((b) => (b.onclick = () => closeNotebook(b.dataset.tabClose)));
  app.querySelector("#title").onchange = (e) => {
    const next = structuredClone(book());
    next.title = e.target.value.trim() || "Untitled notebook";
    change(next);
  };
  app.querySelectorAll("[data-tool]").forEach(
    (b) =>
      (b.onclick = () => {
        if (b.dataset.tool === "image") {
          document.querySelector("#image-file").click();
          return;
        }
        tool = b.dataset.tool;
        render();
      }),
  );
  app.querySelectorAll("[data-page]").forEach(
    (b) =>
      (b.onclick = () => {
        voiceHit = null;
        page = +b.dataset.page;
        render();
      }),
  );
  app.querySelector("#zoom").onchange = (e) => {
    zoom = Number(e.target.value);
    render();
  };
  app.querySelector("#sidebar").onclick = () => {
    sidebar = !sidebar;
    render();
  };
  app.querySelector("#color").onchange = (e) => (color = e.target.value);
  app.querySelector("#width").onchange = (e) => (width = +e.target.value);
  const add = () => {
    const next = structuredClone(book());
    next.pages.push({ id: crypto.randomUUID(), items: [] });
    page = next.pages.length - 1;
    change(next);
  };
  app.querySelector("#add").onclick = add;
  app.querySelector("#add-side")?.addEventListener("click", add);
  app.querySelector("#undo").onclick = () => history(false);
  app.querySelector("#redo").onclick = () => history(true);
  app.querySelector("#export").onclick = exportNotebook;
  app.querySelector("#find").onclick = find;
  app.querySelector("#page-options").onclick = pageMenu;
  app.querySelector("#ink").oncontextmenu = (e) => {
    e.preventDefault();
    pageMenu();
  };
  app.querySelector("#voice").onclick = () => {
    voicePanel = !voicePanel;
    if (!voicePanel) voiceCapture.pause();
    render();
  };
  app.querySelector("#voice-start")?.addEventListener("click", () => {
    if (["listening", "starting", "reconnecting"].includes(voiceState))
      voiceCapture.pause();
    else voiceCapture.start();
  });
  app
    .querySelector("#voice-try")
    ?.addEventListener("click", () =>
      modal(
        "Move with your words",
        '<p class="dialog-intro">Try the voice cursor with typed words. This does not use the microphone.</p><label>Phrase<input name="phrase" required placeholder="Words in this notebook"></label>',
        (f) => navigateVoice(f.get("phrase")),
      ),
    );
  app
    .querySelector("#voice-keep")
    ?.addEventListener("click", keepVoiceHighlight);
  app.querySelectorAll("[data-ink-color]").forEach(
    (b) =>
      (b.onclick = () => {
        color = b.dataset.inkColor;
        render();
      }),
  );
  app.querySelectorAll("[data-ink-width]").forEach(
    (b) =>
      (b.onclick = () => {
        width = Number(b.dataset.inkWidth);
        render();
      }),
  );
  app.querySelector("#tool-help")?.addEventListener("click", () => toolHelp());
  attachInk();
}
function history(forward) {
  const from = forward ? redo : undo,
    to = forward ? undo : redo;
  if (!from.length) return;
  to.push(structuredClone(book()));
  const next = from.pop();
  voiceHit = null;
  data.notebooks = data.notebooks.map((n) => (n.id === current ? next : n));
  persist();
  render();
}
function find() {
  modal(
    "Find in notebook",
    '<label>Text<input name="query" required placeholder="Search typed notes"></label><p class="hint">Search covers typed text and imported PDF text. Handwriting recognition is not connected.</p>',
    (f) => {
      const q = f.get("query").toLowerCase();
      const i = book().pages.findIndex(
        (p) =>
          (p.sourceText || "").toLowerCase().includes(q) ||
          p.items.some(
            (i) => i.type === "text" && i.text.toLowerCase().includes(q),
          ),
      );
      if (i < 0) notify("No matching typed text.");
      else {
        voiceHit = null;
        page = i;
        render();
        notify(`Found on page ${i + 1}`);
      }
    },
  );
}
function attachInk() {
  const svg = app.querySelector("#ink");
  let points = null,
    line = null;
  const pos = (e) => {
    const r = svg.getBoundingClientRect();
    return [
      ((e.clientX - r.left) * 720) / r.width,
      ((e.clientY - r.top) * 960) / r.height,
    ];
  };
  svg.onpointerdown = (e) => {
    if (e.button !== 0 || tool === "read") return;
    const p = pos(e);
    if (tool === "text" || tool === "sticky") {
      modal(
        "Add text",
        '<label>Text<input name="text" required maxlength="500"></label>',
        (f) =>
          change(
            appendItem(book(), page, {
              type: "text",
              text: f.get("text"),
              sticky: tool === "sticky",
              x: p[0],
              y: p[1],
            }),
          ),
      );
      return;
    }
    if (tool === "eraser") {
      const next = structuredClone(book()),
        items = next.pages[page].items;
      const index = items.findLastIndex(
        (i) =>
          i.type === "ink" &&
          i.points.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 20),
      );
      if (index >= 0) {
        items.splice(index, 1);
        change(next);
      }
      return;
    }
    drawing = true;
    points = [p, p];
    svg.setPointerCapture(e.pointerId);
    line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", tool === "highlighter" ? "#e8cb50" : color);
    line.setAttribute("stroke-width", tool === "highlighter" ? 18 : width);
    line.setAttribute("opacity", tool === "highlighter" ? 0.35 : 1);
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("stroke-linejoin", "round");
    line.setAttribute("points", points.map((p) => p.join(",")).join(" "));
    if (tool === "lasso") {
      line.setAttribute("stroke", "#2d86ce");
      line.setAttribute("stroke-width", "1.5");
      line.setAttribute("stroke-dasharray", "6 4");
    }
    svg.append(line);
  };
  svg.onpointermove = (e) => {
    if (!points) return;
    const end = pos(e);
    if (tool === "rectangle") {
      const start = points[0];
      points = [start, [end[0], start[1]], end, [start[0], end[1]], start];
    } else points.push(end);
    line.setAttribute("points", points.map((p) => p.join(",")).join(" "));
  };
  svg.onpointerup = () => {
    drawing = false;
    queueMicrotask(() => {
      if (pendingPhrase && !dialog.open) {
        const phrase = pendingPhrase;
        pendingPhrase = null;
        navigateVoice(phrase);
      }
    });
    if (!points) return;
    if (tool === "lasso") {
      const indices = selectItems(book().pages[page].items, points);
      points = null;
      line?.remove();
      if (indices.length) editSelection(indices);
      else notify("No objects inside the selection.");
      return;
    }
    if (tool === "laser") {
      points = null;
      line?.remove();
      return;
    }
    const item = {
      type: "ink",
      points,
      color: tool === "highlighter" ? "#e8cb50" : color,
      width: tool === "highlighter" ? 18 : width,
      opacity: tool === "highlighter" ? 0.35 : 1,
    };
    points = null;
    change(appendItem(book(), page, item));
  };
  svg.onpointercancel = () => {
    drawing = false;
    pendingPhrase = null;
    points = null;
    line?.remove();
  };
}
document.querySelector("#restore").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const incoming = validate(JSON.parse(await file.text()));
    for (const n of incoming.notebooks) {
      n.id = crypto.randomUUID();
      n.title += " (restored)";
      data.notebooks.push(n);
    }
    persist();
    current = null;
    render();
    notify(
      `Restored ${incoming.notebooks.length} notebooks as separate copies.`,
    );
  } catch (err) {
    notify(err.message);
  }
  e.target.value = "";
};
document.addEventListener("keydown", (e) => {
  if (
    !current ||
    dialog.open ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)
  )
    return;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    history(e.shiftKey);
  }
  if ((e.metaKey || e.ctrlKey) && e.key === "f") {
    e.preventDefault();
    find();
  }
});

let focusReturn = null;
function rememberFocus() {
  const el = document.activeElement;
  if (app.contains(el) || el?.id === "jjty-helper")
    focusReturn = {
      id: el.id,
      tool: el.dataset.tool,
      label: el.getAttribute("aria-label"),
    };
}
dialog.addEventListener("close", () => {
  if (dialog.open || app.contains(document.activeElement) || document.activeElement?.id === "jjty-helper") return;
  const target = focusReturn?.id
    ? document.getElementById(focusReturn.id)
    : focusReturn?.tool
      ? app.querySelector(`[data-tool="${CSS.escape(focusReturn.tool)}"]`)
      : null;
  (target || app.querySelector("#title,#new"))?.focus();
});
function pauseForDialog() {
  pendingPhrase = null;
  if (["listening", "starting", "reconnecting"].includes(voiceState))
    voiceCapture.pause();
}
function panel(title, body) {
  rememberFocus();
  pauseForDialog();
  dialog.innerHTML = `<h2 id="dialog-title">${title}</h2>${body}<menu><button id="panel-close">Close</button></menu>`;
  dialog.querySelector("#panel-close").onclick = () => dialog.close();
  dialog.showModal();
  dialog.querySelector("input,button")?.focus();
  return dialog;
}
function creationMenu() {
  panel(
    "Create",
    '<div class="menu-actions"><button data-create="notebook">New notebook <small>Choose paper and a cover</small></button><button data-create="quick">Quick note <small>Start on a fresh page</small></button><button data-create="import">Import PDF <small>Bring a document into your workspace</small></button><button data-create="restore">Restore a backup <small>Add notebooks from an exported file</small></button></div>',
  );
  dialog.querySelectorAll("[data-create]").forEach(
    (b) =>
      (b.onclick = () => {
        dialog.close();
        if (b.dataset.create === "notebook") create();
        if (b.dataset.create === "quick") {
          const n = notebook("Quick note", preferences.paper);
          data.notebooks.push(n);
          persist();
          openNotebook(n.id);
        }
        if (b.dataset.create === "import")
          document.querySelector("#pdf-file").click();
        if (b.dataset.create === "restore")
          document.querySelector("#restore").click();
      }),
  );
}
function pageMenu() {
  panel(
    `Page ${page + 1}`,
    `<div class="menu-actions"><button data-page-action="details">Paper & outline</button><button data-page-action="duplicate">Duplicate page</button><button data-page-action="earlier" ${page === 0 ? "disabled" : ""}>Move earlier</button><button data-page-action="later" ${page === book().pages.length - 1 ? "disabled" : ""}>Move later</button><button data-page-action="export">Export notebook</button><button class="danger" data-page-action="remove" ${book().pages.length === 1 ? "disabled" : ""}>Remove page <small>Undo is available</small></button></div>`,
  );
  dialog.querySelectorAll("[data-page-action]").forEach(
    (b) =>
      (b.onclick = () => {
        const action = b.dataset.pageAction;
        dialog.close();
        if (action === "details") {
          pageOptions();
          return;
        }
        if (action === "export") {
          exportNotebook();
          return;
        }
        const next = structuredClone(book());
        if (action === "duplicate") {
          const copy = structuredClone(next.pages[page]);
          copy.id = crypto.randomUUID();
          next.pages.splice(++page, 0, copy);
        }
        if (action === "remove") {
          next.pages.splice(page, 1);
          page = Math.min(page, next.pages.length - 1);
        }
        if (action === "earlier" || action === "later") {
          const dest = page + (action === "earlier" ? -1 : 1);
          const [p] = next.pages.splice(page, 1);
          next.pages.splice(dest, 0, p);
          page = dest;
        }
        change(next);
        notify(
          action === "remove"
            ? "Page removed. Undo is available."
            : "Pages updated.",
        );
      }),
  );
}
function quickSwitch() {
  panel(
    "Jump to a notebook",
    '<label>Search<input id="jump-query" placeholder="Find a notebook…" autocomplete="off"></label><div id="jump-results" class="menu-actions"></div><p class="hint">⌘ / Ctrl K opens this switcher from anywhere.</p>',
  );
  const fill = () => {
    const q = dialog.querySelector("#jump-query").value.toLowerCase();
    const ns = data.notebooks.filter(
      (n) => !n.trashed && n.title.toLowerCase().includes(q),
    );
    dialog.querySelector("#jump-results").innerHTML = ns.length
      ? ns
          .map(
            (n) =>
              `<button data-jump="${n.id}">${esc(n.title)}<small>${n.pages.length} pages</small></button>`,
          )
          .join("")
      : '<p class="hint">No matching notebooks.</p>';
    dialog.querySelectorAll("[data-jump]").forEach(
      (b) =>
        (b.onclick = () => {
          dialog.close();
          openNotebook(b.dataset.jump);
        }),
    );
  };
  dialog.querySelector("#jump-query").oninput = fill;
  fill();
  dialog.querySelector("#jump-query").focus();
}
addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    if (dialog.open) return;
    quickSwitch();
  }
});
const voiceCapture = createVoiceCapture({
  Recognition: window.SpeechRecognition || window.webkitSpeechRecognition,
  lang: () => "en-US",
  processingMode: "browser",
  onState(state) {
    voiceState = state;
    voiceMessage =
      {
        off: "Voice is off.",
        starting: "Waiting for microphone permission…",
        listening: "Listening. Read a phrase from your page.",
        paused: "Paused. Your place is kept.",
        denied:
          "Microphone access was denied. Change browser permissions to retry.",
        unavailable:
          "Speech recognition is unavailable here. Try words instead.",
        error: "Voice stopped. Retry when you are ready.",
        reconnecting: "Reconnecting…",
      }[state] || state;
    if (current && voicePanel && !drawing && !dialog.open) render();
  },
  onInterim(text) {
    const status = app.querySelector("#voice-message");
    if (status) status.textContent = text;
  },
  onFinal(text) {
    if (drawing) pendingPhrase = text;
    else if (current && !dialog.open) navigateVoice(text);
  },
});
addEventListener("pagehide", () => voiceCapture.dispose());
function toolContext() {
  const names = {
    pen: "Pen",
    highlighter: "Highlighter",
    rectangle: "Shape",
    lasso: "Lasso",
    text: "Text",
    sticky: "Sticky note",
    eraser: "Eraser",
    read: "Read",
    laser: "Laser",
  };
  const hints = {
    pen: "Write freely. Your work saves as you go.",
    highlighter: "Draw a translucent highlight.",
    rectangle: "Drag from corner to corner.",
    lasso: "Circle objects to move, copy or edit them.",
    text: "Click the page to add text.",
    sticky: "Click to place a sticky note.",
    eraser: "Click near a stroke to remove it.",
    read: "Scroll and read without marking the page.",
    laser: "Point without leaving a mark.",
  };
  return `<div class="contextbar"><strong>${names[tool] || tool}</strong>${["pen", "rectangle"].includes(tool) ? ["#24476a", "#3269ad", "#b83c50", "#308a69", "#8056ad"].map((c) => `<button class="swatch" data-ink-color="${c}" style="background:${c}" aria-label="Ink ${c}" aria-pressed="${color === c}"></button>`).join("") + [2, 4, 8].map((w) => `<button data-ink-width="${w}" aria-pressed="${width === w}">${w} px</button>`).join("") : ""}<span class="context-help">${hints[tool] || ""}</span><button id="tool-help" aria-label="Tool instructions">?</button></div>`;
}
function toolHelp() {
  modal(
    "Using this tool",
    `<div class="state-card">${toolContext().replace(/<button[^>]*>[\s\S]*?<\/button>/g, "")}</div><p class="hint">Undo is available for page edits. Press Escape to dismiss dialogs. Your pointer and keyboard keep the same document context.</p>`,
    () => {},
  );
}
function voiceSurface() {
  return `<div class="voicebar" data-state="${voiceState}"><span class="voice-dot"></span><strong>Voice cursor</strong><span id="voice-message" role="status">${esc(voiceMessage)}</span><button id="voice-start">${["listening", "starting", "reconnecting"].includes(voiceState) ? "Pause" : "Start"}</button><button id="voice-try">Try words</button><button id="voice-keep" ${voiceHit?.index == null ? "disabled" : ""}>Highlight</button></div>`;
}
function voiceMarker() {
  if (!voiceHit || voiceHit.page !== page || voiceHit.notebookId !== current)
    return "";
  const item = book().pages[page].items[voiceHit.index];
  return item?.type === "text"
    ? `<rect class="voice-cursor" x="${item.x - 8}" y="${item.y - 26}" width="${Math.min(640, item.text.length * 11 + 16)}" height="36" rx="5"/>`
    : "";
}
function navigateVoice(phrase) {
  if (!current) return;
  if (
    phrase.toLowerCase().trim() === "highlight this" &&
    voiceHit?.index != null
  ) {
    keepVoiceHighlight();
    return;
  }
  voiceHit = null;
  const hits = matchNotebook(book(), phrase).map((hit) => ({
    ...hit,
    notebookId: current,
  }));
  if (hits.length === 1) {
    voiceHit = hits[0];
    page = voiceHit.page;
    voiceMessage = `${voiceHit.index === null ? "Page match" : "Text match"} · “${phrase}”`;
    render();
    scrollVoice();
  } else if (hits.length > 1) {
    voiceMessage = `${hits.length} matches. Choose your place.`;
    render();
    panel(
      "Choose a match",
      `<p class="dialog-intro">“${esc(phrase)}” appears in more than one place.</p><div class="menu-actions">${hits.map((h, i) => `<button data-match="${i}">Page ${h.page + 1}<small>${esc(h.text.slice(0, 100))}</small></button>`).join("")}</div>`,
    );
    dialog.querySelectorAll("[data-match]").forEach(
      (b) =>
        (b.onclick = () => {
          voiceHit = hits[Number(b.dataset.match)];
          page = voiceHit.page;
          voiceMessage = `Following page ${page + 1}`;
          dialog.close();
          render();
          scrollVoice();
        }),
    );
  } else {
    voiceMessage = `No match for “${phrase}”. Try a longer phrase.`;
    render();
  }
}
function scrollVoice() {
  requestAnimationFrame(() => {
    const marker = app.querySelector(".voice-cursor");
    if (marker)
      marker.scrollIntoView({
        block: "center",
        behavior:
          preferences.motion === "reduce" ||
          matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "instant"
            : "smooth",
      });
    else app.querySelector(".canvas-wrap")?.scrollTo({ top: 0 });
  });
}
function keepVoiceHighlight() {
  if (!voiceHit || voiceHit.page !== page || voiceHit.notebookId !== current)
    return;
  const item = book()?.pages[page].items[voiceHit?.index];
  if (item?.type !== "text") return;
  change(
    appendItem(book(), page, {
      type: "ink",
      points: [
        [item.x, item.y - 6],
        [Math.min(710, item.x + item.text.length * 10), item.y - 6],
      ],
      color: "#e8cb50",
      width: 24,
      opacity: 0.35,
    }),
  );
  notify("Highlight saved. Undo is available.");
}
function settingsMenu() {
  modal(
    "Workspace settings",
    `<p class="dialog-intro">Your preferences stay on this device. Notebook content is saved separately.</p><label>Default paper<select name="paper">${["grid", "ruled", "dots", "blank"].map((p) => `<option ${p === preferences.paper ? "selected" : ""}>${p}</option>`).join("")}</select></label><label>Library spacing<select name="density"><option value="comfortable" ${preferences.density === "comfortable" ? "selected" : ""}>Comfortable</option><option value="compact" ${preferences.density === "compact" ? "selected" : ""}>Compact</option></select></label><label>Motion<select name="motion"><option value="system" ${preferences.motion === "system" ? "selected" : ""}>Follow system</option><option value="reduce" ${preferences.motion === "reduce" ? "selected" : ""}>Reduced</option></select></label><p class="hint">Saved locally · Export a backup from the library to keep an independent copy.</p>`,
    (f) => {
      Object.assign(preferences, Object.fromEntries(f));
      try {
        savePreferences(preferences);
        render();
        notify("Preferences saved.");
      } catch {
        notify("Preferences could not be saved.");
      }
    },
  );
}
function shortcutsMenu() {
  modal(
    "Keyboard shortcuts",
    '<div class="shortcut-grid"><span>Undo</span><kbd>⌘ / Ctrl Z</kbd><span>Redo</span><kbd>⇧ ⌘ / Ctrl Z</kbd><span>Find text</span><kbd>⌘ / Ctrl F</kbd><span>Dismiss dialog</span><kbd>Esc</kbd><span>Next control</span><kbd>Tab</kbd></div><p class="hint">On tablets, pen input and touch scrolling adapt to the selected tool.</p>',
    () => {},
  );
}

render();
if (storageError) notify(storageError);

function pageOptions() {
  modal(
    "Page options",
    `<label>Paper<select name="paper">${["grid", "ruled", "dots", "blank"].map((p) => `<option value="${p}" ${(book().pages[page].paper || book().paper) === p ? "selected" : ""}>${p}</option>`).join("")}</select></label><label>Go to page<input name="destination" type="number" required min="1" max="${book().pages.length}" value="${page + 1}"></label><label>Outline title<input name="outline" maxlength="100" value="${esc(book().pages[page].outline || "")}" placeholder="Add this page to outline"></label><label>Action<select name="action"><option value="none">Keep current page</option><option value="duplicate">Duplicate current page</option><option value="earlier">Move page earlier</option><option value="later">Move page later</option><option value="remove">Remove current page (undo available)</option></select></label>`,
    (f) => {
      const next = structuredClone(book());
      next.pages[page].paper = f.get("paper");
      next.pages[page].outline = f.get("outline").trim();
      if (f.get("action") === "duplicate") {
        const copy = structuredClone(next.pages[page]);
        copy.id = crypto.randomUUID();
        next.pages.splice(page + 1, 0, copy);
        page++;
      }
      if (["earlier", "later"].includes(f.get("action"))) {
        const destination = Math.max(
          0,
          Math.min(
            next.pages.length - 1,
            page + (f.get("action") === "earlier" ? -1 : 1),
          ),
        );
        const [moving] = next.pages.splice(page, 1);
        next.pages.splice(destination, 0, moving);
        page = destination;
      }
      if (f.get("action") === "remove") {
        if (next.pages.length === 1) {
          notify("Keep at least one page in the notebook.");
          return;
        }
        next.pages.splice(page, 1);
        page = Math.min(page, next.pages.length - 1);
      }
      if (f.get("action") === "none")
        page = Math.max(
          0,
          Math.min(
            next.pages.length - 1,
            (Number(f.get("destination")) || 1) - 1,
          ),
        );
      change(next);
    },
  );
}

function manageNotebook(id) {
  const n = data.notebooks.find((n) => n.id === id);
  modal(
    "Notebook options",
    `<label>Name<input name="title" required maxlength="100" value="${esc(n.title)}"></label><label>Folder<input name="folder" maxlength="100" value="${esc(n.folder || "")}" placeholder="No folder"></label><label>Action<select name="action"><option value="rename">Save name</option><option value="duplicate">Duplicate notebook</option><option value="trash">${n.trashed ? "Restore from Trash" : "Move to Trash"}</option></select></label>`,
    (f) => {
      if (f.get("action") === "duplicate") {
        const copy = structuredClone(n);
        copy.id = crypto.randomUUID();
        copy.title = f.get("title") + " (copy)";
        copy.trashed = false;
        copy.updated = Date.now();
        data.notebooks.push(copy);
      } else {
        n.title = f.get("title").trim() || n.title;
        n.folder = f.get("folder").trim();
        if (f.get("action") === "trash") n.trashed = !n.trashed;
        n.updated = Date.now();
        histories.delete(n.id);
      }
      persist();
      render();
    },
  );
}

function exportNotebook() {
  modal(
    "Export notebook",
    `<label>Format<select name="format"><option value="backup">Editable notebook backup (JSON)</option><option value="html">Printable document (HTML)</option><option value="pdf">Annotated PDF (flattened)</option>${book().source ? '<option value="original">Original PDF (unchanged)</option>' : ""}</select></label>`,
    (f) => {
      if (f.get("format") === "backup") {
        download();
        return;
      }
      if (f.get("format") === "pdf") {
        exportFlattened();
        return;
      }
      if (f.get("format") === "original") {
        const a = document.createElement("a");
        a.href = book().source.data;
        a.download = book().source.name;
        a.click();
        return;
      }
      const n = book(),
        doc = `<!doctype html><html lang="en"><meta charset="utf-8"><title>${esc(n.title)}</title><style>body{margin:0;background:#eee}section{width:720px;height:960px;background:#fffdf3;margin:24px auto;break-after:page}svg{width:100%;height:100%}@media print{body{background:white}section{margin:0;width:100%;height:auto;aspect-ratio:3/4}@page{size:A4;margin:10mm}}</style>${n.pages.map((p) => `<section><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 960" aria-label="Notebook page">${pageBackground(p, n.paper)}${svgItems(p.items)}</svg></section>`).join("")}</html>`;
      const url = URL.createObjectURL(new Blob([doc], { type: "text/html" })),
        a = document.createElement("a");
      a.href = url;
      a.download = "JETT-notebook.html";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify("Printable document exported. Open it and print or save as PDF.");
    },
  );
}

let importing = false;
document.querySelector("#pdf-file").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file || importing) return;
  importing = true;
  try {
    notify("Opening PDF…");
    const n = await importPdf(file, (p, total) =>
      notify(`Importing page ${p} of ${total}`),
    );
    data.notebooks.push(n);
    persist();
    openNotebook(n.id);
    notify(`Imported ${n.pages.length} pages. Original PDF retained.`);
  } catch (error) {
    notify(`PDF import failed: ${error.message}`);
  } finally {
    importing = false;
    e.target.value = "";
  }
};

window.addEventListener("beforeunload", (e) => {
  if (!saved && data.notebooks.length) {
    e.preventDefault();
    e.returnValue = "";
  }
});

document.querySelector("#image-file").onchange = async (e) => {
  const file = e.target.files[0],
    target = current,
    targetPage = page;
  if (!file || !target) return;
  try {
    if (file.size > 10 * 1024 * 1024)
      throw Error("Choose an image smaller than 10 MB.");
    const bitmap = await createImageBitmap(file),
      scale = Math.min(1, 1440 / bitmap.width, 1920 / bitmap.height),
      canvas = document.createElement("canvas");
    canvas.width = bitmap.width * scale;
    canvas.height = bitmap.height * scale;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const height = Math.min(650, (400 * canvas.height) / canvas.width),
      width = (height * canvas.width) / canvas.height,
      src = canvas.toDataURL("image/jpeg", 0.9);
    canvas.width = 0;
    canvas.height = 0;
    if (current !== target || page !== targetPage) {
      notify("Return to the original page before inserting the image.");
      return;
    }
    change(
      appendItem(book(), page, {
        type: "image",
        src,
        x: 80,
        y: 80,
        width,
        height,
      }),
    );
  } catch (err) {
    notify(err.message);
  } finally {
    e.target.value = "";
  }
};

function editSelection(indices) {
  const selected = book().pages[page].items[indices[0]];
  modal(
    `${indices.length} selected object${indices.length === 1 ? "" : "s"}`,
    `${indices.length === 1 && selected.type === "text" ? `<label>Text<input name="text" value="${esc(selected.text)}" maxlength="500"></label>` : ""}<label>Move horizontally<input name="dx" type="number" value="0" min="-1000" max="1000"></label><label>Move vertically<input name="dy" type="number" value="0" min="-1000" max="1000"></label><label>Action<select name="action"><option value="move">Move / update</option><option value="duplicate">Duplicate</option><option value="delete">Delete selected objects (undo available)</option></select></label>`,
    (f) => {
      const next = structuredClone(book()),
        items = next.pages[page].items,
        action = f.get("action");
      if (action === "delete")
        next.pages[page].items = items.filter((_, i) => !indices.includes(i));
      else {
        const moved = moveItems(
          items,
          indices,
          Number(f.get("dx")),
          Number(f.get("dy")),
        );
        if (indices.length === 1 && selected.type === "text")
          moved[indices[0]].text = f.get("text");
        next.pages[page].items =
          action === "duplicate"
            ? [...items, ...indices.map((i) => moved[i])]
            : moved;
      }
      change(next);
    },
  );
}

async function exportFlattened() {
  const n = structuredClone(book());
  try {
    notify("Preparing annotated PDF…");
    const { exportPagePdf } = await import("./pdf-export.js");
    const svgs = n.pages.map(
      (p) =>
        `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="960" viewBox="0 0 720 960">${pageBackground(p, n.paper)}${svgItems(p.items)}</svg>`,
    );
    const bytes = await exportPagePdf(svgs),
      url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })),
      a = document.createElement("a");
    a.href = url;
    a.download = "JETT-annotated.pdf";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("Annotated PDF exported. Editable notebook remains saved.");
  } catch (err) {
    notify(`PDF export failed: ${err.message}`);
  }
}

installCompanion({
  panel, dialog,
  inEditor: () => Boolean(current),
  create: creationMenu,
  voice: () => { voicePanel = true; render(); app.querySelector("#voice-start")?.focus(); },
  export: exportNotebook,
  settings: settingsMenu,
});
