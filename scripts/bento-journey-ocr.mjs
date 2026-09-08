import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import puppeteer from "puppeteer-core";
import mupdf from "mupdf";
// Fail before OCR setup if either local application is unavailable.
for (const url of ["http://127.0.0.1:5174/", "http://127.0.0.1:5181/"]) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  assert.ok(
    response.ok,
    `Local application unavailable: ${url} (${response.status})`,
  );
}
const require = createRequire(import.meta.url);
const {
  PDFDocument,
} = require("../../runtime/bento-jett/node_modules/pdf-lib");
const directory =
  process.env.BENTO_EVIDENCE_DIR ||
  new URL("../../runtime/bento-ocr-evidence/", import.meta.url).pathname;
await mkdir(directory, { recursive: true });
await mkdir(`${directory}/downloads`, { recursive: true });
const mixed = process.env.BENTO_OCR_LANGUAGE === "mixed";
const blockExternal = process.env.BENTO_ALLOW_EXTERNAL !== "1";
const deniedRequests = [];
const denyProxy = createServer((req, res) => {
  deniedRequests.push({ method: req.method, url: req.url });
  res.writeHead(403);
  res.end("External network disabled for this test");
});
denyProxy.on("connect", (req, socket) => {
  socket.on("error", () => {}); // Chrome may reset a deliberately denied tunnel.
  deniedRequests.push({ method: "CONNECT", url: req.url });
  socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
});
if (blockExternal)
  await new Promise((resolve) => denyProxy.listen(0, "127.0.0.1", resolve));
const profile = await mkdtemp(path.join(tmpdir(), "jett-ocr-fresh-"));
const expected = [
  "JETT OCR TEST",
  "Invoice number 2026",
  "Searchable documents stay useful",
];
if (mixed) expected.push("यह एक परीक्षण दस्तावेज है");
const browser = await puppeteer.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  userDataDir: profile,
  args: [
    "--no-first-run",
    ...(blockExternal
      ? [
          `--proxy-server=http://127.0.0.1:${denyProxy.address().port}`,
          "--proxy-bypass-list=<-loopback>;127.0.0.1;localhost;[::1]",
        ]
      : []),
  ],
});
const assets = [],
  errors = [],
  diagnostics = [],
  networkSessions = [];
