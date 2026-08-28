/**
 * URL → readable article connector. Node-only (jsdom + @mozilla/readability).
 *
 * Split in two so tests never touch the network:
 * - ingestArticleHtml(html, ...) does all the work on an HTML string.
 * - ingestUrl(url) fetches, then delegates.
 */

import { JSDOM, VirtualConsole } from "jsdom";
import { Readability } from "@mozilla/readability";
import { htmlToBlocks } from "../core/html.js";
import { makeResult } from "../core/result.js";
import { IngestResult } from "../core/types.js";

export interface ArticleIngestOptions {
  /** The address the HTML came from. Recorded in provenance. */
  uri: string;
  capturedAt?: string;
}

/** Extract the readable article from an HTML string fetched from `uri`. */
export async function ingestArticleHtml(
  html: string | Uint8Array,
  opts: ArticleIngestOptions
): Promise<IngestResult> {
  const htmlText = typeof html === "string" ? html : new TextDecoder().decode(html);
  const warnings: string[] = [];

  // jsdom is noisy about CSS it cannot parse; keep that out of stdout.
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", () => {});

  const dom = new JSDOM(htmlText, { url: opts.uri, virtualConsole });
  let articleHtml: string | undefined;
  let title: string | undefined;
  try {
    const article = new Readability(dom.window.document).parse();
    if (article) {
      articleHtml = article.content ?? undefined;
      title = article.title?.trim() || undefined;
    }
  } catch (err) {
    warnings.push(
      `readability failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!articleHtml) {
    warnings.push("no readable article found; falling back to whole-page text");
    articleHtml = dom.window.document.body?.innerHTML ?? htmlText;
    title = title ?? (dom.window.document.title?.trim() || undefined);
  }
  dom.window.close();

  const { drafts, title: htmlTitle } = htmlToBlocks(articleHtml);
  return makeResult(
    html,
    drafts,
    {
      sourceKind: "web-page",
      uri: opts.uri,
      title: title ?? htmlTitle,
      capturedAt: opts.capturedAt,
    },
    warnings
  );
}

export interface UrlIngestOptions {
  capturedAt?: string;
  /** Injectable for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

/** Fetch a URL and ingest its readable article. */
export async function ingestUrl(
  url: string,
  opts: UrlIngestOptions = {}
): Promise<IngestResult> {
  const parsed = new URL(url); // throws on malformed URLs
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`unsupported URL scheme: ${parsed.protocol}`);
  }
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(url, {
    headers: { accept: "text/html,application/xhtml+xml" },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`fetch failed: ${res.status} ${res.statusText} for ${url}`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  return ingestArticleHtml(bytes, { uri: url, capturedAt: opts.capturedAt });
}
