import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { root } from "./validate.mjs";

const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const MIME = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

test("capability page is generated from the live registry and designed verbs open honest rooms", { timeout: 120000 }, async (t) => {
  assert.ok(existsSync(CHROME), "Google Chrome required for headless e2e");
  const dist = path.join(root, "dist");
  assert.ok(existsSync(path.join(dist, "index.html")), "run vite build before e2e");

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--disable-gpu", "--no-first-run", "--no-sandbox", "--disable-setuid-sandbox"],
  });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const url = new URL(request.url());
    const relative = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
    const file = path.resolve(dist, relative);
    if (!file.startsWith(`${dist}${path.sep}`) || !existsSync(file) || !statSync(file).isFile()) {
      void request.respond({ status: 404, contentType: "text/plain", body: "not found" });
      return;
    }
    void request.respond({
      status: 200,
      contentType: MIME[path.extname(file)] ?? "application/octet-stream",
      body: readFileSync(file),
    });
  });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem("jt.welcomed", "1");
    localStorage.setItem("jt.mic", "off");
  });
  await page.goto("http://jt.test/#/capabilities", { waitUntil: "load" });
  await page.waitForFunction(() => window.__jtApp?.booted && window.__jtApp.view() === "capabilities");

  const initial = await page.evaluate(() => ({
    registry: window.__jtApp.registry.list().length,
    rows: document.querySelectorAll("#capability-list [data-capability-id]").length,
    highlight: document.querySelector('[data-capability-id="highlight"]')?.textContent,
  }));
  assert.equal(initial.rows, initial.registry);
  assert.match(initial.highlight, /highlight this/i);
  assert.match(initial.highlight, /real/i);

  await page.evaluate(() => {
    window.__jtApp.registry.register({
      id: "dummy-verb",
      spokenForms: ["show dummy"],
      description: "A temporary capability used to prove runtime generation.",
      argsSchema: { type: "object", additionalProperties: false },
      recordKinds: ["proof"],
      status: "designed",
      testReference: "test/capabilities.e2e.test.mjs",
      roomDescription: "This temporary capability is visible but not built.",
      execute: (ctx) => ctx.openRoom({ id: "dummy-verb", description: "This temporary capability is visible but not built." }),
    });
    window.__jtApp.showView("capabilities");
  });
  await page.waitForSelector('[data-capability-id="dummy-verb"]');
  const dummy = await page.$eval('[data-capability-id="dummy-verb"]', (node) => ({
    spoken: node.querySelector(".capability-spoken").textContent,
    status: node.querySelector(".capability-status").textContent,
    records: node.querySelector(".capability-records").textContent,
    description: node.querySelector(".capability-description").textContent,
  }));
  assert.deepEqual(dummy, {
    spoken: "say: show dummy",
    status: "designed",
    records: "records: proof",
    description: "A temporary capability used to prove runtime generation.",
  });

  await page.click('[data-capability-id="compare"] .capability-open');
  await page.waitForFunction(() => window.__jtApp.view() === "rooms");
  const room = await page.$eval("#designed-room", (node) => node.textContent);
  assert.match(room, /compare/i);
  assert.match(room, /designed.*not built/is);

  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => window.__jtApp?.booted && window.__jtApp.view() === "rooms");
  assert.match(await page.$eval("#designed-room", (node) => node.textContent), /compare.*designed.*not built/is);
});
