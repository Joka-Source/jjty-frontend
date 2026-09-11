import { notebook, validate, appendItem, VERSION } from "./model.js";
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
  const raw = localStorage.getItem(key);
  if (raw) data = validate(JSON.parse(raw));
} catch {
  storageError =
    "Saved data could not be opened. It has not been overwritten. Restore a valid backup or reload after resolving browser storage.";
  saved = false;
}
function notify(s) {
  document.querySelector("#notice").textContent = s;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(
    () => (document.querySelector("#notice").textContent = ""),
    5500,
  );
}
function persist() {
  if (storageError) {
    notify(storageError);
    return false;
  }
  try {
    localStorage.setItem(key, JSON.stringify(data));
    saved = true;
    return true;
  } catch {
    saved = false;
    notify("Storage is full or unavailable. Export a backup before closing.");
    return false;
  }
}
function book() {
  return data.notebooks.find((n) => n.id === current);
}
function change(next) {
  undo.push(structuredClone(book()));
  redo = [];
  data.notebooks = data.notebooks.map((n) => (n.id === current ? next : n));
  persist();
  render();
}
function modal(title, body, submit) {
  dialog.innerHTML = `<form><h2>${title}</h2>${body}<menu><button type="button" id="cancel">Cancel</button><button class="primary" type="submit">Save</button></menu></form>`;
  dialog.querySelector("#cancel").onclick = () => dialog.close();
  dialog.querySelector("form").onsubmit = (e) => {
    e.preventDefault();
    submit(new FormData(e.target));
    dialog.close();
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
      current = n.id;
      page = 0;
      undo = [];
      redo = [];
      render();
    },
  );
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
}
function library() {
  const list = data.notebooks
    .filter(
      (n) =>
        (filter !== "favorites" || n.favorite) &&
        n.title.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) => b.updated - a.updated);
  app.innerHTML = `<div class="shell"><aside class="sidebar"><div class="brand">JETT<small>YOUR WORK, TOGETHER</small></div><button class="nav ${filter === "all" ? "active" : ""}" data-filter="all">▤ &nbsp; Documents</button><button class="nav ${filter === "favorites" ? "active" : ""}" data-filter="favorites">☆ &nbsp; Favorites</button><div class="bottom"><a href="/">Open document desk ↗</a><button id="backup">Export backup</button><button id="import">Restore backup</button><p class="local">Saved on this browser.<br>Export a backup to keep a separate copy.</p></div></aside><main class="library"><div class="heading"><h1>${filter === "favorites" ? "Favorites" : "Documents"}</h1><input class="search" aria-label="Search notebooks" placeholder="Search your notebooks" value="${esc(query)}"><button class="primary" id="new">＋ New notebook</button></div><div class="subhead"><span>${list.length} notebook${list.length === 1 ? "" : "s"}</span><span>Last edited ↓</span></div><div class="books">${list.map((n) => `<div class="book"><button class="star" data-star="${n.id}" aria-label="${n.favorite ? "Unfavorite" : "Favorite"} ${esc(n.title)}">${n.favorite ? "★" : "☆"}</button><button data-open="${n.id}" aria-label="Open ${esc(n.title)}"><div class="cover" style="background:${n.color}"><span>${esc(n.title)}</span><small>JETT / NOTEBOOK</small></div><span class="book-title">${esc(n.title)}</span><span class="book-meta">${n.pages.length} page${n.pages.length > 1 ? "s" : ""} · ${new Date(n.updated).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span></button></div>`).join("")}</div>${!list.length ? `<div class="empty"><div style="font-size:50px">▤</div><h2>${query ? "No notebooks found" : "A little space for your next idea."}</h2><p>${query ? "Try another name." : "Create a notebook. Put pen to paper. Pick up where you left off."}</p>${!query ? '<button id="empty-new" class="primary">Create a notebook</button>' : ""}</div>` : ""}</main></div>`;
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
        current = b.dataset.open;
        page = 0;
        undo = [];
        redo = [];
        render();
      }),
  );
  app.querySelectorAll("[data-star]").forEach(
    (b) =>
      (b.onclick = () => {
        const n = data.notebooks.find((n) => n.id === b.dataset.star);
        n.favorite = !n.favorite;
        persist();
        render();
      }),
  );
  app.querySelector("#new").onclick = create;
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
      i.type === "ink"
        ? `<polyline points="${i.points.map((p) => p.join(",")).join(" ")}" stroke="${i.color}" stroke-width="${i.width}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
        : `<text x="${i.x}" y="${i.y}" font-family="system-ui" font-size="20" fill="#24476a">${esc(i.text)}</text>`,
    )
    .join("");
}
function editor() {
  const n = book();
  page = Math.min(page, n.pages.length - 1);
  app.innerHTML = `<div class="editor"><div class="tabbar"><button id="home" aria-label="Back to library">⌂</button><input id="title" aria-label="Notebook title" value="${esc(n.title)}" maxlength="100"><span style="margin-left:auto;font-size:12px">JETT</span></div><div class="toolbar"><button id="sidebar" aria-label="Toggle pages">▤</button><button id="find" aria-label="Find text">⌕</button><div class="tools">${[
    ["pen", "✎", "Pen"],
    ["highlighter", "▰", "Highlighter"],
    ["text", "T", "Text"],
    ["eraser", "◇", "Erase stroke"],
    ["read", "☞", "Read only"],
  ]
    .map(
      ([id, icon, label]) =>
        `<button data-tool="${id}" aria-label="${label}" title="${label}" class="${tool === id ? "selected" : ""}">${icon}</button>`,
    )
    .join(
      "",
    )}<input id="color" aria-label="Ink color" type="color" value="${color}"><select id="width" aria-label="Stroke width">${[2, 4, 8].map((w) => `<option ${width === w ? "selected" : ""} value="${w}">${w} px</option>`).join("")}</select></div><button id="undo" aria-label="Undo" ${!undo.length ? "disabled" : ""}>↶</button><button id="redo" aria-label="Redo" ${!redo.length ? "disabled" : ""}>↷</button><button id="add" aria-label="Add page">＋</button><button id="export" aria-label="Export backup">↥</button><button id="page-options" aria-label="Page options">⋯</button></div><div class="desk">${sidebar ? `<aside class="pages"><h3>Pages <span style="color:#8a96a5">${n.pages.length}</span></h3>${n.pages.map((p, i) => `<button data-page="${i}" class="thumb ${i === page ? "active" : ""}" aria-label="Page ${i + 1}"><svg viewBox="0 0 720 960" width="100%" height="85%">${svgItems(p.items)}</svg>${i + 1}</button>`).join("")}<button id="add-side" aria-label="Add another page">＋ Add page</button></aside>` : ""}<main class="canvas-wrap"><div class="paper ${n.paper}"><svg id="ink" viewBox="0 0 720 960" role="img" aria-label="Notebook page ${page + 1}">${svgItems(n.pages[page].items)}</svg></div></main></div><div class="footer"><span>${page + 1} of ${n.pages.length} · ${tool === "read" ? "Read only" : tool === "eraser" ? "Click near a stroke to erase" : tool === "text" ? "Click the paper to add text" : "Draw on the paper"}</span><span>${saved ? "Saved on this browser" : "Unsaved — export a backup"}</span></div></div>`;
  app.querySelector("#home").onclick = () => {
    current = null;
    render();
  };
  app.querySelector("#title").onchange = (e) => {
    const next = structuredClone(book());
    next.title = e.target.value.trim() || "Untitled notebook";
    change(next);
  };
  app.querySelectorAll("[data-tool]").forEach(
    (b) =>
      (b.onclick = () => {
        tool = b.dataset.tool;
        render();
      }),
  );
  app.querySelectorAll("[data-page]").forEach(
    (b) =>
      (b.onclick = () => {
        page = +b.dataset.page;
        render();
      }),
  );
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
  app.querySelector("#export").onclick = download;
  app.querySelector("#find").onclick = find;
  app.querySelector("#page-options").onclick = pageOptions;
  attachInk();
}
function history(forward) {
  const from = forward ? redo : undo,
    to = forward ? undo : redo;
  if (!from.length) return;
  to.push(structuredClone(book()));
  const next = from.pop();
  data.notebooks = data.notebooks.map((n) => (n.id === current ? next : n));
  persist();
  render();
}
function find() {
  modal(
    "Find in notebook",
    '<label>Text<input name="query" required placeholder="Search typed notes"></label><p class="hint">Search currently covers typed text. Handwriting recognition is not connected.</p>',
    (f) => {
      const q = f.get("query").toLowerCase();
      const i = book().pages.findIndex((p) =>
        p.items.some(
          (i) => i.type === "text" && i.text.toLowerCase().includes(q),
        ),
      );
      if (i < 0) notify("No matching typed text.");
      else {
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
    if (tool === "text") {
      modal(
        "Add text",
        '<label>Text<input name="text" required maxlength="500"></label>',
        (f) =>
          change(
            appendItem(book(), page, {
              type: "text",
              text: f.get("text"),
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
    points = [p, p];
    svg.setPointerCapture(e.pointerId);
    line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", tool === "highlighter" ? "#e8cb50" : color);
    line.setAttribute("stroke-width", tool === "highlighter" ? 18 : width);
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("stroke-linejoin", "round");
    line.setAttribute("points", points.map((p) => p.join(",")).join(" "));
    svg.append(line);
  };
  svg.onpointermove = (e) => {
    if (!points) return;
    points.push(pos(e));
    line.setAttribute("points", points.map((p) => p.join(",")).join(" "));
  };
  svg.onpointerup = () => {
    if (!points) return;
    const item = {
      type: "ink",
      points,
      color: tool === "highlighter" ? "#e8cb50" : color,
      width: tool === "highlighter" ? 18 : width,
    };
    points = null;
    change(appendItem(book(), page, item));
  };
  svg.onpointercancel = () => {
    points = null;
    line?.remove();
  };
}
document.querySelector("#restore").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    if (file.size > 20 * 1024 * 1024)
      throw Error("Backup exceeds the 20 MB import limit.");
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
render();
if (storageError) notify(storageError);

function pageOptions() {
  modal(
    "Page options",
    `<label>Paper<select name="paper">${["grid", "ruled", "dots", "blank"].map((p) => `<option value="${p}" ${book().paper === p ? "selected" : ""}>${p}</option>`).join("")}</select></label><label>Action<select name="action"><option value="none">Keep current page</option><option value="duplicate">Duplicate current page</option><option value="remove">Remove current page (undo available)</option></select></label>`,
    (f) => {
      const next = structuredClone(book());
      next.paper = f.get("paper");
      if (f.get("action") === "duplicate") {
        const copy = structuredClone(next.pages[page]);
        copy.id = crypto.randomUUID();
        next.pages.splice(page + 1, 0, copy);
        page++;
      }
      if (f.get("action") === "remove") {
        if (next.pages.length === 1) {
          notify("Keep at least one page in the notebook.");
          return;
        }
        next.pages.splice(page, 1);
        page = Math.min(page, next.pages.length - 1);
      }
      change(next);
    },
  );
}
