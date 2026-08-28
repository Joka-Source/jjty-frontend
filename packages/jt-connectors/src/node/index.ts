/**
 * jt-connectors — node-only surface. Do not import from browser code.
 */

export { ingestPdf } from "./pdf.js";
export type { PdfIngestOptions } from "./pdf.js";
export { ingestUrl, ingestArticleHtml } from "./url.js";
export type { UrlIngestOptions, ArticleIngestOptions } from "./url.js";
export { ingestDocx } from "./docx.js";
export type { DocxIngestOptions } from "./docx.js";
