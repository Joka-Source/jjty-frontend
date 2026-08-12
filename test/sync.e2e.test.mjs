// Two-device moment transport, end to end: the jt-sync relay runs as a real
// node process; two browser pages pair with the three-spoken-word code; a
// kept act travels A -> B as a full moment. Asserts arrival, hash
// verification on both ends, the verified badge in B's inbox UI, and that
// the intention record (cursor) and proof (receipt) validate against the
// vendored contracts after the trip.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { validateCursor, validateReceipt, errorsOf, root } from "./validate.mjs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 4934;
const SYNC_REPO = "/Users/apple/projects/jt-sync";

function startRelay(t) {
  return new Promise((resolve, reject) => {
    const relay = spawn("npx", ["tsx", "src/relay-main.ts", "0"], {
      cwd: SYNC_REPO,
      stdio: ["ignore", "pipe", "inherit"],
    });
    t.after(() => relay.kill("SIGTERM"));
    const timer = setTimeout(() => reject(new Error("relay never announced its port")), 20000);
    let buf = "";
    relay.stdout.on("data", (d) => {
      buf += String(d);
      const m = buf.match(/listening ws:\/\/127\.0\.0\.1:(\d+)/);
      if (m) {
        clearTimeout(timer);
        resolve(`ws://127.0.0.1:${m[1]}`);
      }
    });
  });
}

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

test("moment-send: pair two pages by spoken words, send a kept act, verify", { timeout: 120000 }, async (t) => {
  assert.ok(existsSync(CHROME), "Google Chrome required for headless e2e");
  if (!existsSync(path.join(root, "dist", "index.html"))) {
    execFileSync("npx", ["vite", "build"], { cwd: root, stdio: "inherit" });
  }
  const relayUrl = await startRelay(t);

  const server = spawn(
    "npx",
    ["vite", "preview", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
    { cwd: root, stdio: "ignore" }
  );
  t.after(() => server.kill("SIGTERM"));
  await waitFor(`http://127.0.0.1:${PORT}/`);

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--disable-gpu", "--no-first-run"],
  });
  t.after(() => browser.close());

  // Device A: run the sim so there are kept acts, with the relay wired.
  const pageA = await browser.newPage();
  await pageA.goto(
    `http://127.0.0.1:${PORT}/?sim=1&fast=1&relay=${encodeURIComponent(relayUrl)}`,
    { waitUntil: "load" }
  );
  await pageA.waitForSelector("#jt-report", { timeout: 60000 });

  // Device B: a second, plain page on the same relay.
  const pageB = await browser.newPage();
  await pageB.goto(`http://127.0.0.1:${PORT}/?relay=${encodeURIComponent(relayUrl)}`, {
    waitUntil: "load",
  });
  await pageB.waitForFunction(() => !!window.__jtApp, { timeout: 20000 });

  // A opens sharing and gets the three spoken words.
  const code = await pageA.evaluate(() => window.__jtApp.syncOpen());
  assert.match(code, /^[a-z]+-[a-z]+-[a-z]+$/, `not a spoken-word code: ${code}`);

  // B joins by "hearing" the words (spoken form, spaces not dashes).
  await pageB.evaluate((words) => window.__jtApp.syncJoin(words), code.split("-").join(" "));
  await pageA.waitForFunction(() => window.__jtApp.syncState().paired, { timeout: 10000 });

  // A sends its latest kept act as a moment.
  const sent = await pageA.evaluate(() => window.__jtApp.syncSendLatest());
  assert.ok(sent, "nothing was sent");
  assert.equal(sent.delivered, true, "receiver did not verify the delivery");
  assert.equal(sent.hashMatch, true, "receiver hash differs from sender hash");
  assert.match(sent.localHash, /^sha256:[0-9a-f]{64}$/);

  // B received it: verified, hash matches, full moment intact.
  await pageB.waitForFunction(() => window.__jtApp.inbox().length > 0, { timeout: 10000 });
  const item = await pageB.evaluate(() => window.__jtApp.inbox()[0]);
  assert.equal(item.verified, true, "arrival not hash-verified");
  assert.equal(item.contentHash, sent.localHash, "content hash changed in transit");
  assert.ok(item.moment.blocks.length > 0, "moment arrived with no blocks");
  assert.ok(item.moment.provenance.sourceDigest.startsWith("sha256:"), "no source digest");
  assert.equal(item.moment.provenance.sourceTitle, "sim run");

  // The intention record survived the trip and still validates.
  assert.ok(validateCursor(item.moment.cursor), `cursor: ${errorsOf(validateCursor)}`);
  assert.ok(validateReceipt(item.moment.receipt), `receipt: ${errorsOf(validateReceipt)}`);
  assert.ok(item.moment.cursor.capturedEvidence.length > 0, "evidence stripped in transit");

  // And B's inbox UI says so in plain words.
  const badge = await pageB.$eval("#inbox-list .badge.ok", (n) => n.textContent);
  assert.equal(badge, "verified");
});
