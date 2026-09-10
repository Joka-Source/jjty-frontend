import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
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
    const page = await browser.newPage();
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
    await page.close();
    assert.deepEqual(violations, [], `axe violations at ${width}px:\n${JSON.stringify(violations, null, 2)}`);
  }
});
