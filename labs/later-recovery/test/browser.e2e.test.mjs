import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { startServer } from "../run.mjs";

const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

test("failure, retry, pagination and stale tab responses stay visible and safe", { timeout: 60_000 }, async (t) => {
  assert.ok(existsSync(CHROME), "Google Chrome required for headless e2e");
  const server = await startServer({ port: 0 });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--disable-gpu"] });
  t.after(async () => { await browser.close(); await server.close(); });
  const page = await browser.newPage();
  await page.goto(server.url);
  await page.waitForFunction(() => window.__laterLab?.state().status === "ready");
  assert.equal(await page.$$eval("#items li", (nodes) => nodes.length), 2);
  await page.click("#fail-next");
  await page.click("#actions button");
  await page.waitForFunction(() => window.__laterLab.state().status === "error-older");
  assert.equal(await page.$$eval("#items li", (nodes) => nodes.length), 2);
  await page.click("#actions button");
  await page.waitForFunction(() => window.__laterLab.state().items.length === 3);
  await page.click("#tab-saved");
  await page.click("#tab-completed");
  await page.waitForFunction(() => window.__laterLab.state().tab === "completed" && window.__laterLab.state().status === "ready");
  await new Promise((resolve) => setTimeout(resolve, 800));
  assert.deepEqual(await page.evaluate(() => window.__laterLab.state().items.map((item) => item.id)), ["c1"]);
});

test("desktop and phone lab have no automated axe violations or horizontal overflow", { timeout: 60_000 }, async (t) => {
  assert.ok(existsSync(CHROME), "Google Chrome required for headless e2e");
  const server = await startServer({ port: 0 });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--disable-gpu"] });
  t.after(async () => { await browser.close(); await server.close(); });
  const axe = readFileSync(new URL("../../../node_modules/axe-core/axe.min.js", import.meta.url), "utf8");
  for (const viewport of [{ width: 1280, height: 800 }, { width: 375, height: 760 }]) {
    const page = await browser.newPage();
    await page.setViewport(viewport);
    await page.goto(server.url);
    await page.waitForFunction(() => window.__laterLab?.state().status === "ready");
    await page.evaluate(axe);
    const result = await page.evaluate(() => window.axe.run(document));
    assert.deepEqual(result.violations.map((item) => ({ id: item.id, nodes: item.nodes.length })), [], JSON.stringify(result.violations, null, 2));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
    await page.close();
  }
});
