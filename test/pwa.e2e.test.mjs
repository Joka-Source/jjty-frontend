// Built-browser proof for the installable/offline jt surface. These checks
// exercise the production output: the emitted manifest, real service-worker
// lifecycle, a network-disabled navigation, IndexedDB persistence, and the
// browser install event.
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
      // The preview process may still be binding its port.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`preview never came up at ${url}`);
}

async function bootPwa(t, preferredPort, { userAgent } = {}) {
  assert.ok(existsSync(CHROME), "Google Chrome required for PWA e2e");
  assert.ok(existsSync(path.join(root, "dist", "sw.js")), "run the production build before PWA e2e");

  const server = spawn(
    process.execPath,
    [path.join(root, "node_modules", "vite", "bin", "vite.js"), "preview", "--host", "127.0.0.1", "--port", String(preferredPort), "--strictPort"],
    { cwd: root, stdio: "ignore" }
  );
  t.after(() => server.kill("SIGTERM"));
  const url = `http://127.0.0.1:${preferredPort}`;
  await waitFor(`${url}/`);

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--disable-gpu", "--no-first-run", "--no-sandbox", "--disable-setuid-sandbox"],
  });
  t.after(async () => {
    const timer = setTimeout(() => browser.process()?.kill("SIGKILL"), 5000);
    try { await browser.close(); } finally { clearTimeout(timer); }
  });
  const page = await browser.newPage();
  if (userAgent) await page.setUserAgent(userAgent);
  return { page, url };
}

function pngDimensions(bytes) {
  const buffer = Buffer.from(bytes);
  assert.deepEqual(
    [...buffer.subarray(0, 8)],
    [137, 80, 78, 71, 13, 10, 26, 10],
    "icon is not a PNG"
  );
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

async function dispatchInstallable(page) {
  return page.evaluate(() => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    event.prompt = async () => {
      window.__jtInstallPromptCalls = (window.__jtInstallPromptCalls || 0) + 1;
    };
    Object.defineProperty(event, "userChoice", {
      value: Promise.resolve({ outcome: "dismissed", platform: "web" }),
    });
    window.__jtBeforeInstallPrompt(event);
    return event.defaultPrevented;
  });
}

function holdNativeInstallEvent() {
  const nativeAddEventListener = window.addEventListener.bind(window);
  window.addEventListener = (type, listener, options) => {
    if (type === "beforeinstallprompt") {
      window.__jtBeforeInstallPrompt = listener;
      return;
    }
    nativeAddEventListener(type, listener, options);
  };
}

test("pwa manifest is linked, standalone, and carries generated maskable 192/512 icons", { timeout: 60000 }, async (t) => {
  const { page, url } = await bootPwa(t, 4940);
  await page.goto(`${url}/`, { waitUntil: "load" });

  assert.equal(
    await page.$eval('link[rel="manifest"]', (link) => link.getAttribute("href")),
    "/manifest.webmanifest"
  );
  const response = await fetch(`${url}/manifest.webmanifest`);
  assert.equal(response.ok, true, `manifest request failed with ${response.status}`);
  const manifest = await response.json();
  assert.equal(manifest.name, "jt");
  assert.equal(manifest.short_name, "jt");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.deepEqual(
    manifest.icons.map(({ sizes }) => sizes).sort(),
    ["192x192", "512x512"]
  );
  assert.equal(
    manifest.icons.every(({ purpose }) => purpose.split(/\s+/).includes("maskable")),
    true,
    "every launcher icon must declare maskable purpose"
  );

  for (const icon of manifest.icons) {
    const iconResponse = await fetch(new URL(icon.src, `${url}/manifest.webmanifest`));
    assert.equal(iconResponse.ok, true, `${icon.src} did not load`);
    const want = Number(icon.sizes.split("x")[0]);
    assert.deepEqual(pngDimensions(await iconResponse.arrayBuffer()), {
      width: want,
      height: want,
    });
  }
});

test("production app registers and activates its service worker", { timeout: 60000 }, async (t) => {
  const { page, url } = await bootPwa(t, 4941);
  await page.goto(`${url}/`, { waitUntil: "load" });
  await page.waitForFunction(
    () => navigator.serviceWorker.getRegistration().then(Boolean),
    { timeout: 5000 }
  );
  await page.waitForFunction(
    () => navigator.serviceWorker.getRegistration().then((registration) => registration.active?.state === "activated"),
    { timeout: 10000 }
  );
  const worker = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const active = registration.active;
    return {
      scope: registration.scope,
      state: active?.state,
      script: active?.scriptURL,
    };
  });
  assert.equal(worker.scope, `${url}/`);
  assert.equal(worker.state, "activated");
  assert.equal(worker.script, `${url}/sw.js`);
});

test("service worker installation leaves the lazy MuPDF engine out of the shell cache", { timeout: 90000 }, async (t) => {
  const { page, url } = await bootPwa(t, 4944);
  await page.goto(`${url}/`, { waitUntil: "load" });
  await page.waitForFunction(
    () => navigator.serviceWorker.getRegistration()
      .then((registration) => registration?.active?.state === "activated"),
    { timeout: 30000 },
  );

  const cachedUrls = await page.evaluate(async () => {
    const urls = [];
    for (const cacheName of await caches.keys()) {
      const cache = await caches.open(cacheName);
      urls.push(...(await cache.keys()).map((request) => request.url));
    }
    return urls;
  });

  assert.equal(
    cachedUrls.some((url) => /\/assets\/mupdf(?:-wasm)?-/.test(url)),
    false,
    "opening the shell must not download and cache the lazy MuPDF engine",
  );
});

