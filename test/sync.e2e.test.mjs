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

const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 4934;
const SYNC_REPO = process.env.JT_SYNC_REPO ?? path.join(root, "vendor", "jt-sync-runner");

function startRelay(t) {
  return new Promise((resolve, reject) => {
    const relay = spawn(process.execPath, [
      path.join(root, "node_modules", "tsx", "dist", "cli.mjs"),
      path.join(SYNC_REPO, "src", "relay-main.ts"),
      "0",
    ], {
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
  console.error(`[sync-e2e] relay ready ${relayUrl}`);

  const server = spawn(
    process.execPath,
    [path.join(root, "node_modules", "vite", "bin", "vite.js"), "preview", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
    { cwd: root, stdio: "ignore" }
  );
  t.after(() => server.kill("SIGTERM"));
  await waitFor(`http://127.0.0.1:${PORT}/`);
  console.error("[sync-e2e] preview ready");

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--disable-gpu", "--no-first-run", "--no-sandbox", "--disable-setuid-sandbox"],
  });
  t.after(() => browser.close());
  console.error("[sync-e2e] browser ready");

  // Device A: run the sim so there are kept acts, with the relay wired.
  const senderContext = await browser.createBrowserContext();
  const receiverContext = await browser.createBrowserContext();
  const pageA = await senderContext.newPage();
  await pageA.goto(
    `http://127.0.0.1:${PORT}/?sim=1&fast=1&relay=${encodeURIComponent(relayUrl)}`,
    { waitUntil: "load" }
  );
  await pageA.waitForSelector("#jt-report", { timeout: 60000 });
  console.error("[sync-e2e] simulated sender ready");

  // Device B: a second, plain page on the same relay.
  const pageB = await receiverContext.newPage();
  await pageB.goto(`http://127.0.0.1:${PORT}/?relay=${encodeURIComponent(relayUrl)}`, {
    waitUntil: "load",
  });
  await pageB.waitForFunction(() => !!window.__jtApp, { timeout: 20000 });
  console.error("[sync-e2e] receiver ready");

  const [senderDeviceId, receiverDeviceId] = await Promise.all([
    pageA.evaluate(() => localStorage.getItem("jt.sync.deviceId")),
    pageB.evaluate(() => localStorage.getItem("jt.sync.deviceId")),
  ]);
  assert.ok(senderDeviceId);
  assert.ok(receiverDeviceId);
  assert.notEqual(senderDeviceId, receiverDeviceId, "separate devices must not share identity");

  // A opens sharing and gets the three spoken words.
  const code = await pageA.evaluate(() => window.__jtApp.syncOpen());
  assert.match(code, /^[a-z]+-[a-z]+-[a-z]+$/, `not a spoken-word code: ${code}`);
  console.error("[sync-e2e] pair code created");

  // B joins by "hearing" the words (spoken form, spaces not dashes).
  await pageB.evaluate((words) => window.__jtApp.syncJoin(words), code.split("-").join(" "));
  await pageA.waitForFunction(() => window.__jtApp.syncState().paired, { timeout: 10000 });
  console.error("[sync-e2e] pages paired");

  // A sends its latest kept act as a moment.
  const sent = await pageA.evaluate(() => window.__jtApp.syncSendLatest());
  console.error("[sync-e2e] send call returned");
  assert.ok(sent, "nothing was sent");
  assert.equal(sent.delivered, true, "receiver did not verify the delivery");
  assert.equal(sent.hashMatch, true, "receiver hash differs from sender hash");
  assert.match(sent.localHash, /^sha256:[0-9a-f]{64}$/);

  // B received it: verified, hash matches, full moment intact.
  await pageB.waitForFunction(() => window.__jtApp.inbox().length > 0, { timeout: 10000 });
  console.error("[sync-e2e] moment received");
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
  const spaceAction = await pageB.$eval("#inbox-list .space-picker", (node) => node.textContent);
  assert.match(
    spaceAction,
    /choose who you are in spaces before sending here/i,
    "an arrived moment should expose the same send-to-space action as a kept act",
  );

  const storedBeforeReload = await pageB.evaluate(async () => {
    const open = indexedDB.open("jt-sync", 1);
    const database = await new Promise((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const read = database.transaction("momentLog").objectStore("momentLog").getAll();
    return new Promise((resolve, reject) => {
      read.onsuccess = () => resolve(read.result);
      read.onerror = () => reject(read.error);
    });
  });
  assert.equal(storedBeforeReload.length, 1);
  assert.equal(storedBeforeReload[0].contentHash, sent.localHash);

  // An unplanned socket loss closes both peer transports. A send begun in
  // that gap is first durable in the sender outbox, then automatically
  // resumes with the same pairing and drains exactly once.
  await pageB.evaluate(() => window.__jtApp.syncDropTransport());
  await pageA.waitForFunction(() => !window.__jtApp.syncState().connected, { timeout: 10000 });
  const resentPromise = pageA.evaluate(() => window.__jtApp.syncSendLatest());
  await pageA.waitForFunction(async () => {
    const open = indexedDB.open("jt-sync-outbox", 1);
    const db = await new Promise((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const request = db.transaction("momentOutbox").objectStore("momentOutbox").getAll();
    const rows = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return rows.length === 1;
  }, { timeout: 10000 });
  const resent = await resentPromise;
  assert.equal(resent.queued, true, "the caller should get an honest durable-queue receipt during the outage");
  await pageB.waitForFunction(() => window.__jtApp.inbox().length === 2, { timeout: 10000 });
  assert.equal(await pageA.evaluate(() => window.__jtApp.syncState().pending), 0);

  await pageB.reload({ waitUntil: "load" });
  await pageB.waitForFunction(() => !!window.__jtApp, { timeout: 20000 });
  assert.equal(
    await pageB.evaluate(() => localStorage.getItem("jt.sync.deviceId")),
    receiverDeviceId,
    "receiver identity must survive reload so its delivery evidence remains addressable",
  );
  await pageB.waitForFunction(
    () => window.__jtApp.syncState().connected && window.__jtApp.syncState().paired,
    { timeout: 20000 },
  );
  await pageB.waitForFunction(() => window.__jtApp.inbox().length === 2, { timeout: 20000 });
  const afterReload = await pageA.evaluate(() => window.__jtApp.syncSendLatest());
  assert.equal(afterReload.delivered, true, "a reloaded peer should receive without pairing again");
  await pageB.waitForFunction(() => window.__jtApp.inbox().length === 3, { timeout: 10000 });
  console.error("[sync-e2e] delivery verified");
});
