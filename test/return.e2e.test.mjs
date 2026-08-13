// B4-RETURN browser proof: a real IndexedDB place survives reload, returns
// through the visible reading surface, and spoken cross-document navigation
// refuses to guess when two titles are equally plausible.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { validateCursor, validateReceipt, errorsOf, root } from "./validate.mjs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function waitFor(url, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Preview is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`server never came up at ${url}`);
}

async function boot(t) {
  assert.ok(existsSync(CHROME), "Google Chrome required for headless e2e");
  const server = spawn(
    "npx",
    ["vite", "preview", "--host", "127.0.0.1", "--port", "4944"],
    { cwd: root, stdio: ["ignore", "pipe", "ignore"] }
  );
  t.after(() => server.kill("SIGTERM"));
  const url = await new Promise((resolve, reject) => {
    let out = "";
    const timer = setTimeout(() => reject(new Error(`vite preview never announced a URL\n${out}`)), 15000);
    server.stdout.on("data", (chunk) => {
      out += String(chunk);
      const match = out.match(/(http:\/\/127\.0\.0\.1:\d+)\//);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    server.on("exit", () => reject(new Error(`vite preview exited early\n${out}`)));
  });
  await waitFor(`${url}/`);
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--disable-gpu", "--no-first-run"],
  });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem("jt.welcomed", "1");
    localStorage.setItem("jt.mic", "off");
  });
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(`${url}/#/home`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__jtApp?.booted === true, { timeout: 30000 });
  return page;
}

test("reading place survives reload; home, water return, voice, and ambiguity stay honest", { timeout: 120000 }, async (t) => {
  const page = await boot(t);

  await page.click("#home-sample");
  await page.waitForFunction(() => document.querySelectorAll("#doc p[data-block]").length === 7);
  await page.click('#doc p[data-block="4"]');
  await new Promise((resolve) => setTimeout(resolve, 850));
  await page.click('.topnav a[data-view-link="home"]');
  await page.waitForFunction(() => document.querySelector(".home-position")?.textContent.includes("block 5 of 7"));
  const firstCard = await page.$eval(".home-position", (node) => node.textContent.trim());
  assert.match(firstCard, /^block 5 of 7 · (just now|1 minute ago)$/);

  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => window.__jtApp?.booted && window.__jtApp.view() === "home", { timeout: 30000 });
  assert.match(await page.$eval(".home-position", (node) => node.textContent), /block 5 of 7/);
  await page.click(".home-doc .doc-btn");
  await page.waitForFunction(() => window.__jtApp.currentBlock() === 4);
  await page.waitForSelector('.return-marker:not([hidden])');
  assert.equal(await page.$eval(".return-marker", (node) => node.textContent), "you were here");

  const returnEntry = await page.evaluate(() =>
    window.__jtApp.entries().findLast((entry) => entry.kind === "return")
  );
  assert.ok(returnEntry, "opening a remembered document wrote no return entry");
  assert.equal(returnEntry.blockIndex, 4);
  assert.equal(returnEntry.cursor.state, "return");
  assert.ok(validateCursor(returnEntry.cursor), errorsOf(validateCursor));
  assert.ok(validateReceipt(returnEntry.receipt), errorsOf(validateReceipt));

  await page.evaluate(() => window.__jtApp.addDocument("survey opening\n\nsurvey remembered line", "River Survey"));
  await page.waitForFunction(() => document.getElementById("doc-title").textContent === "River Survey");
  await page.click('#doc p[data-block="1"]');
  await new Promise((resolve) => setTimeout(resolve, 850));
  await page.evaluate(() => window.__jtApp.addDocument("summary opening\n\nsummary remembered line", "River Summary"));
  await page.waitForFunction(() => document.getElementById("doc-title").textContent === "River Summary");
  await page.click('#doc p[data-block="1"]');
  await new Promise((resolve) => setTimeout(resolve, 850));

  await page.evaluate(() => window.__jtApp.segment("go back to river survey"));
  await page.waitForFunction(() =>
    document.getElementById("doc-title").textContent === "River Survey" && window.__jtApp.currentBlock() === 1
  );
  const named = await page.evaluate(() => window.__jtApp.entries().at(-1));
  assert.equal(named.kind, "return");
  assert.equal(named.evidence, "go back to river survey");

  const beforeAmbiguity = await page.evaluate(() => window.__jtApp.entries().length);
  await page.evaluate(() => window.__jtApp.segment("go back to river"));
  await page.waitForFunction(() => !document.getElementById("ask").hidden);
  const ambiguity = await page.evaluate(() => ({
    title: document.getElementById("doc-title").textContent,
    options: [...document.querySelectorAll("#ask-options .ask-option:not(.ask-dismiss)")].map((node) => node.textContent),
    entries: window.__jtApp.entries().length,
  }));
  assert.equal(ambiguity.title, "River Survey", "ambiguous words silently opened another document");
  assert.deepEqual(ambiguity.options, ["go back to “River Survey”", "go back to “River Summary”"]);
  assert.equal(ambiguity.entries, beforeAmbiguity, "ambiguity wrote a return before a choice");

  await page.click('#ask-options .ask-option[data-candidate="1"]');
  await page.waitForFunction(() => document.getElementById("doc-title").textContent === "River Summary");
  await page.evaluate(() => window.__jtApp.segment("where was I"));
  await page.waitForFunction(
    (before) => window.__jtApp.entries().length > before,
    { timeout: 5000 },
    beforeAmbiguity
  );
  assert.equal((await page.evaluate(() => window.__jtApp.entries().at(-1))).evidence, "where was i");
});
