/**
 * Conformance: every connector's output must validate against the single
 * IngestResult JSON Schema (draft 2020-12) defined in src/schema/.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import schema from "../src/schema/ingestresult.schema.json" with { type: "json" };
import { ingestText } from "../src/connectors/text.js";
import { ingestPaste } from "../src/connectors/paste.js";
import { ingestPdf } from "../src/node/pdf.js";
import { ingestArticleHtml } from "../src/node/url.js";
import { ingestDocx } from "../src/node/docx.js";
import { IngestResult } from "../src/core/types.js";

const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats.default(ajv);
const validate = ajv.compile(schema);

function assertValid(name: string, result: IngestResult) {
  const ok = validate(result);
  if (!ok) {
    throw new Error(`${name} failed schema validation: ${ajv.errorsText(validate.errors)}`);
  }
  expect(ok).toBe(true);
}

describe("IngestResult conformance (draft 2020-12)", () => {
  it("text connector conforms", async () => {
    assertValid("text", await ingestText("hello\n\nworld", { name: "a.txt" }));
  });

  it("markdown connector conforms", async () => {
    assertValid("markdown", await ingestText("# T\n\nbody", { name: "a.md" }));
  });

  it("paste connector conforms (html and plain)", async () => {
    assertValid("paste-html", await ingestPaste({ html: "<p>hi</p>" }));
    assertValid("paste-plain", await ingestPaste({ text: "hi" }));
  });

  it("pdf connector conforms", async () => {
    const bytes = new Uint8Array(await readFile(resolve(__dirname, "fixtures/sample.pdf")));
    assertValid("pdf", await ingestPdf(bytes, { name: "sample.pdf" }));
  });

  it("url/article connector conforms", async () => {
    const html = await readFile(resolve(__dirname, "fixtures/article.html"), "utf8");
    assertValid("web-page", await ingestArticleHtml(html, { uri: "https://fixture.test/walk" }));
  });

  it("docx connector conforms", async () => {
    const bytes = new Uint8Array(await readFile(resolve(__dirname, "fixtures/sample.docx")));
    assertValid("docx", await ingestDocx(bytes, { name: "sample.docx" }));
  });

  it("edge results conform too (empty input, warnings present)", async () => {
    assertValid("empty-text", await ingestText("", { name: "empty.txt" }));
  });

  it("schema itself rejects a result stripped of provenance", async () => {
    const good = await ingestText("hello", { name: "a.txt" });
    const stripped = { ...good } as Record<string, unknown>;
    delete stripped.provenance;
    expect(validate(stripped)).toBe(false);
  });
});
