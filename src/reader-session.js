// UI continuity only. Source files, records and answers remain in IndexedDB.
export const READER_SESSION_KEY = "jett.reader-session.v1";
const workspaces = new Set(["read", "annotate", "organize", "fill"]);
const validId = (value) =>
  typeof value === "string" && value.length > 0 && value.length <= 200;
const number = (value, fallback, min, max) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
const fingerprint = (doc) =>
  `${doc.provenance?.contentDigest ?? ""}:${doc.revision ?? 1}`;
export function normalizeReaderView(value = {}) {
  if (!value || typeof value !== "object") value = {};
  return {
    fingerprint:
      typeof value.fingerprint === "string"
        ? value.fingerprint.slice(0, 300)
        : "",
    returnPlace: value.returnPlace && typeof value.returnPlace==='object' ? {
      pageNumber:Math.floor(number(value.returnPlace.pageNumber,1,1,100000)),pageOffset:number(value.returnPlace.pageOffset,0,-1,1),blockIndex:Math.floor(number(value.returnPlace.blockIndex,-1,-1,1000000)),zoom:number(value.returnPlace.zoom,1,0.05,2.5),zoomMode:value.returnPlace.zoomMode==='custom'?'custom':'fit-width'
    }:null,
    pageNumber: Math.floor(number(value.pageNumber, 1, 1, 100000)),
    pageOffset: number(value.pageOffset, 0, -1, 1),
    blockIndex: Math.floor(number(value.blockIndex, -1, -1, 1000000)),
    zoomMode: value.zoomMode === "custom" ? "custom" : "fit-width",
    zoom: number(value.zoom, 1, 0.05, 2.5),
    workspace: workspaces.has(value.workspace) ? value.workspace : "read",
    search: typeof value.search === "string" ? value.search.slice(0, 500) : "",
    bentoTool:
      typeof value.bentoTool === "string" ? value.bentoTool.slice(0, 100) : "",
  };
}
export function createReaderSession({ storage, onError = () => {} } = {}) {
  let data = { version: 1, tabs: [], activeId: null, views: {} };
  try {
    storage ??= globalThis.localStorage;
    const parsed = JSON.parse(storage.getItem(READER_SESSION_KEY) || "null");
    if (parsed?.version === 1 && Array.isArray(parsed.tabs)) {
      data.tabs = [...new Set(parsed.tabs.filter(validId))];
      data.activeId = data.tabs.includes(parsed.activeId)
        ? parsed.activeId
        : (data.tabs[0] ?? null);
      for (const [id, value] of Object.entries(parsed.views ?? {}))
        if (validId(id) && value && typeof value === "object")
          Object.defineProperty(data.views, id, {
            value: normalizeReaderView(value),
            enumerable: true,
            writable: true,
            configurable: true,
          });
    }
  } catch {
    onError("Reading works, but this browser could not restore your tabs.");
  }
  function save() {
    try {
      storage.setItem(READER_SESSION_KEY, JSON.stringify(data));
      onError("");
      return true;
    } catch {
      onError(
        "Your documents are safe. This browser could not save tab positions; keep this window open to retain them.",
      );
      return false;
    }
  }
  const get = (doc) => {
    const held = Object.hasOwn(data.views, doc.id) ? data.views[doc.id] : null;
    const view = normalizeReaderView(held ?? {});
    if (view.fingerprint && view.fingerprint !== fingerprint(doc)) {
      view.returnPlace=null;
      view.pageNumber = 1;
      view.pageOffset = 0;
      view.blockIndex = -1;
      view.search = "";
    }
    view.fingerprint = fingerprint(doc);
    return view;
  };
  function update(doc, patch) {
    Object.defineProperty(data.views, doc.id, {
      value: normalizeReaderView({
        ...get(doc),
        ...patch,
        fingerprint: fingerprint(doc),
      }),
      enumerable: true,
      writable: true,
      configurable: true,
    });
    save();
  }
  return {
    get,
    snapshot: () => structuredClone(data),
    update,
    open(doc) {
      if (!data.tabs.includes(doc.id)) data.tabs.push(doc.id);
      data.activeId = doc.id;
      update(doc, {});
    },
    close(id) {
      const index = data.tabs.indexOf(id);
      if (index < 0) return;
      data.tabs.splice(index, 1);
      if (data.activeId === id)
        data.activeId =
          data.tabs[Math.min(index, data.tabs.length - 1)] ?? null;
      save();
    },
    reconcile(docs) {
      const ids = new Set(docs.map((doc) => doc.id));
      data.tabs = data.tabs.filter((id) => ids.has(id));
      if (!data.tabs.includes(data.activeId))
        data.activeId = data.tabs[0] ?? null;
      for (const id of Object.keys(data.views))
        if (!ids.has(id)) delete data.views[id];
      save();
    },
  };
}
