/**
 * CLI: npx tsx src/cli.ts <path-or-url>
 * Ingests the given file or URL with the right connector and prints the
 * IngestResult as JSON for manual verification.
 */

import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ingestText, looksLikeMarkdownName } from "./connectors/text.js";
import { ingestPaste } from "./connectors/paste.js";
import { ingestPdf } from "./node/pdf.js";
import { ingestUrl, ingestArticleHtml } from "./node/url.js";
import { ingestDocx } from "./node/docx.js";
import { IngestResult } from "./core/types.js";

function usage(): never {
  console.error(
    [
      "usage: npx tsx src/cli.ts <path-or-url>",
      "",
      "  .txt / anything else  plain text connector",
      "  .md .markdown         markdown connector",
      "  .pdf                  PDF connector (per-page blocks)",
      "  .html .htm            paste/article cleaner on local HTML",
      "  .docx                 docx connector",
      "  http(s)://…           URL → readable article connector",
    ].join("\n")
  );
  process.exit(2);
}

async function run(target: string): Promise<IngestResult> {
  if (/^https?:\/\//i.test(target)) {
    return ingestUrl(target);
  }
  const path = resolve(target);
  const name = basename(path);
  const uri = pathToFileURL(path).href;
  const bytes = new Uint8Array(await readFile(path));

  if (/\.pdf$/i.test(name)) return ingestPdf(bytes, { name, uri });
  if (/\.docx$/i.test(name)) return ingestDocx(bytes, { name, uri });
  if (/\.(html?|xhtml)$/i.test(name)) {
    return ingestArticleHtml(new TextDecoder().decode(bytes), { uri });
  }
  if (looksLikeMarkdownName(name)) return ingestText(bytes, { name, uri, markdown: true });
  return ingestText(bytes, { name, uri });
}

const target = process.argv[2];
if (!target) usage();

run(target)
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((err) => {
    console.error(`ingest failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });

// keep ingestPaste reachable for tree-shaking checks; the paste connector has
// no file form, it is exercised from tests and app code.
void ingestPaste;
