import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import puppeteer from "puppeteer-core";
const tool = process.env.BENTO_TOOL || "forms";
const initialTool = tool === "forms-sign" ? "forms" : tool;
const directory =
  process.env.BENTO_EVIDENCE_DIR ||
  new URL("../../runtime/bento-edit-evidence/", import.meta.url).pathname;
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
let token;
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
  await page.select("#bento-tool", initialTool);
  await page.click("#bento-original");
  const routes = { forms: "form-filler", sign: "sign-pdf", edit: "edit-pdf" };
  const target = await browser.waitForTarget((t) =>
    t.url().includes(`5181/${routes[initialTool]}.html#jett=`),
  );
  const bento = await target.page();
  const session = await bento.createCDPSession();
  await session.send("Browser.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: directory,
  });
  await bento.setViewport({ width: 1440, height: 1000 });
  token = new URLSearchParams(new URL(bento.url()).hash.slice(1)).get("jett");
  const errors = [];
  bento.on("pageerror", (e) => errors.push(e.message));
  let action;
  if (initialTool === "forms" || initialTool === "sign") {
    await bento.waitForSelector(
      "#pdf-viewer-container iframe, #canvas-container-sign iframe",
      { timeout: 30000 },
    );
    const frame = await (await bento.$("iframe")).contentFrame();
    await frame.waitForSelector('input[name="full_name"]', { timeout: 30000 });
    if (initialTool === "forms") {
      await frame.type('input[name="full_name"]', "Bento Synthetic Test");
      await frame.click('input[name="reference"]');
      for (let i = 0; i < 30; i++) await bento.keyboard.press("ArrowRight");
      for (let i = 0; i < 30; i++) await bento.keyboard.press("Backspace");
      await frame.type('input[name="reference"]', "BENTO-RETURN-2026");
      await frame.select('select[name="category"]', "Research");
      await frame.click('input[name="consent"]');
      await frame.type(
        'textarea[name="notes"]',
        "Filled through actual Bento UI.",
      );
      await frame.click('input[name="full_name"]');
      assert.deepEqual(
        await frame.$$eval('input[name="reference"]', (els) =>
          els.map((el) => el.value),
        ),
        ["BENTO-RETURN-2026", "BENTO-RETURN-2026"],
      );
      action = {
        full_name: "Bento Synthetic Test",
        reference: "BENTO-RETURN-2026",
        category: "Research",
        consent: true,
        notes: "Filled through actual Bento UI.",
      };
    } else {
      await frame.click("#editorSignatureButton");
      await frame.click("#editorSignatureAddSignature");
      await frame.waitForSelector("#addSignatureDialog[open]");
      await frame.type("#addSignatureTypeInput", "Synthetic Test");
      await frame.waitForSelector("#addSignatureAddButton:not([disabled])");
      await bento.screenshot({
        path: `${directory}/sign-dialog.png`,
        fullPage: true,
      });
      await frame.focus("#addSignatureAddButton");
      await bento.keyboard.press("Enter");
      await frame.waitForSelector(".signatureEditor", { timeout: 15000 });
      action = {
        kind: "typed visual signature",
        text: "Synthetic Test",
        certificateSignature: false,
      };
    }
    await bento.screenshot({
      path: `${directory}/${tool}-modified.png`,
      fullPage: true,
    });
    await bento.click("#process-btn");
  } else {
    await bento.waitForFunction(() =>
      document
        .querySelector("embedpdf-container")
        ?.shadowRoot?.querySelector('img[src^="blob:"]'),
    );
    const button = async (label) =>
      (
        await bento.evaluateHandle(
          (label) =>
            document
              .querySelector("embedpdf-container")
              .shadowRoot.querySelector(`button[aria-label="${label}"]`),
          label,
        )
      ).asElement();
    const annotate = await bento.evaluateHandle(() =>
      [
        ...document
          .querySelector("embedpdf-container")
          .shadowRoot.querySelectorAll("button"),
      ].find((b) => b.textContent === "Annotate"),
    );
    await annotate.asElement().click();
    await (await button("Text")).click();
    const canvas = (
      await bento.evaluateHandle(() =>
        document
          .querySelector("embedpdf-container")
          .shadowRoot.querySelector('img[src^="blob:"]'),
      )
    ).asElement();
    await canvas.scrollIntoView();
    const box = await canvas.boundingBox();
    await bento.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.55);
    await bento.waitForFunction(() =>
      document
        .querySelector("embedpdf-container")
        .shadowRoot.querySelector('[contenteditable="true"],textarea'),
    );
    const editor = (
      await bento.evaluateHandle(() =>
        document
          .querySelector("embedpdf-container")
          .shadowRoot.querySelector('[contenteditable="true"],textarea'),
      )
    ).asElement();
    await editor.focus();
    await bento.keyboard.type("Bento added text");
    await bento.keyboard.press("Escape");
    action = { kind: "added text annotation", text: "Bento added text" };
    await bento.screenshot({
      path: `${directory}/edit-modified.png`,
      fullPage: true,
    });
    await bento.click("#download-edited-pdf");
  }
  await bento.waitForFunction(
    () => document.body.innerText.includes("PDF export ready."),
    { timeout: 30000 },
  );
  if (tool === "forms-sign") {
    await Promise.all([
      bento.waitForNavigation(),
      bento.click("#back-to-tools"),
    ]);
    await bento.waitForSelector('a[href*="sign-pdf.html"]');
    const links = await bento.$$('a[href*="sign-pdf.html"]');
    for (const link of links) {
      if (!(await link.evaluate((el) => el.href)).includes("digital-")) {
        await Promise.all([bento.waitForNavigation(), link.click()]);
        break;
      }
    }
    await bento.waitForSelector("#canvas-container-sign iframe");
    const frame = await (await bento.$("iframe")).contentFrame();
    await frame.waitForSelector('input[name="full_name"]');
    assert.equal(
      await frame.$eval('input[name="full_name"]', (el) => el.value),
      "Bento Synthetic Test",
    );
    assert.deepEqual(
      await frame.$$eval('input[name="reference"]', (els) =>
        els.map((el) => el.value),
      ),
      ["BENTO-RETURN-2026", "BENTO-RETURN-2026"],
    );
    await frame.click("#editorSignatureButton");
    await frame.click("#editorSignatureAddSignature");
    await frame.waitForSelector("#addSignatureDialog[open]");
    await frame.type("#addSignatureTypeInput", "Synthetic Chain");
    await frame.waitForSelector("#addSignatureAddButton:not([disabled])");
    await frame.focus("#addSignatureAddButton");
    await bento.keyboard.press("Enter");
    await frame.waitForSelector(".signatureEditor");
    action = {
      ...action,
      signature: "Synthetic Chain",
      inheritedLatestExport: true,
    };
    await bento.screenshot({
      path: `${directory}/forms-sign-modified.png`,
      fullPage: true,
    });
    await bento.click("#process-btn");
    await bento.waitForFunction(
      () => document.body.innerText.includes("PDF export ready."),
      { timeout: 30000 },
    );
  }
  await page.bringToFront();
  await page.reload();
  await page.waitForFunction(() => window.__jtApp?.booted);
  assert.equal(await page.$eval("#bento-tool", (el) => el.value), initialTool);
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
  await writeFile(
    `${directory}/${tool}-returned.pdf`,
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
    () => document.querySelector(".pdf-page canvas")?.width > 0,
  );
  await page.screenshot({
    path: `${directory}/${tool}-reopened.png`,
    fullPage: true,
  });
  await writeFile(
    `${directory}/${tool}-proof.json`,
    JSON.stringify(
      {
        result: "PASS_LOCAL_UI",
        tool,
        action,
        sourcePreserved: true,
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
    `PASS ${tool} real UI modification, export, JETT return, reload/reopen. Independent PDF fidelity readback still required.`,
  );
} finally {
  if (token)
    await fetch(`http://127.0.0.1:5181/api/jett/handoffs/${token}`, {
      method: "DELETE",
      headers: { Origin: "http://127.0.0.1:5174" },
    }).catch(() => {});
  await browser.close();
}
