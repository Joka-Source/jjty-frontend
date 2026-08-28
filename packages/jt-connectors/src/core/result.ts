import { contentDigest, byteSize } from "./hash.js";
import {
  Block,
  BlockKind,
  IngestResult,
  Provenance,
  SCHEMA_VERSION,
  SourceKind,
} from "./types.js";

export interface ProvenanceInput {
  sourceKind: SourceKind;
  uri?: string;
  name?: string;
  title?: string;
  pageCount?: number;
  /** Override capture time (mostly for tests). Defaults to now, UTC. */
  capturedAt?: string;
}

/** Draft block before indexes are assigned. */
export interface DraftBlock {
  text: string;
  kind: BlockKind;
  locator?: string;
}

/** Drop empty drafts, trim text, assign contiguous indexes. */
export function finalizeBlocks(drafts: DraftBlock[]): Block[] {
  const blocks: Block[] = [];
  for (const d of drafts) {
    const text = d.text.trim();
    if (!text) continue;
    const block: Block = { text, index: blocks.length, kind: d.kind };
    if (d.locator) block.locator = d.locator;
    blocks.push(block);
  }
  return blocks;
}

/**
 * Assemble an IngestResult. The digest and byte size are computed from the
 * exact raw input bytes the connector received — not from the extracted text —
 * so the digest identifies the material itself.
 */
export async function makeResult(
  rawInput: string | Uint8Array,
  drafts: DraftBlock[],
  prov: ProvenanceInput,
  warnings: string[] = []
): Promise<IngestResult> {
  const provenance: Provenance = {
    sourceKind: prov.sourceKind,
    contentDigest: await contentDigest(rawInput),
    byteSize: byteSize(rawInput),
    capturedAt: prov.capturedAt ?? new Date().toISOString(),
  };
  if (prov.uri) provenance.uri = prov.uri;
  if (prov.name) provenance.name = prov.name;
  if (prov.title) provenance.title = prov.title;
  if (prov.pageCount !== undefined) provenance.pageCount = prov.pageCount;

  const blocks = finalizeBlocks(drafts);
  if (blocks.length === 0) {
    warnings = [...warnings, "no text content found in input"];
  }

  return { schemaVersion: SCHEMA_VERSION, blocks, provenance, warnings };
}
