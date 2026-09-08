import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";
const base = process.env.BENTO_URL || "http://127.0.0.1:5181";
for (const url of ["http://127.0.0.1:5174/", `${base}/`]) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  assert.ok(
    response.ok,
    `Local application unavailable: ${url} (${response.status})`,
  );
}
const directory =
  process.env.BENTO_EVIDENCE_DIR ||
  new URL("../../runtime/bento-ocr-evidence/multitool-narrow/", import.meta.url)
    .pathname;
await mkdir(directory, { recursive: true });
const source = await readFile(
  new URL(
    "../../runtime/bento-integration-evidence/original.pdf",
    import.meta.url,
  ),
);
const created = await fetch(`${base}/api/jett/handoffs`, {
  method: "POST",
  headers: {
    "Content-Type": "application/pdf",
    "X-JETT-Filename": "synthetic-geometry.pdf",
  },
  body: source,
});
assert.ok(created.ok, `Source handoff failed: ${created.status}`);
const { token } = await created.json();
const browser = await puppeteer.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const evidence = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 360, height: 780 });
  await page.goto(`${base}/pdf-multi-tool.html#jett=${token}`);
  await page.waitForFunction(
    () =>
      document.querySelectorAll('button[title="Duplicate this page"]')
        .length === 2,
    { timeout: 45000 },
  );
  for (const selector of [
    "#add-blank-page-btn",
    "#select-all-btn",
    "#export-pdf-btn",
    "[data-jett-handoff] a",
    "[data-jett-handoff] button:last-child",
  ]) {
    const target = await page.waitForSelector(selector, { visible: true });
    await target.scrollIntoView();
    const geometry = await target.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const x = rect.x + rect.width / 2,
        y = rect.y + rect.height / 2;
      const hit = document.elementFromPoint(x, y);
      return {
        label: element.textContent.trim() || element.title,
        rect: rect.toJSON(),
        x,
        y,
        reachable: hit === element || element.contains(hit),
        hit: hit?.outerHTML.slice(0, 300),
        banner: document
          .querySelector("[data-jett-handoff]")
          .getBoundingClientRect()
          .toJSON(),
      };
    });
    evidence.push({ selector, ...geometry });
    assert.ok(geometry.reachable, `${selector} intercepted`);
    if (selector === "#select-all-btn") {
      await page.mouse.click(geometry.x, geometry.y);
      await page.waitForFunction(
        () => !document.querySelector("#bulk-duplicate-btn").disabled,
      );
    }
    if (selector === "[data-jett-handoff] a") {
      const opened = browser.waitForTarget(
        (target) =>
          target.opener() === page.target() &&
          target.url().startsWith("http://127.0.0.1:5174/"),
      );
      await page.mouse.click(geometry.x, geometry.y);
      const returned = await (await opened).page();
      await returned
        .waitForFunction(() => window.__jtApp?.booted, { timeout: 10000 })
        .catch(async (error) => {
          await writeFile(
            `${directory}/return-popup-failure.txt`,
            await returned.content(),
          );
          throw error;
        });
      await returned.close();
    }
    if (selector === "[data-jett-handoff] button:last-child") {
      await page.mouse.click(geometry.x, geometry.y);
      await page.waitForFunction(() =>
        document
          .querySelector("[data-jett-handoff]")
          .textContent.includes("Disconnected."),
      );
    }
  }
  await page.screenshot({ path: `${directory}/multitool-narrow.png` });
  await writeFile(
    `${directory}/proof.json`,
    JSON.stringify(
      {
        result: "PASS_NARROW_MULTITOOL_POINTER_REACHABILITY",
        viewport: { width: 360, height: 780 },
        evidence,
        actualActions: [
          "Select all",
          "Return to JETT opens application",
          "Disconnect",
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS narrow MultiTool controls and handoff return/disconnect actual pointer actions",
  );
} catch (error) {
  await writeFile(
    `${directory}/failure.json`,
    JSON.stringify({ error: error.message, evidence }, null, 2),
  );
  for (const page of await browser.pages())
    if (page.url().includes("pdf-multi-tool"))
      await page.screenshot({ path: `${directory}/failure.png` });
  throw error;
} finally {
  await browser.close();
  await fetch(`${base}/api/jett/handoffs/${token}`, { method: "DELETE" });
}