test("offline navigation serves the shell and reopens an IndexedDB document", { timeout: 90000 }, async (t) => {
  const { page, url } = await bootPwa(t, 4942);
  await page.evaluateOnNewDocument(() => localStorage.setItem("jt.welcomed", "1"));
  await page.goto(`${url}/#/home`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__jtApp?.booted === true);
  // On a short viewport the sample sits below the fixed mobile navigation.
  // Scroll the intended action into the work area, as a person must do.
  await page.$eval("#home-sample", el => el.scrollIntoView({ block: "center" }));
  await page.click("#home-sample");
  await page.waitForFunction(
    () => window.__jtApp?.view() === "read" && document.querySelectorAll("#doc p[data-block]").length > 0
  );
  const stored = await page.evaluate(() => ({
    title: document.getElementById("doc-title").textContent,
    firstLine: document.querySelector("#doc p[data-block]").textContent,
  }));

  await page.waitForFunction(
    () => navigator.serviceWorker.getRegistration().then(Boolean),
    { timeout: 5000 }
  );
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await page.setOfflineMode(true);
  assert.equal(
    await page.evaluate(() =>
      fetch(`/not-in-the-shell-${Date.now()}`).then(
        () => false,
        () => true
      )
    ),
    true,
    "an uncached network request succeeded while offline"
  );
  await page.goto(`${url}/offline-proof#/read`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => window.__jtApp?.booted === true && document.querySelectorAll("#doc p[data-block]").length > 0,
    { timeout: 30000 }
  );
  const offline = await page.evaluate(() => ({
    view: window.__jtApp.view(),
    title: document.getElementById("doc-title").textContent,
    firstLine: document.querySelector("#doc p[data-block]").textContent,
  }));
  assert.deepEqual(offline, { view: "read", ...stored });
});

test("manual install help is platform-specific and the installable hint appears once", { timeout: 90000 }, async (t) => {
  const { page, url } = await bootPwa(t, 4943);
  await page.evaluateOnNewDocument(() => localStorage.setItem("jt.welcomed", "1"));
  await page.evaluateOnNewDocument(holdNativeInstallEvent);
  await page.goto(`${url}/#/settings`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__jtApp?.booted === true);

  const manual = await page.evaluate(() => ({
    text: document.getElementById("install-manual").textContent.trim(),
    manualHidden: document.getElementById("install-manual").hidden,
    buttonHidden: document.getElementById("install-button").hidden,
    hintHidden: document.getElementById("install-hint").hidden,
  }));
  assert.match(manual.text, /browser menu/i);
  assert.match(manual.text, /install jt|add to home screen/i);
  assert.equal(manual.manualHidden, false);
  assert.equal(manual.buttonHidden, true);
  assert.equal(manual.hintHidden, true, "hint must not appear before installability");

  assert.equal(await dispatchInstallable(page), true, "install event was not captured");
  await page.waitForFunction(() => !document.getElementById("install-hint").hidden);
  assert.deepEqual(
    await page.evaluate(() => ({
      manualHidden: document.getElementById("install-manual").hidden,
      buttonHidden: document.getElementById("install-button").hidden,
      hintHidden: document.getElementById("install-hint").hidden,
      seen: localStorage.getItem("jt.installHintSeen"),
    })),
    { manualHidden: true, buttonHidden: false, hintHidden: false, seen: "1" }
  );
  await page.click("#install-button");
  await page.waitForFunction(() => document.getElementById("install-manual").hidden === false);
  assert.equal(await page.evaluate(() => window.__jtInstallPromptCalls), 1, "install button did not call the browser prompt");

  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => window.__jtApp?.booted === true);
  assert.equal(await dispatchInstallable(page), true);
  await page.waitForFunction(() => !document.getElementById("install-button").hidden);
  assert.equal(
    await page.$eval("#install-hint", (hint) => hint.hidden),
    true,
    "one-time hint reappeared after reload"
  );

  const iosPage = await page.browser().newPage();
  await iosPage.setUserAgent(
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"
  );
  await iosPage.evaluateOnNewDocument(() => localStorage.setItem("jt.welcomed", "1"));
  await iosPage.evaluateOnNewDocument(holdNativeInstallEvent);
  await iosPage.goto(`${url}/#/settings`, { waitUntil: "load" });
  await iosPage.waitForFunction(() => window.__jtApp?.booted === true);
  const iosManual = await iosPage.$eval("#install-manual", (node) => node.textContent.trim());
  assert.match(iosManual, /Safari/i);
  assert.match(iosManual, /Share/);
  assert.match(iosManual, /Add to Home Screen/);
});

test('offline notebook navigation retains its own app and saved notebook', {timeout:60000}, async t => {
  const {page,url}=await bootPwa(t,4987);
  await page.goto(`${url}/notebooks/index.html`);
  await page.waitForSelector('#new');
  await page.click('#new');
  await page.type('[name=title]','Offline notebook fixture');
  await page.click('form button[type=submit]');
  await page.waitForFunction(()=>document.querySelector('.footer')?.textContent.includes('Saved on this browser'));
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);
  await page.setOfflineMode(true);
  await page.reload();
  await page.waitForSelector('#ink');
  assert.equal(await page.$eval('#title',n=>n.value),'Offline notebook fixture');
  assert.equal(await page.title(),'JETT · Notebooks');
});