let page, bento, token;
const pointerEvidence = [];
async function clickPointer(selector, name) {
  const element = await bento.waitForSelector(selector, { visible: true });
  if (!(await element.isIntersectingViewport({ threshold: 1 })))
    await element.scrollIntoView();
  // Reproduce the ordinary near-bottom viewport position where the fixed
  // handoff banner previously intercepted an otherwise visible tool button.
  const deltaY = await element.evaluate(
    (target) => target.getBoundingClientRect().bottom - (innerHeight - 16),
  );
  await bento.mouse.wheel({ deltaY });
  await new Promise((resolve) => setTimeout(resolve, 150));
  const geometry = await element.evaluate((target) => {
    const rect = target.getBoundingClientRect();
    const x = rect.x + rect.width / 2,
      y = rect.y + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    return {
      target: target.id || target.textContent.trim(),
      rect: rect.toJSON(),
      x,
      y,
      hit: hit
        ? {
            tag: hit.tagName,
            id: hit.id,
            text: hit.textContent.trim().slice(0, 180),
          }
        : null,
      reachable: target === hit || target.contains(hit),
      viewport: { width: innerWidth, height: innerHeight, scrollY },
      banner: document
        .querySelector("[data-jett-handoff]")
        ?.getBoundingClientRect()
        .toJSON(),
    };
  });
  pointerEvidence.push({ name, ...geometry });
  await writeFile(
    `${directory}/pointer-geometry.json`,
    JSON.stringify(pointerEvidence, null, 2),
  );
  await bento.screenshot({ path: `${directory}/pointer-${name}.png` });
  if (process.env.BENTO_POINTER_REPRO !== "1")
    assert.ok(
      geometry.reachable,
      `${name} center intercepted by ${geometry.hit?.text}`,
    );
  await bento.mouse.click(geometry.x, geometry.y);
}
const networkPolicy = {
  externalHttpHttpsBlockedBeforeBrowserLaunch: blockExternal,
  freshProfile: true,
  sharedProfileOrCache: false,
  localServersRequired: ["127.0.0.1:5174", "127.0.0.1:5181"],
  serverFreePwaOffline: false,
};
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const textOf = (bytes) => {
  const doc = mupdf.Document.openDocument(bytes, "application/pdf");
  const pages = [];
  for (let i = 0; i < doc.countPages(); i++) {
    const page = doc.loadPage(i);
    const text = page.toStructuredText();
    pages.push(text.asText());
    text.destroy();
    page.destroy();
  }
  doc.destroy();
  return pages.join("\n");
};
browser.on("targetcreated", async (target) => {
  if (!["worker", "other"].includes(target.type())) return;
  try {
    const session = await target.createCDPSession();
    networkSessions.push(session);
    await session.send("Network.enable");
    session.on("Network.responseReceived", (event) => {
      const r = event.response;
      if (/jett-ocr|traineddata|tesseract|\.wasm|font/i.test(r.url))
        assets.push({
          channel: "worker",
          url: r.url,
          status: r.status,
          mimeType: r.mimeType,
          fromDiskCache: r.fromDiskCache,
        });
    });
  } catch (error) {
    diagnostics.push({
      kind: "worker-observation-ended",
      message: error.message,
    });
  }
});
try {
  const canvasPage = await browser.newPage();
  if (blockExternal) {
    networkPolicy.probes = await canvasPage.evaluate(async () => {
      const pageBlocked = await fetch(
        "https://example.com/jett-network-policy-page",
      ).then(
        () => false,
        () => true,
      );
      const workerBlocked = await new Promise((resolve) => {
        const worker = new Worker(
          URL.createObjectURL(
            new Blob(
              [
                `fetch('https://example.org/jett-network-policy-worker').then(()=>postMessage(false),()=>postMessage(true));`,
              ],
              { type: "text/javascript" },
            ),
          ),
        );
        worker.onmessage = (event) => {
          resolve(event.data);
          worker.terminate();
        };
        worker.onerror = () => {
          resolve(false);
          worker.terminate();
        };
      });
      return { pageBlocked, workerBlocked };
    });
    assert.deepEqual(networkPolicy.probes, {
      pageBlocked: true,
      workerBlocked: true,
    });
    assert.ok(
      deniedRequests.some((request) => request.url === "example.com:443"),
    );
    assert.ok(
      deniedRequests.some((request) => request.url === "example.org:443"),
    );
  }
  const png = await canvasPage.evaluate(
    async ({ lines, mixed }) => {
      if (mixed) {
        const font = new FontFace(
          "JETT Fixture Devanagari",
          'local("KohinoorDevanagari-Regular"), local("Kohinoor Devanagari Regular")',
        );
        await font.load();
        document.fonts.add(font);
      }

      const canvas = document.createElement("canvas");
      canvas.width = 1600;
      canvas.height = 1000;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, 1600, 1000);
      ctx.fillStyle = "#111";
      ctx.font = mixed ? '64px "JETT Fixture Devanagari", Arial' : "64px Arial";
      lines.forEach((line, i) => ctx.fillText(line, 100, 200 + 160 * i));
      return canvas.toDataURL("image/png").split(",")[1];
    },
    { lines: expected, mixed },
  );
  await canvasPage.close();
  const pdf = await PDFDocument.create();
  const image = await pdf.embedPng(Buffer.from(png, "base64"));
  const pdfPage = pdf.addPage([800, 500]);
  pdfPage.drawImage(image, { x: 0, y: 0, width: 800, height: 500 });
  const original = process.env.BENTO_OCR_FIXTURE
    ? await readFile(process.env.BENTO_OCR_FIXTURE)
    : Buffer.from(await pdf.save());
  const fixture = `${directory}/image-only-source.pdf`;
  await writeFile(fixture, original);
  assert.equal(textOf(original).trim(), "", "Source must be image only");
  page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem("jt.welcomed", "1");
    localStorage.setItem("jt.mic", "off");
  });
  await page.goto("http://127.0.0.1:5174");
  await page.waitForFunction(() => window.__jtApp?.booted);
  await (await page.$("#home-file-input")).uploadFile(fixture);
  await page.waitForSelector("#bento-original:not([hidden])");
  const source = await page.evaluate(() => window.__jtApp.currentDoc().id);
  await page.waitForFunction(()=>document.querySelector('#reader-tabs [aria-selected="true"]')?.dataset.documentId===window.__jtApp.currentDoc()?.id);
  await page.locator("#reader-more-tools > summary").click();
  await page.select("#bento-tool", "ocr");
  await page.click("#bento-original");
  const target = await browser.waitForTarget((t) =>
    t.url().includes("5181/ocr-pdf.html#jett="),
  );
  bento = await target.page();
  await bento.setViewport({ width: 1440, height: 1000 });
  const cdp = await bento.createCDPSession();
  await cdp.send("Browser.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: `${directory}/downloads`,
  });
  bento.on("pageerror", (error) => errors.push(error.message));
  bento.on("console", (message) => {
    if (message.type() === "error") {
      if (/^Estimating resolution as \d+/.test(message.text()))
        diagnostics.push({
          kind: "tesseract-diagnostic",
          message: message.text(),
        });
      else if (
        /^Warning: Parameter not found: (classify_misfit_junk_penalty|merge_fragments_in_matrix)$/.test(
          message.text(),
        )
      )
        diagnostics.push({
          kind: "tesseract-model-parameter-warning",
          message: message.text(),
        });
      else if (
        blockExternal &&
        /ERR_(TUNNEL_CONNECTION_FAILED|PROXY_CONNECTION_FAILED)/.test(
          message.text(),
        )
      )
        diagnostics.push({
          kind: "expected-external-network-refusal",
          message: message.text(),
        });
      else errors.push(message.text());
    }
  });
  bento.on("response", (response) => {
    if (/jett-ocr|traineddata|tesseract|\.wasm|font/i.test(response.url()))
      assets.push({
        channel: "page",
        url: response.url(),
        status: response.status(),
        fromCache: response.fromCache(),
      });
  });
  bento.on("requestfailed", (request) => {
    if (
      request.failure()?.errorText === "net::ERR_ABORTED" &&
      request.url().includes("/api/jett/handoffs/")
    )
      diagnostics.push({
        kind: "navigation-aborted-transfer",
        message: "Handoff fetch interrupted during page navigation",
      });
    else if (
      blockExternal &&
      !["127.0.0.1", "localhost", "[::1]"].includes(
        new URL(request.url()).hostname,
      )
    )
      diagnostics.push({
        kind: "expected-external-network-refusal",
        message: request.url(),
      });
    else errors.push(`${request.url()}: ${request.failure()?.errorText}`);
  });
  token = new URLSearchParams(new URL(bento.url()).hash.slice(1)).get("jett");
  await bento.waitForSelector("#tool-options:not(.hidden)", { timeout: 45000 });
  await bento.waitForSelector('.lang-checkbox[value="eng"]');
  if (!(await bento.$eval('.lang-checkbox[value="eng"]', (e) => e.checked)))
    await bento.click('.lang-checkbox[value="eng"]');
  if (
    mixed &&
    !(await bento.$eval('.lang-checkbox[value="hin"]', (e) => e.checked))
  )
    await bento.click('.lang-checkbox[value="hin"]');
  const selectedLanguages = await bento.$$eval(
    ".lang-checkbox:checked",
    (els) => els.map((el) => el.value),
  );
  assert.deepEqual(
    selectedLanguages.slice().sort(),
    mixed ? ["eng", "hin"] : ["eng"],
  );
  await bento.screenshot({
    path: `${directory}/ocr-before.png`,
    fullPage: true,
  });
  if (process.env.BENTO_CAPTURE_HOCR === "1") {
    await bento.evaluate(() => {
      window.__jettObservedHocr = [];
      const NativeWorker = window.Worker;
      window.Worker = new Proxy(NativeWorker, {
        construct(target, args, newTarget) {
          const worker = Reflect.construct(target, args, newTarget);
          worker.addEventListener("message", (event) => {
            const hocr = event.data?.data?.hocr ?? event.data?.hocr;
            if (typeof hocr === "string") window.__jettObservedHocr.push(hocr);
          });
          return worker;
        },
      });
    });
  }
  const injectedFailure = process.env.BENTO_OCR_INJECT_SECOND_PAGE === "1";
  if (injectedFailure) {
    await bento.evaluate(async () => {
      const url = performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .find((url) => /tesseract.*js\.js/.test(url));
      if (!url)
        throw new Error(
          "Loaded Tesseract module URL missing for fault injection",
        );
      const module = await import(url),
        library = module.default;
      const original = library.createWorker;
      let recognized = 0;
      library.createWorker = async function (...args) {
        const worker = await original.apply(this, args),
          recognize = worker.recognize;
        worker.recognize = async function (...args) {
          if (++recognized === 2)
            throw new Error("SYNTHETIC_TEST_SECOND_PAGE_RECOGNITION_FAILURE");
          return recognize.apply(this, args);
        };
        return worker;
      };
    });
  }
  const started = Date.now();
  await clickPointer("#process-btn", "process");
  await bento.waitForSelector("#ocr-progress:not(.hidden)", { timeout: 10000 });
  const checkpoint = setInterval(async () => {
    try {
      const state = await bento.evaluate(() => ({
        status: document.getElementById("progress-status")?.textContent,
        progress: document.getElementById("progress-log")?.textContent,
      }));
      await writeFile(
        `${directory}/ocr-live-checkpoint.json`,
        JSON.stringify(
          {
            elapsedMs: Date.now() - started,
            ...state,
            assetResponses: assets.length,
          },
          null,
          2,
        ),
      );
    } catch {}
  }, 5000);
  try {
    await bento.waitForFunction(
      () =>
        !document.getElementById("ocr-results").classList.contains("hidden") ||
        !document.getElementById("alert-modal").classList.contains("hidden"),
      { timeout: 180000 },
    );
  } finally {
    clearInterval(checkpoint);
  }
  if (process.env.BENTO_CAPTURE_HOCR === "1") {
    const hocr = await bento.evaluate(() => window.__jettObservedHocr);
    await writeFile(
      `${directory}/ocr-hocr-observation.json`,
      JSON.stringify(
        {
          observation:
            "Read-only listener on actual worker message events; recognition inputs/results unmodified",
          hocr,
        },
        null,
        2,
      ),
    );
    assert.ok(hocr.length > 0, "Actual worker hOCR output was not observed");
  }
  const ui = await bento.evaluate(() => ({
    text: document.getElementById("ocr-text-output").value,
    progress: document.getElementById("progress-log").textContent,
    heading: document.querySelector("#ocr-results h3")?.textContent,
    description: document.querySelector("#ocr-results p")?.textContent,
    alert: document.getElementById("alert-message").textContent,
    resultsVisible: !document
      .getElementById("ocr-results")
      .classList.contains("hidden"),
  }));
  await writeFile(
    `${directory}/ocr-engine-observation.json`,
    JSON.stringify(
      {
        durationMs: Date.now() - started,
        ui,
        selectedLanguages,
        assets,
        errors,
        diagnostics,
        networkPolicy,
        controlPath:
          "OCR process and PDF download use actual pointer clicks with center hit-target assertions",
        pointerEvidence,
        deniedRequests,
      },
      null,
      2,
    ).replaceAll(token, "[redacted]"),
  );
  assert.ok(ui.resultsVisible, `OCR failed: ${ui.alert}`);
  if (injectedFailure) {
    assert.equal(ui.heading, "OCR finished with warnings");
    assert.ok(ui.description.includes("incomplete on page 2"));
    assert.ok(ui.description.includes("All original pages are preserved"));
    assert.ok(!ui.text.includes("Ninety degree page"));
  }
  const recognition = expected.map((line) => ({
    expected: line,
    exactMatch: ui.text.includes(line),
  }));
  for (const line of expected)
    assert.ok(ui.text.includes(line), `Missing recognized phrase ${line}`);
  await bento.screenshot({
    path: `${directory}/ocr-recognized.png`,
    fullPage: true,
  });
  await clickPointer("#download-searchable-pdf", "export");
  await bento.waitForFunction(
    () => document.body.innerText.includes("PDF export ready."),
    { timeout: 30000 },
  );
  await bento.setViewport({ width: 390, height: 844 });
  const narrowControls = [];
  for (const control of await bento.$$(
    "[data-jett-handoff] a, [data-jett-handoff] button",
  )) {
    if (!(await control.isVisible())) continue;
    await control.scrollIntoView();
    const geometry = await control.evaluate((target) => {
      const rect = target.getBoundingClientRect();
      const x = rect.x + rect.width / 2,
        y = rect.y + rect.height / 2;
      const hit = document.elementFromPoint(x, y);
      return {
        text: target.textContent.trim(),
        rect: rect.toJSON(),
        x,
        y,
        reachable: hit === target || target.contains(hit),
        banner: document
          .querySelector("[data-jett-handoff]")
          .getBoundingClientRect()
          .toJSON(),
      };
    });
    narrowControls.push(geometry);
    assert.ok(
      geometry.reachable,
      `Narrow banner control unreachable: ${geometry.text}`,
    );
    assert.ok(
      geometry.rect.left >= 0 && geometry.rect.right <= 390,
      "Narrow banner control overflows viewport",
    );
    if (geometry.text === "Return to JETT") {
      await bento.screenshot({
        path: `${directory}/pointer-narrow-banner.png`,
      });
      const opened = browser.waitForTarget(
        (target) =>
          target.opener() === bento.target() &&
          target.url().startsWith("http://127.0.0.1:5174/"),
        { timeout: 10000 },
      );
      await bento.mouse.click(geometry.x, geometry.y);
      const returnedPage = await (await opened).page();
      await returnedPage
        .waitForFunction(() => window.__jtApp?.booted, { timeout: 10000 })
        .catch(async (error) => {
          await writeFile(
            `${directory}/return-popup-failure.txt`,
            await returnedPage.content(),
          );
          await returnedPage.screenshot({
            path: `${directory}/return-popup-failure.png`,
          });
          throw error;
        });
      await returnedPage.close();
    }
  }
  assert.ok(
    narrowControls.some((control) => control.text === "Return to JETT"),
  );
  await writeFile(
    `${directory}/pointer-narrow-geometry.json`,
    JSON.stringify(narrowControls, null, 2),
  );
  await bento.setViewport({ width: 1440, height: 1000 });
  await page.bringToFront();
  await page.reload();
  await page.waitForFunction(() => window.__jtApp?.booted);
  await page.click("#bento-save");
  await page.waitForFunction(
    () =>
      document
        .getElementById("bento-status")
        .textContent.includes("as a new document"),
    { timeout: 30000 },
  );
  await page.reload();
  await page.waitForFunction(() => window.__jtApp?.booted);
  const docs = await page.evaluate(async () => {
    const db = await import("/src/db.js");
    return (await db.getDocs()).map((d) => ({
      id: d.id,
      title: d.title,
      provenance: d.provenance,
      bytes: Array.from(d.sourceBytes || []),
    }));
  });
  const returned = docs.find(
    (d) => d.provenance?.derivedFrom?.documentId === source,
  );
  assert.ok(returned);
  assert.deepEqual(
    Buffer.from(docs.find((d) => d.id === source).bytes),
    original,
  );
  returned.provenance.derivedFrom.handoffId = "[redacted ephemeral handoff]";
  assert.ok(
    assets.some(
      (asset) =>
        asset.url.includes("/eng.traineddata.gz") && asset.status === 200,
    ),
    "English language download not observed",
  );
  assert.ok(
    assets.some(
      (asset) => asset.url.endsWith("/worker.min.js") && asset.status === 200,
    ),
    "Actual Tesseract worker download not observed",
  );
  if (blockExternal) {
    for (const fragment of [
      "/jett-ocr/core/",
      "/jett-ocr/fonts/NotoSans-Regular.ttf",
      ...(mixed
        ? [
            "/jett-ocr/lang/hin.traineddata.gz",
            "/jett-ocr/fonts/NotoSansDevanagari-Regular.ttf",
          ]
        : []),
    ]) {
      assert.ok(
        assets.some(
          (asset) => asset.url.includes(fragment) && asset.status === 200,
        ),
        `Required local OCR asset was not observed: ${fragment}`,
      );
    }
  }
  assert.equal(
    errors.length,
    0,
    `Unhandled OCR/browser errors: ${errors.join("; ")}`,
  );
  const returnedBytes = Buffer.from(returned.bytes);
  await writeFile(`${directory}/ocr-returned.pdf`, returnedBytes);
  assert.deepEqual(
    await readFile(fixture),
    original,
    "On-disk original must also remain unchanged",
  );
  assert.deepEqual(
    await readFile(`${directory}/downloads/${returned.provenance.name}`),
    returnedBytes,
    "Native PDF download must match the returned PDF",
  );
  const extracted = textOf(returnedBytes);
  const searchableRecognition = expected.map((line) => ({
    expected: line,
    exactMatch: extracted.includes(line),
  }));
  for (const line of expected)
    assert.ok(
      extracted.includes(line),
      `Returned PDF has no searchable phrase ${line}`,
    );
  await page.goto("http://127.0.0.1:5174/#/home");
  await page.waitForSelector("#home-doc-list button");
  for (const button of await page.$$("#home-doc-list button"))
    if ((await button.evaluate((e) => e.textContent)) === returned.title) {
      await button.click();
      break;
    }
  await page.waitForFunction(
    () => document.querySelector(".pdf-page canvas")?.width > 0,
  );
  if (await page.$eval("#reader-search-controls", (el) => el.hidden))
    await page.click("#reader-search-toggle");
  await page.type("#pdf-search-input", "Invoice number 2026");
  await page.waitForFunction(
    () => document.getElementById("pdf-search-count").textContent === "1 of 1",
  );
  const search = await page.evaluate(() => ({
    query: document.getElementById("pdf-search-input").value,
    count: document.getElementById("pdf-search-count").textContent,
    painted: Boolean(
      globalThis.CSS?.highlights?.get("jt-pdf-search")?.size ||
      document.querySelector(".pdf-search-fallback"),
    ),
  }));
  assert.equal(
    search.painted,
    true,
    "Search hit should be painted in the reader",
  );
  await page.screenshot({
    path: `${directory}/ocr-reopened.png`,
    fullPage: true,
  });
  let hindiSearch = null;
  if (mixed) {
    const query = "दस्तावेज";
    hindiSearch = {
      query,
      attempted: false,
      reason:
        "The returned searchable text did not contain this exact Hindi word",
    };
    if (extracted.includes(query)) {
      await page.click("#pdf-search-input");
      for (let i = 0; i < 40; i++) await page.keyboard.press("ArrowRight");
      for (let i = 0; i < 40; i++) await page.keyboard.press("Backspace");
      await page.type("#pdf-search-input", query);
      assert.equal(
        await page.$eval("#pdf-search-input", (el) => el.value),
        query,
      );
      await page.waitForFunction(
        () =>
          document.getElementById("pdf-search-count").textContent === "1 of 1",
      );
      hindiSearch = await page.evaluate(() => ({
        query: document.getElementById("pdf-search-input").value,
        attempted: true,
        count: document.getElementById("pdf-search-count").textContent,
        painted: Boolean(
          globalThis.CSS?.highlights?.get("jt-pdf-search")?.size ||
          document.querySelector(".pdf-search-fallback"),
        ),
      }));
      assert.equal(hindiSearch.painted, true);
      await page.screenshot({
        path: `${directory}/ocr-hindi-search.png`,
        fullPage: true,
      });
    }
  }
  const corpusSearches = [];
  for (const expected of JSON.parse(
    process.env.BENTO_OCR_EXTRA_SEARCHES || "[]",
  )) {
    await page.click("#pdf-search-input");
    for (let i = 0; i < 60; i++) await page.keyboard.press("ArrowRight");
    for (let i = 0; i < 60; i++) await page.keyboard.press("Backspace");
    await page.type("#pdf-search-input", expected.query);
    await page.waitForFunction(
      () =>
        document.getElementById("pdf-search-count").textContent === "1 of 1",
    );
    const observation = await page.evaluate(() => {
      const ranges = [...(CSS.highlights?.get("jt-pdf-search") || [])];
      const range = ranges[0],
        fallback = document.querySelector(".pdf-search-fallback");
      const element = range?.startContainer?.parentElement || fallback;
      return {
        query: document.getElementById("pdf-search-input").value,
        page: Number(element?.closest(".pdf-page")?.dataset.page),
        painted: !!(range || fallback),
        rect: (range || fallback)?.getBoundingClientRect().toJSON(),
      };
    });
    assert.equal(observation.page, expected.page);
    assert.ok(observation.painted);
    corpusSearches.push(observation);
    await page.screenshot({
      path: `${directory}/ocr-search-page-${expected.page}.png`,
      fullPage: true,
    });
  }
  if (blockExternal) {
    assert.ok(
      assets
        .filter((asset) => asset.status === 200)
        .every((asset) =>
          ["127.0.0.1", "localhost", "[::1]"].includes(
            new URL(asset.url).hostname,
          ),
        ),
      "An OCR asset came from outside loopback",
    );
  }
  assert.ok(
    pointerEvidence.every((item) => item.reachable),
    "A pointer action was intercepted",
  );
  await writeFile(
    `${directory}/ocr-proof.json`,
    JSON.stringify(
      {
        result: injectedFailure
          ? "PASS_SYNTHETIC_PAGE_FAILURE_PRESERVATION_UI"
          : mixed
            ? "PASS_LOCAL_REAL_MIXED_OCR_UI"
            : "PASS_LOCAL_REAL_OCR_UI",
        sourceImageOnly: true,
        originalSHA256: sha(original),
        originalPreserved: true,
        resultSHA256: sha(returnedBytes),
        expected,
        recognizedText: ui.text,
        independentlyExtractedText: extracted,
        provenance: returned.provenance,
        assets,
        errors,
        diagnostics,
        networkPolicy,
        controlPath:
          "OCR process and PDF download use actual pointer clicks with center hit-target assertions",
        pointerEvidence,
        deniedRequests,
        recognition,
        selectedLanguages,
        searchableRecognition,
        fixtureFont: mixed
          ? "Installed Kohinoor Devanagari loaded through FontFace local(); load must succeed"
          : "Arial",
        firstUseNetworkDependency: blockExternal
          ? "Fresh profile with external HTTP(S) blocked browser-wide including workers; local JETT and Bento servers remain required. Not server-free PWA offline."
          : "External requests allowed for this run",
        narrowBanner: {
          viewport: { width: 390, height: 844 },
          controls: narrowControls,
          returnPointerOpenedJett: true,
        },
        sourceReloadAndResultReopen: true,
        search,
        hindiSearch,
        corpusSearches,
        faultInjection: injectedFailure
          ? {
              kind: "synthetic second-page recognize rejection",
              visibleHeading: ui.heading,
              visibleDescription: ui.description,
            }
          : null,
      },
      null,
      2,
    ),
  );
  console.log(
    injectedFailure
      ? "PASS SYNTHETIC second-page recognition failure: warning visible, PDF exported and durably returned; original preserved."
      : mixed
        ? `MEASURED mixed OCR: ${recognition.filter((item) => item.exactMatch).length}/${expected.length} exact recognized lines, ${searchableRecognition.filter((item) => item.exactMatch).length}/${expected.length} exact searchable lines; JETT return and word search verified.`
        : "PASS actual English OCR, searchable PDF export, JETT durable return, independent text readback and unchanged original.",
  );
} catch (error) {
  await writeFile(
    `${directory}/failure.json`,
    JSON.stringify(
      {
        message: error.message,
        assets,
        errors,
        diagnostics,
        networkPolicy,
        controlPath:
          "OCR process and PDF download use actual pointer clicks with center hit-target assertions",
        pointerEvidence,
        deniedRequests,
      },
      null,
      2,
    ).replaceAll(token || "NO_TOKEN", "[redacted]"),
  );
  if (bento) {
    await bento
      .screenshot({ path: `${directory}/failure.png`, fullPage: true })
      .catch(() => {});
    await writeFile(
      `${directory}/failure-body.txt`,
      await bento
        .evaluate(() => document.body.innerText)
        .catch(() => "unavailable"),
    );
  }
  throw error;
} finally {
  if (token) {
    const url = `http://127.0.0.1:5181/api/jett/handoffs/${token}`;
    try {
      const result = await (
        await fetch(`${url}/result`, {
          headers: { Origin: "http://127.0.0.1:5174" },
        })
      ).json();
      await fetch(url, {
        method: "DELETE",
        headers: {
          Origin: "http://127.0.0.1:5174",
          ...(result.digest ? { "If-Match": result.digest } : {}),
        },
      });
    } catch {}
  }
  if (token)
    for (const name of [
      "ocr-proof.json",
      "ocr-engine-observation.json",
      "failure.json",
    ]) {
      const path = `${directory}/${name}`;
      try {
        await writeFile(
          path,
          (await readFile(path, "utf8")).replaceAll(token, "[redacted]"),
        );
      } catch {}
    }
  await browser.close();
  if (blockExternal) await new Promise((resolve) => denyProxy.close(resolve));
  await rm(profile, { recursive: true, force: true });
}
