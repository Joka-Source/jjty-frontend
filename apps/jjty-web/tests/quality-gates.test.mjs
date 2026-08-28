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

function cssBlock(stylesheet, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return stylesheet.match(new RegExp(`(?:^|\\n)${escapedSelector}\\s*\\{([^}]*)\\}`, "m"))?.[1] ?? "";
}

function cssDeclaration(block, property) {
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return block.match(new RegExp(`(?:^|;)\\s*${escapedProperty}:\\s*([^;]+)`))?.[1].trim();
}

function resolveColor(stylesheet, declaration) {
  const variable = declaration?.match(/^var\((--[a-z-]+)\)$/)?.[1];
  const color = variable
    ? stylesheet.match(new RegExp(`${variable}:\\s*(#[0-9a-f]{6})`, "i"))?.[1]
    : declaration;
  assert.match(color ?? "", /^#[0-9a-f]{6}$/i);
  return color;
}

function relativeLuminance(hexColor) {
  const channels = hexColor
    .slice(1)
    .match(/.{2}/g)
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function compositeColor(overlayChannels, backgroundHex, alpha) {
  const backgroundChannels = backgroundHex
    .slice(1)
    .match(/.{2}/g)
    .map((channel) => Number.parseInt(channel, 16));
  const compositeChannels = overlayChannels.map((channel, index) =>
    Math.round(channel * alpha + backgroundChannels[index] * (1 - alpha)),
  );
  return `#${compositeChannels
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

function contrastRatio(foreground, background) {
  const luminances = [relativeLuminance(foreground), relativeLuminance(background)].sort(
    (left, right) => right - left,
  );
  return (luminances[0] + 0.05) / (luminances[1] + 0.05);
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

test("keeps the recovery eyebrow above the WCAG AA text contrast threshold", async () => {
  const response = await fetchFromWorker("/downloads/not-yet-released");
  const html = await response.text();
  const stylesheet = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );
  const eyebrowClasses = html.match(
    /<p class="([^"]*)">\s*404 \/ Recovery route\s*<\/p>/i,
  )?.[1] ?? "";
  const hasRecoveryClass = eyebrowClasses.split(/\s+/).includes("recovery-eyebrow");
  const genericColor = cssDeclaration(cssBlock(stylesheet, ".eyebrow"), "color");
  const scopedColor = cssDeclaration(
    cssBlock(stylesheet, ".not-found .recovery-eyebrow"),
    "color",
  );
  const foreground = resolveColor(
    stylesheet,
    hasRecoveryClass && scopedColor ? scopedColor : genericColor,
  );
  const paper = resolveColor(stylesheet, "var(--paper)");
  const bodyBackgrounds = [...stylesheet.matchAll(/(?:^|\n)\s*body\s*\{([^}]*)\}/g)];
  assert.equal(bodyBackgrounds.length, 2, "expected desktop and mobile body backgrounds");
  const stripeBackgrounds = bodyBackgrounds.map((bodyMatch, index) => {
    const overlay = bodyMatch[1].match(
      /rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*\/\s*(0?\.\d+)\s*\)/,
    );
    assert.ok(overlay, `missing ${index === 0 ? "desktop" : "mobile"} grid overlay`);
    return compositeColor(
      overlay.slice(1, 4).map(Number),
      paper,
      Number(overlay[4]),
    );
  });
  assert.deepEqual(stripeBackgrounds, ["#e8e3d4", "#e9e4d5"]);
  const backgrounds = [
    { name: "flat paper", color: paper },
    { name: "desktop stripe", color: stripeBackgrounds[0] },
    { name: "mobile stripe", color: stripeBackgrounds[1] },
  ];
  const measured = backgrounds.map((background) => ({
    ...background,
    ratio: contrastRatio(foreground, background.color),
  }));
  const worst = measured.reduce((lowest, candidate) =>
    candidate.ratio < lowest.ratio ? candidate : lowest,
  );

  assert.ok(
    worst.ratio >= 4.5,
    `worst recovery eyebrow contrast is ${worst.ratio.toFixed(4)}:1 on ${worst.name} (${foreground} on ${worst.color})`,
  );
  assert.ok(hasRecoveryClass, "recovery eyebrow must use a scoped contrast class");
});
