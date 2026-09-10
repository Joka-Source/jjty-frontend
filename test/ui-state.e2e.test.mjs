import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { root } from "./validate.mjs";

const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function waitFor(url) {
  for (let tries = 0; tries < 100; tries += 1) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`preview never came up at ${url}`);
}

test("production state route renders the requested state and emits its action", { timeout: 60_000 }, async (t) => {
  assert.ok(existsSync(CHROME));
  const server = spawn(process.execPath, [
    path.join(root, "node_modules", "vite", "bin", "vite.js"),
    "preview", "--host", "127.0.0.1", "--port", "4964", "--strictPort",
  ], { cwd: root, stdio: "ignore" });
  t.after(() => server.kill("SIGTERM"));
  const url = "http://127.0.0.1:4964/#/states/offline";
  await waitFor(url);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => localStorage.setItem("jt.welcomed", "1"));
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => window.__jtApp?.booted);
  assert.equal(await page.$eval("#state-evidence [data-state]", (node) => node.dataset.state), "offline");
  await page.click('[data-state-action="retry-connection"]');
  assert.equal(await page.$eval("#state-evidence-result", (node) => node.textContent), "Action: retry connection");
});
