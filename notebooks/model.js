export const VERSION = 1;
export function notebook(
  title = "Untitled notebook",
  paper = "grid",
  color = "#44c8de",
) {
  return {
    id: crypto.randomUUID(),
    title: title.trim() || "Untitled notebook",
    paper,
    color,
    favorite: false,
    updated: Date.now(),
    pages: [{ id: crypto.randomUUID(), items: [] }],
  };
}
export function validate(data) {
  if (
    !data ||
    data.version !== VERSION ||
    !Array.isArray(data.notebooks) ||
    data.notebooks.length > 1000
  )
    throw Error("This is not a supported notebook backup.");
  const ids = new Set();
  for (const n of data.notebooks) {
    if (
      typeof n.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(n.id) ||
      ids.has(n.id) ||
      typeof n.title !== "string" ||
      (n.folder !== undefined && typeof n.folder !== "string") ||
      !/^#[0-9a-f]{6}$/i.test(n.color) ||
      !["grid", "ruled", "blank", "dots"].includes(n.paper) ||
      !Array.isArray(n.pages) ||
      !n.pages.length
    )
      throw Error("Invalid notebook data.");
    if (
      n.source &&
      (typeof n.source.name !== "string" ||
        typeof n.source.data !== "string" ||
        !/^data:application\/pdf;base64,[A-Za-z0-9+/=]+$/.test(n.source.data))
    )
      throw Error("Invalid PDF source.");
    ids.add(n.id);
    for (const p of n.pages) {
      if (
        p.background &&
        (typeof p.background !== "string" ||
          !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(p.background))
      )
        throw Error("Invalid page background.");
      if (p.sourceText !== undefined && typeof p.sourceText !== "string")
        throw Error("Invalid PDF text.");
      if (
        p.paper !== undefined &&
        !["grid", "ruled", "dots", "blank"].includes(p.paper)
      )
        throw Error("Invalid page template.");
      if (typeof p.id !== "string" || !Array.isArray(p.items))
        throw Error("Invalid page data.");
      for (const i of p.items) {
        if (
          i.opacity !== undefined &&
          (!Number.isFinite(i.opacity) || i.opacity < 0 || i.opacity > 1)
        )
          throw Error("Invalid opacity.");
        if (!["ink", "text", "image"].includes(i.type))
          throw Error("Unsupported page item.");
        if (
          i.type === "image" &&
          (typeof i.src !== "string" ||
            !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(i.src) ||
            ![i.x, i.y, i.width, i.height].every(Number.isFinite) ||
            i.width <= 0 ||
            i.height <= 0)
        )
          throw Error("Invalid image.");
        if (
          i.type === "text" &&
          (typeof i.text !== "string" ||
            !Number.isFinite(i.x) ||
            !Number.isFinite(i.y))
        )
          throw Error("Invalid text.");
        if (
          i.type === "ink" &&
          (!Array.isArray(i.points) ||
            i.points.some(
              (p) =>
                !Array.isArray(p) ||
                p.length !== 2 ||
                p.some((v) => !Number.isFinite(v)),
            ) ||
            !/^#[0-9a-f]{6}$/i.test(i.color) ||
            !Number.isFinite(i.width) ||
            i.width <= 0 ||
            i.width > 50)
        )
          throw Error("Invalid ink.");
      }
    }
  }
  return structuredClone(data);
}
export function appendItem(n, page, item) {
  const next = structuredClone(n);
  next.pages[page].items.push(structuredClone(item));
  next.updated = Date.now();
  return next;
}
