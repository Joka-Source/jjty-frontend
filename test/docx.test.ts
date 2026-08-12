import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ingestDocx } from "../src/node/docx.js";

const fixture = resolve(__dirname, "fixtures/sample.docx");

describe("docx connector", () => {
  it("extracts heading and paragraphs in order", async () => {
    const bytes = new Uint8Array(await readFile(fixture));
    const result = await ingestDocx(bytes, { name: "sample.docx" });

    expect(result.provenance.sourceKind).toBe("docx");
    expect(result.provenance.title).toBe("Fixture document");
    expect(result.blocks.map((b) => [b.kind, b.text])).toEqual([
      ["heading", "Fixture document"],
      ["paragraph", "A paragraph inside the docx fixture."],
      ["paragraph", "A second paragraph, to prove ordering."],
    ]);
  });

  it("hashes the exact docx bytes reproducibly", async () => {
    const bytes = new Uint8Array(await readFile(fixture));
    const a = await ingestDocx(bytes);
    const b = await ingestDocx(bytes);
    expect(a.provenance.contentDigest).toBe(b.provenance.contentDigest);
    expect(a.provenance.byteSize).toBe(bytes.byteLength);
  });

  it("malformed input: non-docx bytes are rejected", async () => {
    const junk = new TextEncoder().encode("certainly not a zip archive");
    await expect(ingestDocx(junk)).rejects.toThrow();
  });
});
