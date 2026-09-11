import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

  await page.goto("http://127.0.0.1:4964/#/home", { waitUntil: "load" });
  await page.waitForFunction(() => window.__jtApp?.booted && window.__jtApp.view() === "home");
  assert.equal(await page.$eval("#home-empty [data-state]", (node) => node.dataset.state), "empty");
  assert.equal(await page.$eval("#home-add-more", (node) => getComputedStyle(node).display), "none");
  await page.evaluate(() => {
    const input = document.getElementById("home-file-input");
    input.addEventListener("click", () => { window.__homeFilePickerOpened = true; });
  });
  await page.evaluate(() => document.querySelector('#home-empty [data-state-action="open-document"]').click());
  assert.equal(await page.evaluate(() => window.__homeFilePickerOpened), true);
  const input = await page.$("#home-file-input");
  await input.uploadFile(path.join(root, "README.md"));
  await page.waitForFunction(() => window.__jtApp.view() === "read");
  await page.goto("http://127.0.0.1:4964/#/home", { waitUntil: "load" });
  await page.waitForFunction(() => window.__jtApp?.booted && window.__jtApp.view() === "home");
  assert.equal(await page.$eval("#home-empty", (node) => node.hidden), true);

  await page.evaluate(() => localStorage.setItem("jt.homePasteDraft", "unfinished board notes"));
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => window.__jtApp?.booted && window.__jtApp.view() === "home");
  assert.equal(await page.$eval("#home-recovery-state [data-state]", (node) => node.dataset.state), "recovery");
  if (process.env.CAPTURE_RECOVERY_EVIDENCE === "1") {
    const evidenceDirectory = path.join(root, "evidence", "home-recovery");
    const axeSource = readFileSync(path.join(root, "node_modules", "axe-core", "axe.min.js"), "utf8");
    mkdirSync(evidenceDirectory, { recursive: true });
    const files = [];
    for (const viewport of [
      { size: "desktop", width: 1280, height: 900 },
      { size: "phone", width: 375, height: 812 },
    ]) {
      await page.setViewport({ width: viewport.width, height: viewport.height });
      await page.addScriptTag({ content: axeSource });
      const violations = await page.evaluate(async () => {
        const result = await axe.run(document, { resultTypes: ["violations"] });
        return result.violations.map(({ id, impact, help, nodes }) => ({
          id, impact, help, targets: nodes.map((node) => node.target),
        }));
      });
      assert.deepEqual(violations, [], `home recovery axe violations at ${viewport.width}px`);
      const file = `home-recovery-${viewport.size}.png`;
      await page.screenshot({ path: path.join(evidenceDirectory, file), fullPage: true });
      const sha256 = createHash("sha256").update(readFileSync(path.join(evidenceDirectory, file))).digest("hex");
      files.push({ file, ...viewport, sha256, violations });
    }
    writeFileSync(path.join(evidenceDirectory, "manifest.json"), `${JSON.stringify({
      generatedAt: "2026-09-11",
      source: "production Vite build after reload with an unfinished local paste draft",
      route: "#/home",
      state: "recovery",
      integration: "input persists the unfinished draft; restore-draft returns it to the editor; successful ingestion removes the retained copy",
      files,
    }, null, 2)}\n`);
  }
  await page.evaluate(() => document.querySelector('#home-recovery-state [data-state-action="restore-draft"]').click());
  assert.equal(await page.$eval("#home-paste-box", (node) => node.value), "unfinished board notes");
  assert.equal(await page.$eval("#home-recovery-state", (node) => node.hidden), true);
  await page.type("#home-paste-box", " revised");
  assert.equal(await page.evaluate(() => localStorage.getItem("jt.homePasteDraft")), "unfinished board notes revised");
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => window.__jtApp?.booted && window.__jtApp.view() === "home");
  await page.evaluate(() => document.querySelector('#home-recovery-state [data-state-action="restore-draft"]').click());
  await page.click("#home-paste-add");
  await page.waitForFunction(() => window.__jtApp.view() === "read");
  assert.equal(await page.evaluate(() => localStorage.getItem("jt.homePasteDraft")), null);

  await page.evaluate(() => {
    window.webkitSpeechRecognition = class {};
    window.__micPermissionAttempts = 0;
    navigator.mediaDevices.getUserMedia = async () => {
      window.__micPermissionAttempts += 1;
      throw new DOMException("blocked for test", "NotAllowedError");
    };
    window.__jtApp.showView("settings");
  });
  await page.click("#set-voice-on");
  await page.waitForFunction(() => window.__jtApp.micState() === "denied");
  assert.equal(await page.$eval("#voice-permission-state [data-state]", (node) => node.dataset.state), "permission");
  await page.evaluate(() => document.querySelector('#voice-permission-state [data-state-action="request-microphone"]').click());
  await page.waitForFunction(() => window.__micPermissionAttempts === 2);
  assert.match(await page.$eval("#set-voice-state", (node) => node.textContent), /blocking the microphone/);
});
