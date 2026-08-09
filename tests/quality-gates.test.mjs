import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import test from "node:test";
import { fetchFromWorker } from "./worker-fixture.mjs";

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
      return entry.isDirectory() ? listFiles(path) : [path];
    }),
  );
  return nested.flat();
}

function headersForPath(policy, path) {
  const headers = new Map();
  let activePattern = null;

  for (const rawLine of policy.split("\n")) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) {
      continue;
    }
    if (!/^\s/.test(rawLine)) {
      activePattern = rawLine.trim();
      continue;
    }
    if (!activePattern) {
      continue;
    }
    const pattern = new RegExp(
      `^${activePattern
        .split("*")
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*")}$`,
    );
    if (!pattern.test(path)) {
      continue;
    }
    const separator = rawLine.indexOf(":");
    assert.notEqual(separator, -1, `invalid header line: ${rawLine}`);
    headers.set(
      rawLine.slice(0, separator).trim().toLowerCase(),
      rawLine.slice(separator + 1).trim(),
    );
  }

  return headers;
}

test("renders deterministic accessibility landmarks and valid in-page navigation", async () => {
  const response = await fetchFromWorker("/");
  const html = await response.text();

  assert.match(html, /<html[^>]*\blang="en"/i);
  assert.equal((html.match(/<main\b/gi) ?? []).length, 1);
  assert.equal((html.match(/<h1\b/gi) ?? []).length, 1);
  assert.match(html, /<nav[^>]*aria-label="Primary navigation"/i);
  assert.match(html, /<a[^>]*class="skip-link"[^>]*href="#main-content"/i);

  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/gi)].map((match) => match[1]));
  const fragmentLinks = [...html.matchAll(/\bhref="#([^"]+)"/gi)].map(
    (match) => match[1],
  );
  assert.ok(fragmentLinks.length > 0);
  for (const fragment of fragmentLinks) {
    assert.ok(ids.has(fragment), `missing target for #${fragment}`);
  }
});

test("keeps the built page and executable assets inside deterministic budgets", async () => {
  const response = await fetchFromWorker("/");
  const htmlBytes = Buffer.byteLength(await response.text());
  const clientDirectory = new URL("../dist/client/", import.meta.url);
  const executableAssets = (await listFiles(clientDirectory)).filter((file) =>
    /\.(?:css|js)$/.test(file.pathname),
  );
  const executableBytes = (
    await Promise.all(executableAssets.map((file) => stat(file)))
  ).reduce((total, entry) => total + entry.size, 0);

  assert.ok(htmlBytes <= 64 * 1024, `HTML is ${htmlBytes} bytes`);
  assert.ok(
    executableBytes <= 300 * 1024,
    `CSS and JavaScript total ${executableBytes} bytes`,
  );
});

test("builds a pre-cutover indexing policy for representative static assets", async () => {
  const clientDirectory = new URL("../dist/client/", import.meta.url);
  const policy = await readFile(new URL("_headers", clientDirectory), "utf8");
  const workerConfig = JSON.parse(
    await readFile(new URL("../dist/server/wrangler.json", import.meta.url), "utf8"),
  );
  const assetFiles = await readdir(new URL("assets/", clientDirectory));
  const hashedScript = assetFiles.find((file) => file.endsWith(".js"));
  assert.ok(hashedScript, "build did not produce a hashed JavaScript asset");

  await stat(new URL("og.png", clientDirectory));
  await stat(new URL(`assets/${hashedScript}`, clientDirectory));
  assert.equal(Object.hasOwn(workerConfig.assets, "run_worker_first"), false);

  const publicAssetHeaders = headersForPath(policy, "/og.png");
  assert.equal(
    publicAssetHeaders.get("x-robots-tag"),
    "noindex, nofollow, noarchive, nosnippet",
  );

  const hashedAssetHeaders = headersForPath(policy, `/assets/${hashedScript}`);
  assert.equal(
    hashedAssetHeaders.get("x-robots-tag"),
    "noindex, nofollow, noarchive, nosnippet",
  );
  assert.equal(
    hashedAssetHeaders.get("cache-control"),
    "public, max-age=31536000, immutable",
  );
});

test("offers an app-owned path home when a route is unavailable", async () => {
  const response = await fetchFromWorker("/downloads/not-yet-released");
  const html = await response.text();

  assert.equal(response.status, 404);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.equal(
    response.headers.get("x-robots-tag"),
    "noindex, nofollow, noarchive, nosnippet",
  );
  assert.equal((html.match(/<main\b/gi) ?? []).length, 1);
  assert.equal((html.match(/<h1\b/gi) ?? []).length, 1);
  assert.match(html, /This path is not ready\./i);
  assert.match(html, /<a[^>]*href="\/"[^>]*>\s*Return to JJTY\s*<\/a>/i);
});
