import {openReaderMenu} from './reader-navigation.mjs';
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { root } from "./validate.mjs";

const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function waitFor(url, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // preview is still starting
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`server never came up at ${url}`);
}

async function boot(t) {
  assert.ok(existsSync(CHROME), "Google Chrome required for headless e2e");
  assert.ok(existsSync(path.join(root, "dist", "index.html")), "run vite build before e2e");
  const port = 4937;
  const server = spawn(
    process.execPath,
    [path.join(root, "node_modules", "vite", "bin", "vite.js"), "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
  );
  t.after(() => server.kill("SIGTERM"));
  await waitFor(`http://127.0.0.1:${port}/`);

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--disable-gpu", "--no-first-run", "--no-sandbox", "--disable-setuid-sandbox"],
  });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__jtApp?.booted === true, { timeout: 30000 });
  return page;
}

async function addSpace(page, name) {
  await page.select("#space-kind", "class");
  await page.type("#space-name", name);
  await page.click('#form-space button[type="submit"]');
  await page.waitForFunction(
    (wanted) => [...document.querySelectorAll(".org-space > strong")].some((node) => node.textContent === wanted),
    {},
    name,
  );
}

async function addMembership(page, spaceName, person = "asha") {
  const id = await page.evaluate((wanted) => {
    const row = [...document.querySelectorAll(".org-space")].find(
      (node) => node.querySelector(":scope > strong")?.textContent === wanted,
    );
    return row?.dataset.spaceId;
  }, spaceName);
  await page.select("#member-space", id);
  await page.type("#member-name", person);
  await page.click('#form-member button[type="submit"]');
  await page.waitForFunction(
    (wanted) => document.getElementById("space-person").textContent.includes(wanted),
    {},
    person,
  );
}

test("spaces flow: picker, feed, import, voice ambiguity, persistence and export", { timeout: 180000 }, async (t) => {
  const page = await boot(t);
  await page.click("#welcome-next");
  await page.click("#welcome-skip");
  await page.click("#home-sample");
  await page.waitForFunction(() => window.__jtApp.view() === "read");

  // A kept act exists before the person's spaces are configured.
  await page.evaluate(() =>
    window.__jtApp.perform("highlight", 0, {
      evidence: "highlight this for the first space moment",
      matchedText: document.querySelector('#doc p[data-block="0"]').textContent.slice(0, 120),
    }),
  );

  await page.evaluate(() => window.__jtApp.showView("spaces"));
  assert.match(
    await page.$eval("#space-local-note", (node) => node.textContent),
    /local to this device.*relay/is,
  );
  await page.type("#inst-name", "A Small College");
  await page.click('#form-institution button[type="submit"]');
  await addSpace(page, "CSE-A");
  await addSpace(page, "CSE-B");
  assert.equal(await page.$eval("#member-self", (node) => node.checked), true);
  await addMembership(page, "CSE-A");
  await addMembership(page, "CSE-B");

  // Picker placement: only current memberships appear.
  await page.evaluate(() => window.__jtApp.showView("history"));
  await page.waitForSelector("#history-all .space-picker select");
  const pickerNames = await page.$$eval("#history-all .space-picker select option", (options) =>
    options.map((option) => option.textContent),
  );
  assert.deepEqual(pickerNames, ["CSE-A", "CSE-B"]);
  await page.select("#history-all .space-picker select", await page.$eval(".org-space", (node) => node.dataset.spaceId));
  await page.click("#history-all .space-send-confirm");
  await page.waitForFunction(() => window.__jtApp.spaces.feed().length === 1);

  // Exact voice destination uses the existing jt-speech send.to path.
  await page.evaluate(() => window.__jtApp.showView("read"));
  await page.evaluate(() =>
    window.__jtApp.perform("note", 1, {
      evidence: "note that exact voice routing",
      noteText: "exact voice routing",
      matchedText: document.querySelector('#doc p[data-block="1"]').textContent.slice(0, 120),
    }),
  );
  await page.evaluate(() => window.__jtApp.voiceSegment("send this to cse a"));
  await page.waitForFunction(() => window.__jtApp.spaces.feed().length === 2);

  // Close names produce an explicit choice and no write until it is chosen.
  await page.evaluate(() =>
    window.__jtApp.perform("important", 2, {
      evidence: "mark this important before ambiguous space routing",
      matchedText: document.querySelector('#doc p[data-block="2"]').textContent.slice(0, 120),
    }),
  );
  await page.evaluate(() => window.__jtApp.voiceSegment("send this to cse"));
  await page.waitForFunction(() => !document.getElementById("ask").hidden);
  assert.equal(await page.evaluate(() => window.__jtApp.spaces.feed().length), 2);
  assert.deepEqual(
    await page.$$eval("#ask-options .space-ask", (nodes) => nodes.map((node) => node.textContent)),
    ["CSE-A", "CSE-B"],
  );
  await page.click("#ask-options .space-ask");
  await page.waitForFunction(() => window.__jtApp.spaces.feed().length === 3);

  // Feed is oldest-to-newest, and every item exposes source, evidence, hash.
  await page.evaluate(() => window.__jtApp.showView("spaces"));
  await page.waitForFunction(() => document.querySelectorAll(".space-feed-item").length === 3);
  const feed = await page.$$eval(".space-feed-item", (items) =>
    items.map((item) => ({
      arrivedAt: item.dataset.arrivedAt,
      excerpt: item.querySelector(".space-excerpt").textContent,
      provenance: item.querySelector(".space-provenance").textContent,
      evidence: item.querySelector(".space-evidence").textContent,
      hash: item.querySelector(".space-hash").textContent,
    })),
  );
  assert.deepEqual(
    feed.map(({ arrivedAt }) => arrivedAt),
    [...feed.map(({ arrivedAt }) => arrivedAt)].sort(),
  );
  for (const item of feed) {
    assert.ok(item.excerpt.length > 0);
    assert.match(item.provenance, /source .*sha256:/s);
    assert.match(item.evidence, /highlight|note|important|captured evidence/is);
    assert.match(item.hash, /^sha256:[0-9a-f]{64}$/);
  }

  // Keeping the excerpt creates and opens a normal document with source data.
  await page.click(".space-feed-item .keep-space-document");
  await page.waitForFunction(() => window.__jtApp.view() === "read");
  assert.match(await page.$eval("#doc-title", (node) => node.textContent), /from CSE-A/);
  const imported = await page.evaluate(() => window.__jtApp.currentDoc());
  assert.equal(imported.provenance.sourceKind, "space moment");
  assert.equal(imported.provenance.original.sourceTitle, "a sample page");
  assert.match(imported.provenance.spaceImport.contentHash, /^sha256:[0-9a-f]{64}$/);
  await openReaderMenu(page);await page.click("#doc-prov-btn");
  assert.match(
    await page.$eval("#doc-prov", (node) => node.textContent),
    /from space CSE-A.*original source a sample page.*sha256:/is,
  );

  const exported = JSON.parse(await page.evaluate(() => window.__jtApp.exportData()));
  assert.equal(exported.spaceFeeds.length, 3);

  // IndexedDB feed and imported document both survive a reload.
  await page.evaluate(() => window.__jtApp.showView("spaces"));
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => window.__jtApp?.booted && window.__jtApp.spaces.feed().length === 3, {
    timeout: 30000,
  });
  assert.equal(await page.$$eval(".space-feed-item", (items) => items.length), 3);
});
