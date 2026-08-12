/**
 * The one shape every connector returns. Material enters jt as blocks with
 * provenance — never as a stripped file.
 */

export type BlockKind =
  | "paragraph"
  | "heading"
  | "list-item"
  | "code"
  | "quote"
  | "page";

export interface Block {
  /** The text of this block, trimmed, never empty. */
  text: string;
  /** Zero-based position of this block in the ingested material. */
  index: number;
  /** What kind of block this is. */
  kind: BlockKind;
  /**
   * Where in the source this block came from, when the source has addressable
   * structure. E.g. "page:3" for PDFs, "h2" for headings.
   */
  locator?: string;
}

export type SourceKind =
  | "text"
  | "markdown"
  | "pdf"
  | "web-page"
  | "paste"
  | "docx";

export interface Provenance {
  /** What kind of material this came from. */
  sourceKind: SourceKind;
  /** Where the material came from, when it has an address (URL, file path). */
  uri?: string;
  /** The material's own name (file name, usually), when it has one. */
  name?: string;
  /** sha-256 digest of the exact input bytes, as "sha256:<hex>". */
  contentDigest: string;
  /** Size of the exact input in bytes. */
  byteSize: number;
  /** When jt captured this material (ISO 8601, UTC). */
  capturedAt: string;
  /** Title of the material, when one could be determined. */
  title?: string;
  /** Number of pages, for paged material (PDF). */
  pageCount?: number;
}

export interface IngestResult {
  /** Version of this result's schema (semver). */
  schemaVersion: string;
  /** The content, in order. */
  blocks: Block[];
  /** Where the content came from. Non-optional — that is the point of jt. */
  provenance: Provenance;
  /** Anything that went wrong or was lossy on the way in. */
  warnings: string[];
}

export const SCHEMA_VERSION = "0.1.0";
