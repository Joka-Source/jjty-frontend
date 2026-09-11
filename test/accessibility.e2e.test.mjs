import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { root } from "./validate.mjs";

const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function waitFor(url, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // The production preview may still be binding.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`preview never came up at ${url}`);
}

test("first-run production UI has no axe violations at desktop or phone widths", { timeout: 90_000 }, async (t) => {
  assert.ok(existsSync(CHROME), "Google Chrome required for accessibility e2e");
  assert.ok(existsSync(path.join(root, "dist", "index.html")), "run the production build before accessibility e2e");
  const server = spawn(process.execPath, [
    path.join(root, "node_modules", "vite", "bin", "vite.js"),
    "preview", "--host", "127.0.0.1", "--port", "4961", "--strictPort",
  ], { cwd: root, stdio: "ignore" });
  t.after(() => server.kill("SIGTERM"));
  const url = "http://127.0.0.1:4961/";
  await waitFor(url);

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--disable-gpu", "--no-first-run", "--no-sandbox", "--disable-setuid-sandbox"],
  });
  t.after(() => browser.close());
  const axeSource = await readFile(path.join(root, "node_modules", "axe-core", "axe.min.js"), "utf8");

  for (const width of [1280, 375]) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width, height: 900 });
    await page.goto(url, { waitUntil: "load" });
    await page.waitForFunction(() => !!window.__jtApp, { timeout: 20_000 });
    await page.addScriptTag({ content: axeSource });
    const violations = await page.evaluate(async () => {
      const result = await axe.run(document, { resultTypes: ["violations"] });
      return result.violations.map(({ id, impact, help, nodes }) => ({
        id, impact, help, targets: nodes.map((node) => node.target),
      }));
    });
    await context.close();
    assert.deepEqual(violations, [], `axe violations at ${width}px:\n${JSON.stringify(violations, null, 2)}`);
  }
});

test("a recoverable state reflows at a 200% zoom equivalent and works from the keyboard", { timeout: 90_000 }, async (t) => {
  assert.ok(existsSync(CHROME), "Google Chrome required for accessibility e2e");
  assert.ok(existsSync(path.join(root, "dist", "index.html")), "run the production build before accessibility e2e");
  const server = spawn(process.execPath, [
    path.join(root, "node_modules", "vite", "bin", "vite.js"),
    "preview", "--host", "127.0.0.1", "--port", "4965", "--strictPort",
  ], { cwd: root, stdio: "ignore" });
  t.after(() => server.kill("SIGTERM"));
  const url = "http://127.0.0.1:4965/#/states/offline";
  await waitFor(url);

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--disable-gpu", "--no-first-run", "--no-sandbox", "--disable-setuid-sandbox"],
  });
  t.after(() => browser.close());
  const page = await browser.newPage();
  // A 1280 CSS-pixel desktop viewport viewed at 200% exposes 640 CSS pixels.
  await page.setViewport({ width: 640, height: 450 });
  await page.evaluateOnNewDocument(() => localStorage.setItem("jt.welcomed", "1"));
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => window.__jtApp?.booted);
  assert.equal(
    await page.$eval("#install-hint", (node) => node.hidden || getComputedStyle(node).display === "none"),
    true,
    "the install prompt must not cover a recovery decision",
  );

  const reflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert.ok(reflow.scrollWidth <= reflow.clientWidth, `horizontal overflow: ${JSON.stringify(reflow)}`);

  await page.evaluate(() => document.body.focus());
  let focused = "";
  for (let tabs = 0; tabs < 20 && focused !== "retry-connection"; tabs += 1) {
    await page.keyboard.press("Tab");
    focused = await page.evaluate(() => document.activeElement?.getAttribute("data-state-action") ?? "");
  }
  assert.equal(focused, "retry-connection", "state recovery action must be reachable with Tab");
  const focusIndicator = await page.evaluate(() => {
    const style = getComputedStyle(document.activeElement);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  });
  assert.notEqual(focusIndicator.outlineStyle, "none");
  assert.ok(Number.parseFloat(focusIndicator.outlineWidth) > 0, `missing focus indicator: ${JSON.stringify(focusIndicator)}`);
  await page.keyboard.press("Enter");
  assert.equal(await page.$eval("#state-evidence-result", (node) => node.textContent), "Action: retry connection");

  if (process.env.CAPTURE_ACCESSIBILITY_EVIDENCE === "1") {
    const evidenceDirectory = path.join(root, "evidence", "keyboard-zoom");
    mkdirSync(evidenceDirectory, { recursive: true });
    const file = "offline-keyboard-200-percent.png";
    await page.screenshot({ path: path.join(evidenceDirectory, file), fullPage: true });
    const sha256 = createHash("sha256").update(readFileSync(path.join(evidenceDirectory, file))).digest("hex");
    writeFileSync(path.join(evidenceDirectory, "manifest.json"), `${JSON.stringify({
      generatedAt: "2026-09-11",
      source: "production Vite build at a 640 CSS-pixel viewport, equivalent to a 1280 CSS-pixel viewport at 200% browser zoom",
      route: "#/states/offline",
      state: "offline",
      checks: {
        horizontalOverflow: false,
        tabReachedAction: "retry-connection",
        visibleFocusIndicator: focusIndicator,
        enterActivatedAction: true,
      },
      files: [{ file, width: 640, height: 450, sha256 }],
      boundary: "Automated Chromium keyboard and reflow evidence; not a human screen-reader or physical-device result.",
    }, null, 2)}\n`);
  }
});
