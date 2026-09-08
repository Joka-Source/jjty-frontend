import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import puppeteer from "puppeteer-core";
import mupdf from "mupdf";
const require = createRequire(import.meta.url);
const {
  PDFDocument,
} = require("../../runtime/bento-jett/node_modules/pdf-lib");
const directory =
  process.env.BENTO_EVIDENCE_DIR ||
  new URL("../../runtime/bento-ocr-evidence/", import.meta.url).pathname;
await mkdir(directory, { recursive: true });
await mkdir(`${directory}/downloads`, { recursive: true });
const expected = [
  "JETT OCR TEST",
  "Invoice number 2026",
  "Searchable documents stay useful",
];
const browser = await puppeteer.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--no-first-run"],
});
const assets = [],
  errors = [],
  diagnostics = [],
  networkSessions = [];
let page, bento, token;
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
      if (/traineddata|tesseract|\.wasm|font/i.test(r.url))
        assets.push({
          channel: "worker",
          url: r.url,
          status: r.status,
          mimeType: r.mimeType,
          fromDiskCache: r.fromDiskCache,
        });
    });
  } catch (error) {
    errors.push(`Worker network observation: ${error.message}`);
  }
});
try {
  const canvasPage = await browser.newPage();
  const png = await canvasPage.evaluate((lines) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1600;
    canvas.height = 1000;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 1600, 1000);
    ctx.fillStyle = "#111";
    ctx.font = "64px Arial";
    lines.forEach((line, i) => ctx.fillText(line, 100, 200 + 160 * i));
    return canvas.toDataURL("image/png").split(",")[1];
  }, expected);
  await canvasPage.close();
  const pdf = await PDFDocument.create();
  const image = await pdf.embedPng(Buffer.from(png, "base64"));
  const pdfPage = pdf.addPage([800, 500]);
  pdfPage.drawImage(image, { x: 0, y: 0, width: 800, height: 500 });
  const original = Buffer.from(await pdf.save());
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
      else errors.push(message.text());
    }
  });
  bento.on("response", (response) => {
    if (/traineddata|tesseract|\.wasm|font/i.test(response.url()))
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
    else errors.push(`${request.url()}: ${request.failure()?.errorText}`);
  });
  token = new URLSearchParams(new URL(bento.url()).hash.slice(1)).get("jett");
  await bento.waitForSelector("#tool-options:not(.hidden)", { timeout: 45000 });
  await bento.waitForSelector('.lang-checkbox[value="eng"]');
  if (!(await bento.$eval('.lang-checkbox[value="eng"]', (e) => e.checked)))
    await bento.click('.lang-checkbox[value="eng"]');
  await bento.screenshot({
    path: `${directory}/ocr-before.png`,
    fullPage: true,
  });
  const started = Date.now();
  await bento.click("#process-btn");
  await bento.waitForFunction(
    () =>
      !document.getElementById("ocr-results").classList.contains("hidden") ||
      !document.getElementById("alert-modal").classList.contains("hidden"),
    { timeout: 180000 },
  );
  const ui = await bento.evaluate(() => ({
    text: document.getElementById("ocr-text-output").value,
    progress: document.getElementById("progress-log").textContent,
    alert: document.getElementById("alert-message").textContent,
    resultsVisible: !document
      .getElementById("ocr-results")
      .classList.contains("hidden"),
  }));
  await writeFile(
    `${directory}/ocr-engine-observation.json`,
    JSON.stringify(
      { durationMs: Date.now() - started, ui, assets, errors, diagnostics },
      null,
      2,
    ).replaceAll(token, "[redacted]"),
  );
  assert.ok(ui.resultsVisible, `OCR failed: ${ui.alert}`);
  for (const line of expected)
    assert.ok(ui.text.includes(line), `Missing recognized phrase ${line}`);
  await bento.screenshot({
    path: `${directory}/ocr-recognized.png`,
    fullPage: true,
  });
  await bento.click("#download-searchable-pdf");
  await bento.waitForFunction(
    () => document.body.innerText.includes("PDF export ready."),
    { timeout: 30000 },
  );
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
      (asset) =>
        asset.url.includes("/tesseract.js@v7.0.0/dist/worker.min.js") &&
        asset.status === 200,
    ),
    "Actual Tesseract worker download not observed",
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
  await writeFile(
    `${directory}/ocr-proof.json`,
    JSON.stringify(
      {
        result: "PASS_LOCAL_REAL_OCR_UI",
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
        firstUseNetworkDependency:
          "Tesseract worker/core/language data and Noto font downloaded from upstream CDNs; offline cold start is not proven",
        sourceReloadAndResultReopen: true,
        search,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS actual English OCR, searchable PDF export, JETT durable return, independent text readback and unchanged original.",
  );
} catch (error) {
  await writeFile(
    `${directory}/failure.json`,
    JSON.stringify(
      { message: error.message, assets, errors, diagnostics },
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
}
