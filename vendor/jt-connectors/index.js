/**
 * jt-connectors — isomorphic surface.
 *
 * Safe to import in a browser: only text, paste, and core primitives.
 * Node-only connectors (pdf, url, docx) live under src/node/ and must be
 * imported from there explicitly.
 */
export * from "./core/types.js";
export { contentDigest, byteSize } from "./core/hash.js";
export { htmlToBlocks } from "./core/html.js";
export { ingestText, looksLikeMarkdownName } from "./connectors/text.js";
export { ingestPaste } from "./connectors/paste.js";
