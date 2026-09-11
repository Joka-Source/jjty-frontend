import tokens from "./design/tokens.json" with { type: "json" };
export function installTokens() {
  for (const [group, values] of Object.entries(tokens))
    for (const [name, value] of Object.entries(values))
      document.documentElement.style.setProperty(
        `--j-${group}-${name}`,
        typeof value === "number"
          ? `${value}${group === "motion" ? "ms" : "px"}`
          : value,
      );
}
export const defaults = {
  paper: "grid",
  density: "comfortable",
  motion: "system",
};
export function loadPreferences() {
  try {
    return {
      ...defaults,
      ...JSON.parse(localStorage.getItem("jett-ui-preferences-v1") || "{}"),
    };
  } catch {
    return { ...defaults };
  }
}
export function savePreferences(p) {
  localStorage.setItem("jett-ui-preferences-v1", JSON.stringify(p));
  applyPreferences(p);
}
export function applyPreferences(p) {
  document.documentElement.dataset.density = p.density;
  document.documentElement.dataset.motion = p.motion;
}
export function matchNotebook(n, phrase) {
  const q = phrase
    .toLowerCase()
    .trim()
    .replace(/[.,!?;:]+$/, "");
  if (q.length < 3) return [];
  return n.pages.flatMap((p, page) => {
    const items = p.items.flatMap((item, index) =>
      item.type === "text" && item.text.toLowerCase().includes(q)
        ? [{ page, index, text: item.text }]
        : [],
    );
    return items.length
      ? items
      : (p.sourceText || "").toLowerCase().includes(q)
        ? [{ page, index: null, text: phrase }]
        : [];
  });
}
