import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import puppeteer from "puppeteer-core";
import { root } from "./validate.mjs";

test(
  "product menus, preferences, voice text rehearsal and highlight form a working journey",
  { timeout: 90000 },
  async (t) => {
    const server = await createServer({
      root,
      server: { host: "127.0.0.1", port: 0, strictPort: true },
    });
    await server.listen();
    t.after(() => server.close());
    const browser = await puppeteer.launch({
      executablePath:
        process.env.CHROME_PATH ??
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      headless: true,
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
    await page.evaluateOnNewDocument(() => {
      window.voiceTestInstances = [];
      window.SpeechRecognition = class {
        constructor() {
          this.aborts = 0;
          window.voiceTestInstances.push(this);
        }
        start() {
          this.onstart?.();
        }
        abort() {
          this.aborts++;
          this.onend?.();
        }
        result(text) {
          const result = [{ transcript: text }];
          result.isFinal = true;
          this.onresult?.({ results: [result] });
        }
      };
    });
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(
      `http://127.0.0.1:${server.httpServer.address().port}/notebooks/index.html`,
    );
    await page.waitForSelector("#new");
    await page.click('.jjty-companion');
    await page.click('[data-helper=guide]');
    assert.equal(await page.$eval('[data-back]', n => n.disabled), true);
    for (let i = 0; i < 3; i++) await page.click('[data-next]');
    assert.equal(await page.$eval('.jjty-lesson h3', n => n.textContent), 'Keep the result');
    await page.click('[data-back]');
    assert.equal(await page.$eval('.jjty-lesson h3', n => n.textContent), 'Let your voice find the place');
    await page.click('[data-next]');
    await page.click('[data-next]');
    assert.equal(await page.$eval('#dialog', n => n.open), false);
    assert.equal(await page.evaluate(() => document.activeElement.className), 'jjty-companion');
    await page.click('.jjty-companion');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#dialog').open && document.activeElement.id === 'jjty-helper');
    await page.click('.jjty-companion');
    await page.click('#panel-close');
    await page.waitForFunction(() => !document.querySelector('#dialog').open && document.activeElement.id === 'jjty-helper');
    await page.click("#settings");
    await page.select("[name=paper]", "ruled");
    await page.select("[name=motion]", "reduce");
    await page.click("form button[type=submit]");
    assert.equal(await page.$eval("html", (n) => n.dataset.motion), "reduce");
    await page.click("#new");
    assert.equal(await page.$eval("[name=paper]", (n) => n.value), "ruled");
    await page.click("#cancel");
    await page.click("#create-more");
    await page.click("[data-create=quick]");
    await page.click("[data-tool=text]");
    const box = await page.$eval("#ink", (n) => {
      const r = n.getBoundingClientRect();
      return { x: r.x + 80, y: r.y + 80 };
    });
    await page.mouse.click(box.x, box.y);
    await page.type("[name=text]", "Build with care");
    await page.click("form button[type=submit]");
    await page.click("#voice");
    await page.click("#voice-try");
    assert.match(
      await page.$eval("#dialog", (n) => n.textContent),
      /does not use the microphone/,
    );
    await page.type("[name=phrase]", "build with care");
    await page.click("form button[type=submit]");
    await page.waitForSelector(".voice-cursor");
    assert.match(
      await page.$eval("#voice-message", (n) => n.textContent),
      /Text match/,
    );
    await page.click("#voice-keep");
    assert.equal(await page.$$eval("#ink polyline", (ns) => ns.length), 1);
    await page.click("#undo");
    assert.equal(await page.$$eval("#ink polyline", (ns) => ns.length), 0);
    await page.click("#page-options");
    await page.click("[data-page-action=duplicate]");
    assert.equal(await page.$$eval(".thumb", (ns) => ns.length), 2);
    await page.click("#voice-try");
    await page.type("[name=phrase]", "Build with care");
    await page.click("form button[type=submit]");
    await page.waitForSelector("[data-match]");
    assert.equal(await page.$$eval("[data-match]", (ns) => ns.length), 2);
    await page.click('[data-match="0"]');

    await page.click('[data-page="1"]');
    await page.click("[data-tool=text]");
    const second = await page.$eval("#ink", (n) => {
      const r = n.getBoundingClientRect();
      return { x: r.x + 90, y: r.y + 120 };
    });
    await page.mouse.click(second.x, second.y);
    await page.type("[name=text]", "Different destination");
    await page.click("form button[type=submit]");
    await page.click('[data-page="0"]');
    await page.click("#voice-try");
    await page.type("[name=phrase]", "Build with care");
    await page.click("form button[type=submit]");
    await page.click('[data-match="0"]');
    await page.click("#find");
    await page.type("[name=query]", "Different destination");
    await page.click("form button[type=submit]");
    assert.equal(
      await page.$eval("#voice-keep", (n) => n.disabled),
      true,
      "Find clears old voice highlight target",
    );
    await page.click('[data-page="0"]');
    await page.click("#voice-start");
    await page.waitForFunction(
      () => document.querySelector(".voicebar")?.dataset.state === "listening",
    );
    const original = await page.$eval("#ink", (n) => {
      const r = n.getBoundingClientRect();
      return { x: r.x + 90, y: r.y + 170 };
    });
    await page.mouse.click(original.x, original.y);
    await page.type("[name=text]", "Dialog content stays here");
    await page.keyboard.down("Control");
    await page.keyboard.press("k");
    await page.keyboard.up("Control");
    assert.equal(await page.$("#jump-query"), null, "global switcher must not replace an open draft");
    await page.evaluate(() =>
      window.voiceTestInstances[0].result("Different destination"),
    );
    assert.equal(
      await page.$eval("[name=text]", (n) => n.value),
      "Dialog content stays here",
    );
    assert.match(await page.$eval(".footer", (n) => n.textContent), /1 of 2/);
    assert.equal(
      await page.evaluate(() => window.voiceTestInstances[0].aborts),
      1,
    );
    await page.click("form button[type=submit]");
    assert.match(
      await page.$eval("#ink", (n) => n.textContent),
      /Dialog content stays here/,
    );
    await page.setViewport({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth),
      390,
    );
    await page.click("#home");
    await page.click("#library-view");
    assert.ok(await page.$(".books.list"));
    await page.keyboard.down("Control");
    await page.keyboard.press("k");
    await page.keyboard.up("Control");
    await page.waitForSelector("#jump-query");
    await page.type("#jump-query", "Quick");
    await page.click("[data-jump]");
    assert.equal(await page.$eval("#title", (n) => n.value), "Quick note");
  },
);
