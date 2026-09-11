export function pageBackground(p, fallbackPaper) {
  return p.background
    ? `<image href="${p.background}" width="720" height="960" preserveAspectRatio="xMidYMid meet"/>`
    : paperBackground(p.paper || fallbackPaper);
}
function paperBackground(paper) {
  const mark =
    paper === "grid"
      ? '<path d="M 24 0 H 0 V 24" fill="none" stroke="#aeb4a3" stroke-opacity=".15"/>'
      : paper === "ruled"
        ? '<path d="M 0 0 H 720" stroke="#9ea9bf" stroke-opacity=".25"/>'
        : paper === "dots"
          ? '<circle cx="12" cy="12" r="1" fill="#99a3af" fill-opacity=".4"/>'
          : "";
  return `<defs><pattern id="paper-pattern-${paper}" width="${paper === "ruled" ? 720 : 24}" height="${paper === "ruled" ? 32 : 24}" patternUnits="userSpaceOnUse">${mark}</pattern></defs><rect width="720" height="960" fill="#fffdf3"/><rect width="720" height="960" fill="url(#paper-pattern-${paper})"/>`;
}
