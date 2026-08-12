import { describe, expect, it } from "vitest";
import { ingestPaste } from "../src/connectors/paste.js";

describe("paste connector", () => {
  it("cleans an html paste into structured blocks", async () => {
    const html =
      '<meta charset="utf-8"><h2>Copied heading</h2><p>First <b>bold</b> para.</p>' +
      "<ul><li>alpha</li><li>beta</li></ul><script>evil()</script>" +
      "<blockquote>a quote</blockquote>";
    const result = await ingestPaste({ html, text: "fallback" });
    expect(result.blocks.map((b) => [b.kind, b.text])).toEqual([
      ["heading", "Copied heading"],
      ["paragraph", "First bold para."],
      ["list-item", "alpha"],
      ["list-item", "beta"],
      ["quote", "a quote"],
    ]);
    expect(result.provenance.sourceKind).toBe("paste");
    expect(JSON.stringify(result.blocks)).not.toContain("evil");
  });

  it("decodes entities and keeps pre blocks verbatim", async () => {
    const html = "<p>Fish &amp; chips &mdash; &#163;5</p><pre>line one\n  indented</pre>";
    const result = await ingestPaste({ html });
    expect(result.blocks[0].text).toBe("Fish & chips — £5");
    expect(result.blocks[1].kind).toBe("code");
    expect(result.blocks[1].text).toBe("line one\n  indented");
  });

  it("passes plain text through as paragraphs", async () => {
    const result = await ingestPaste({ text: "one\n\ntwo" });
    expect(result.blocks.map((b) => b.text)).toEqual(["one", "two"]);
    expect(result.provenance.sourceKind).toBe("paste");
  });

  it("hashes the flavor actually used, reproducibly", async () => {
    const a = await ingestPaste({ html: "<p>same</p>" });
    const b = await ingestPaste({ html: "<p>same</p>" });
    expect(a.provenance.contentDigest).toBe(b.provenance.contentDigest);
  });

  it("malformed input: markup-only html falls back to text flavor with warning", async () => {
    const result = await ingestPaste({ html: "<div><img src=x></div>", text: "the real words" });
    expect(result.blocks.map((b) => b.text)).toEqual(["the real words"]);
    expect(result.warnings).toContain("html paste flavor had no text; used text/plain flavor");
  });

  it("malformed input: broken nesting and unclosed tags still yield text", async () => {
    const result = await ingestPaste({ html: "<p>never closed <b>bold <i>deep</p><li>stray item" });
    const all = result.blocks.map((b) => b.text).join(" | ");
    expect(all).toContain("never closed bold deep");
    expect(all).toContain("stray item");
  });

  it("malformed input: payload with neither flavor throws", async () => {
    await expect(ingestPaste({})).rejects.toThrow(/neither html nor text/);
  });
});
