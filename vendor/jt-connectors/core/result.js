import { contentDigest, byteSize } from "./hash.js";
import { SCHEMA_VERSION, } from "./types.js";
/** Drop empty drafts, trim text, assign contiguous indexes. */
export function finalizeBlocks(drafts) {
    const blocks = [];
    for (const d of drafts) {
        const text = d.text.trim();
        if (!text)
            continue;
        const block = { text, index: blocks.length, kind: d.kind };
        if (d.locator)
            block.locator = d.locator;
        blocks.push(block);
    }
    return blocks;
}
/**
 * Assemble an IngestResult. The digest and byte size are computed from the
 * exact raw input bytes the connector received — not from the extracted text —
 * so the digest identifies the material itself.
 */
export async function makeResult(rawInput, drafts, prov, warnings = []) {
    const provenance = {
        sourceKind: prov.sourceKind,
        contentDigest: await contentDigest(rawInput),
        byteSize: byteSize(rawInput),
        capturedAt: prov.capturedAt ?? new Date().toISOString(),
    };
    if (prov.uri)
        provenance.uri = prov.uri;
    if (prov.name)
        provenance.name = prov.name;
    if (prov.title)
        provenance.title = prov.title;
    if (prov.pageCount !== undefined)
        provenance.pageCount = prov.pageCount;
    const blocks = finalizeBlocks(drafts);
    if (blocks.length === 0) {
        warnings = [...warnings, "no text content found in input"];
    }
    return { schemaVersion: SCHEMA_VERSION, blocks, provenance, warnings };
}
