import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ingestPdf } from "../src/node/pdf.js";

const fixture = resolve(__dirname, "fixtures/sample.pdf");

describe("pdf connector", () => {
  it("extracts one block per page with page locators", async () => {
    const bytes = new Uint8Array(await readFile(fixture));
    const result = await ingestPdf(bytes, { name: "sample.pdf" });

    expect(result.provenance.sourceKind).toBe("pdf");
    expect(result.provenance.pageCount).toBe(2);
    expect(result.provenance.title).toBe("jt fixture: two page sample");
    expect(result.blocks).toHaveLength(2);
    expect(result.blocks[0].kind).toBe("page");
    expect(result.blocks[0].locator).toBe("page:1");
    expect(result.blocks[0].text).toContain("first page of the jt fixture");
    expect(result.blocks[1].locator).toBe("page:2");
    expect(result.blocks[1].text).toContain("second page carries different text");
  });

  it("hashes the exact pdf bytes reproducibly", async () => {
    const bytes = new Uint8Array(await readFile(fixture));
    const a = await ingestPdf(bytes, { name: "sample.pdf" });
    const b = await ingestPdf(bytes, { name: "sample.pdf" });
    expect(a.provenance.contentDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(a.provenance.contentDigest).toBe(b.provenance.contentDigest);
    expect(a.provenance.byteSize).toBe(bytes.byteLength);
  });

  it("malformed input: non-pdf bytes are rejected", async () => {
    const junk = new TextEncoder().encode("this is not a pdf at all, not even close");
    await expect(ingestPdf(junk)).rejects.toThrow();
  });
});
