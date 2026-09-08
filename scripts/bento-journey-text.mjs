// Existing text replacement only: this fixture substitutes the original heading font.
// Exact original-font metrics are intentionally not claimed by this journey.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import puppeteer from "puppeteer-core";
const directory =
  process.env.BENTO_EVIDENCE_DIR ||
  new URL("../../runtime/bento-text-evidence/", import.meta.url).pathname;
await mkdir(directory, { recursive: true });
const fixture = new URL("../test/fixtures/jett-fillable.pdf", import.meta.url)
    .pathname,
  original = await readFile(fixture);
const browser = await puppeteer.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--no-first-run"],
});
let token, bento;
try {
  const page = await browser.newPage();
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
  await page.select("#bento-tool", "text");
  await page.click("#bento-original");
  const target = await browser.waitForTarget((t) =>
    t.url().includes("5181/edit-pdf-text.html#jett="),
  );
  bento = await target.page();
  await bento.setViewport({ width: 1440, height: 1000 });
  token = new URLSearchParams(new URL(bento.url()).hash.slice(1)).get("jett");
  const session = await bento.createCDPSession();
  await session.send("Browser.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: directory,
  });
  const errors = [];
  bento.on("pageerror", (e) => errors.push(e.message));
  await bento.waitForSelector("#save:not([disabled])", { timeout: 30000 });
  await bento.click("#find");
  await bento.waitForSelector("#findText", { visible: true });
  await bento.type("#findText", "Synthetic JETT form");
  await bento.type("#replText", "Edited Bento heading");
  await bento.click("#replAll");
  await bento.waitForFunction(
    () => document.getElementById("findStatus").textContent === "Replaced 2",
    { timeout: 10000 },
  );
  await bento.screenshot({
    path: `${directory}/text-replaced.png`,
    fullPage: true,
  });
  await bento.click("#save");
  await bento.waitForFunction(
    () => document.body.innerText.includes("PDF export ready."),
    { timeout: 30000 },
  );
  await page.bringToFront();
  await page.reload();
  await page.waitForFunction(() => window.__jtApp?.booted);
  assert.equal(await page.$eval("#bento-tool", (el) => el.value), "text");
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
      text: d.text,
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
  assert.ok(!returned.text.includes("Synthetic JETT form"));
  assert.equal(returned.text.split("Edited Bento heading").length - 1, 2);
  await writeFile(
    `${directory}/text-returned.pdf`,
    Buffer.from(returned.bytes),
  );
  await page.goto("http://127.0.0.1:5174/#/home");
  await page.waitForSelector("#home-doc-list button");
  const buttons = await page.$$("#home-doc-list button");
  for (const button of buttons) {
    if ((await button.evaluate((el) => el.textContent)) === returned.title) {
      await button.click();
      break;
    }
  }
  await page.waitForFunction(
    (id) => window.__jtApp.currentDoc()?.id === id,
    {},
    returned.id,
  );
  await page.waitForFunction(
    () => document.querySelector(".pdf-page canvas")?.width > 0,
  );
  await page.screenshot({
    path: `${directory}/text-reopened.png`,
    fullPage: true,
  });
  await writeFile(
    `${directory}/text-proof.json`,
    JSON.stringify(
      {
        result: "PASS_LOCAL_UI",
        action: {
          kind: "existing text replacement",
          before: "Synthetic JETT form",
          after: "Edited Bento heading",
          replacements: 2,
        },
        sourcePreserved: true,
        pendingToolRestored: true,
        reloadReopened: true,
        pages: returned.provenance.pageCount,
        resultSHA256: createHash("sha256")
          .update(Buffer.from(returned.bytes))
          .digest("hex"),
        provenance: returned.provenance,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS actual existing text replacement in Bento, exported text absent original heading, two replacement headings, JETT source preserved and return reopened. Independent PDF audit still required.",
  );
} catch (error) {
  if (bento) {
    await bento
      .screenshot({ path: `${directory}/text-failure.png`, fullPage: true })
      .catch(() => {});
    await writeFile(
      `${directory}/text-failure.txt`,
      await bento.evaluate(() => document.body.innerText).catch(() => ""),
    );
  }
  throw error;
} finally {
  if (token)
    await fetch(`http://127.0.0.1:5181/api/jett/handoffs/${token}`, {
      method: "DELETE",
      headers: { Origin: "http://127.0.0.1:5174" },
    }).catch(() => {});
  await browser.close();
}
