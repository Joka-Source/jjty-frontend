import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import puppeteer from "puppeteer-core";
import { root } from "./validate.mjs";

test(
  "notebook import survives reload and supports page order, zoom and narrow layout",
  { timeout: 90000 },
  async (t) => {
    const server = spawn(
      process.execPath,
      [
        path.join(root, "node_modules/vite/bin/vite.js"),
        "--host",
        "127.0.0.1",
        "--port",
        "4993",
        "--strictPort",
      ],
      { cwd: root, stdio: "ignore" },
    );
    t.after(() => server.kill("SIGTERM"));
    const url = "http://127.0.0.1:4993/notebooks/index.html";
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(url)).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(ready);
    const browser = await puppeteer.launch({
      executablePath:
        process.env.CHROME_PATH ??
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      headless: true,
      args: ["--no-first-run"],
    });
    t.after(async () => {
      const timer = setTimeout(() => browser.process()?.kill("SIGKILL"), 5000);
      try {
        await browser.close();
      } finally {
        clearTimeout(timer);
      }
    });
    const page = await browser.newPage();
    await page.goto(url);
    await page.waitForSelector("#pdf-import");
    await (
      await page.$("#pdf-file")
    ).uploadFile(path.join(root, "test/fixtures/jett-fillable.pdf"));
    await page.waitForSelector("#ink");
    assert.equal(await page.$eval("#title", (n) => n.value), "jett-fillable");
    assert.equal(await page.$$eval("[data-page]", (ns) => ns.length), 2);
    const first = await page.$eval("#ink image", (n) => n.getAttribute("href"));
    await page.waitForFunction(() =>
      document
        .querySelector(".footer")
        .textContent.includes("Saved on this browser"),
    );
    await page.reload();
    await page.waitForSelector("#ink");
    assert.equal(
      await page.$eval("#ink image", (n) => n.getAttribute("href")),
      first,
    );
    await page.click("#page-options");
    await page.type("[name=outline]", "Review form");
    await page.$eval("[name=destination]", (n) => {
      n.value = "";
    });
    await page.click("form button[type=submit]");
    assert.equal(
      await page.$eval("#dialog", (n) => n.open),
      true,
      "blank page must keep dialog open",
    );
    await page.type("[name=destination]", "1");
    await page.select("[name=action]", "later");
    await page.click("form button[type=submit]");
    assert.equal(
      await page.$eval("#ink image", (n) => n.getAttribute("href")),
      first,
    );
    assert.match(await page.$eval(".footer", (n) => n.textContent), /2 of 2/);
    assert.equal(
      await page.$eval('[aria-label="Document outline"]', (n) => n.textContent),
      "Review form",
    );
    await page.click("#undo");
    await page.click('[data-page="0"]');
    assert.equal(
      await page.$eval("#ink image", (n) => n.getAttribute("href")),
      first,
    );
    await page.select("#zoom", "2");
    assert.equal(
      await page.$eval(".paper", (n) => n.getBoundingClientRect().width),
      1440,
    );
    await page.setViewport({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth),
      390,
    );
    await page.select("#zoom", "0");
    assert.ok(
      await page.$eval(".paper", (n) => n.getBoundingClientRect().width < 390),
    );
    const directory = await mkdtemp(path.join(tmpdir(), "jett-large-backup-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const fixture = path.join(directory, "backup.json");
    await writeFile(
      fixture,
      JSON.stringify({
        version: 1,
        notebooks: [
          {
            id: "large-fixture",
            title: "Large backup",
            paper: "grid",
            color: "#24476a",
            updated: Date.now(),
            pages: [
              {
                id: "page",
                items: [],
                sourceText: "a".repeat(21 * 1024 * 1024),
              },
            ],
          },
        ],
      }),
    );
    await page.click("#home");
    await (await page.$("#restore")).uploadFile(fixture);
    await page.waitForSelector('[aria-label="Open Large backup (restored)"]');
    assert.equal(
      await page.$$eval("[data-open]", (ns) => ns.length),
      2,
      "restore retains existing notebook",
    );
    await page.click('[aria-label="Open Large backup (restored)"]');
    assert.equal(await page.$$eval("[data-tab-open]", (ns) => ns.length), 2);
    await page.click("#add");
    await page.click(".notebook-tab:first-child [data-tab-open]");
    assert.equal(await page.$eval("#title", (n) => n.value), "jett-fillable");
    assert.equal(
      await page.$eval("#undo", (n) => n.disabled),
      true,
      "undo belongs to this notebook",
    );
    await page.click('[data-page="1"]');
    await page.click(".notebook-tab:last-child [data-tab-open]");
    await page.click(".notebook-tab:first-child [data-tab-open]");
    assert.match(await page.$eval(".footer", (n) => n.textContent), /2 of 2/);
    await page.reload();
    await page.waitForSelector("#ink");
    assert.equal(await page.$eval("#title", (n) => n.value), "jett-fillable");
    assert.match(await page.$eval(".footer", (n) => n.textContent), /2 of 2/);
    await page.click('#home');
    await page.click('[aria-label="Manage Large backup (restored)"]');
    await page.$eval('[name=title]',n=>{n.value='Renamed backup';});
    await page.type('[name=folder]','Research');
    await page.click('form button[type=submit]');
    await page.click('[aria-label="Open Renamed backup"]');
    assert.equal(await page.$eval('#undo',n=>n.disabled),true,'library metadata clears older whole-notebook history');
    assert.equal(await page.$eval('#title',n=>n.value),'Renamed backup');
    await page.click('[aria-label="Close Renamed backup"]');
    assert.equal(await page.$(".notebook-tabs"), null);
  },
);
