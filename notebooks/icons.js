// Original vector controls, sized consistently with the observed editor toolbar.
export const iconPaths = {
  lasso:
    '<path d="M8 17c-4-1-6-3-6-6s4-6 10-6 10 3 10 6-4 6-10 6H8c-3 0-3 5 0 5 2 0 3-2 2-4" stroke-dasharray="3 2"/>',
  pen: '<path d="m5 16-1 5 5-1L21 8a2 2 0 0 0-5-5L5 16Zm9-11 5 5M5 16l4 4"/>',
  rectangle: '<rect x="4" y="5" width="16" height="14" rx="1"/>',
  laser: '<path d="m5 19 9-9 3 3-9 9Z M17 2v4m5 2-4 1m-6-6 2 3m7 9-3-1"/>',
  highlighter: '<path d="m5 15 9-11 6 5-9 11-6-5Zm-1 2-2 5 6-2M11 7l6 5"/>',
  text: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M8 9h8m-4 0v7m-2 0h4"/>',
  sticky: '<path d="M4 4h16v11l-5 5H4V4Zm11 16v-5h5M8 9h8m-8 4h4"/>',
  image:
    '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="2"/><path d="m4 18 6-6 4 4 3-3 4 4"/>',
  eraser:
    '<path d="m4 13 9-10 8 7-10 11H8l-4-4a3 3 0 0 1 0-4Zm4-4 9 8m-6 4h10"/>',
  read: '<path d="M9 12V5a2 2 0 0 1 4 0v6-7a2 2 0 0 1 4 0v8-5a2 2 0 0 1 4 0v9c0 4-3 6-7 6-3 0-5-2-7-5l-4-5a2 2 0 0 1 3-2l3 2Z"/>',
};
export function toolIcon(name) {
  return `<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconPaths[name] || ""}</svg>`;
}
