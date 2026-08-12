// Headless end-to-end proof: build output served by `vite preview`, loaded in
// headless Chrome (driven by puppeteer-core) with ?sim=1&fast=1. The sim
// replays a scripted transcript through the live pipeline (matcher, command
// grammar, act engine, IndexedDB) and serializes a #jt-report node; we assert
// on it and re-validate every cursor/receipt with ajv. The test builds dist/
// if it is missing.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { validateCursor, validateReceipt, errorsOf, root } from "./validate.mjs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 4931;

async function waitFor(url, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`server never came up at ${url}`);
}

test("sim replay: records created, schema-valid, undo works", { timeout: 120000 }, async (t) => {
  assert.ok(existsSync(CHROME), "Google Chrome required for headless e2e");
  if (!existsSync(path.join(root, "dist", "index.html"))) {
    execFileSync("npx", ["vite", "build"], { cwd: root, stdio: "inherit" });
  }
  const server = spawn("npx", ["vite", "preview", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], {
    cwd: root,
    stdio: "ignore",
  });
  t.after(() => server.kill("SIGTERM"));
  await waitFor(`http://127.0.0.1:${PORT}/`);

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--disable-gpu", "--no-first-run"],
  });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/?sim=1&fast=1`, { waitUntil: "load" });
  await page.waitForSelector("#jt-report", { timeout: 60000 });
  const report = JSON.parse(
    await page.$eval("#jt-report", (n) => n.textContent)
  );

  // The glide worked: live matching hit both read passages.
  assert.ok(report.matches > 0, "no transcript matches recorded");
  assert.ok(report.blocksHit.includes(3), "block 3 never matched");
  assert.ok(report.blocksHit.includes(4), "block 4 never matched");

  // All four spoken commands were recognized, in order.
  assert.deepEqual(report.commands, ["highlight", "note", "important", "undo"]);

  // Four history entries: three acts + one undo.
  const acts = report.entries.filter((e) => e.kind === "act");
  const undos = report.entries.filter((e) => e.kind === "undo");
  assert.equal(acts.length, 3, `expected 3 acts, got ${acts.length}`);
  assert.equal(undos.length, 1, `expected 1 undo, got ${undos.length}`);
  assert.deepEqual(
    acts.map((e) => e.act),
    ["highlight", "note", "important"]
  );

  // The undo reversed the last act, and says so.
  const important = acts.find((e) => e.act === "important");
  assert.equal(important.undone, true, "important act not marked undone");
  assert.equal(undos[0].undoes, important.id, "undo does not reference the reversed act");
  const survivors = acts.filter((e) => !e.undone);
  assert.deepEqual(survivors.map((e) => e.act), ["highlight", "note"]);

  // Acts happened where the reading was: highlight on block 3, note on 4.
  assert.equal(acts[0].blockIndex, 3);
  assert.equal(acts[1].blockIndex, 4);

  // Evidence is attached: what was said, and match confidence for acts.
  for (const e of report.entries) {
    assert.ok(e.evidence?.length > 0, `entry ${e.id} has no evidence`);
  }
  assert.ok(acts[0].confidence > 0.6, "no plausible confidence on highlight act");

  // Every record on the wire conforms to the contracts.
  for (const e of report.entries) {
    assert.ok(validateCursor(e.cursor), `${e.id} cursor: ${errorsOf(validateCursor)}`);
    assert.ok(validateReceipt(e.receipt), `${e.id} receipt: ${errorsOf(validateReceipt)}`);
  }
});
