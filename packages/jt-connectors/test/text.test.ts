import { describe, expect, it } from "vitest";
import { ingestText } from "../src/connectors/text.js";

describe("text connector", () => {
  it("splits plain text into paragraphs", async () => {
    const result = await ingestText("First paragraph.\n\nSecond paragraph.\n\n\nThird.", {
      name: "note.txt",
    });
    expect(result.blocks.map((b) => b.text)).toEqual([
      "First paragraph.",
      "Second paragraph.",
      "Third.",
    ]);
    expect(result.blocks.map((b) => b.index)).toEqual([0, 1, 2]);
    expect(result.blocks.every((b) => b.kind === "paragraph")).toBe(true);
    expect(result.provenance.sourceKind).toBe("text");
    expect(result.provenance.name).toBe("note.txt");
    expect(result.warnings).toEqual([]);
  });

  it("detects markdown structure by file name", async () => {
    const md = [
      "# Title here",
      "",
      "Intro paragraph.",
      "",
      "## Section",
      "",
      "- first item",
      "- second item",
      "",
      "> a quoted line",
      "",
      "```",
      "const x = 1;",
      "```",
    ].join("\n");
    const result = await ingestText(md, { name: "doc.md" });
    expect(result.provenance.sourceKind).toBe("markdown");
    expect(result.provenance.title).toBe("Title here");
    expect(result.blocks.map((b) => b.kind)).toEqual([
      "heading",
      "paragraph",
      "heading",
      "list-item",
      "list-item",
      "quote",
      "code",
    ]);
    expect(result.blocks[0].locator).toBe("h1");
    expect(result.blocks[2].locator).toBe("h2");
    expect(result.blocks[6].text).toBe("const x = 1;");
  });

  it("accepts raw bytes and hashes the exact input reproducibly", async () => {
    const bytes = new TextEncoder().encode("same input\n\ntwice");
    const a = await ingestText(bytes, { name: "a.txt" });
    const b = await ingestText(bytes, { name: "b.txt" });
    expect(a.provenance.contentDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(a.provenance.contentDigest).toBe(b.provenance.contentDigest);
    expect(a.provenance.byteSize).toBe(bytes.byteLength);
  });

  it("malformed input: unclosed code fence still ingests, with a warning", async () => {
    const result = await ingestText("# Head\n\n```js\nnever closed", { name: "bad.md" });
    expect(result.blocks.map((b) => b.kind)).toEqual(["heading", "code"]);
    expect(result.blocks[1].text).toBe("never closed");
    expect(result.warnings).toContain("unclosed code fence; captured to end of input");
  });

  it("malformed input: empty string yields no blocks plus a warning", async () => {
    const result = await ingestText("", { name: "empty.txt" });
    expect(result.blocks).toEqual([]);
    expect(result.warnings).toContain("no text content found in input");
    expect(result.provenance.byteSize).toBe(0);
  });
});
