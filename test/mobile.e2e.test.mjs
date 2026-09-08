// Headless proof that jt is genuinely phone-first. The same built app is
// loaded at a phone viewport (375x812, touch) and at the desktop viewport
// (1280x800). At phone size: the document is full width with no horizontal
// overflow, secondary panels are drawers reached through More,
// touch targets are at least 44px, and the ambiguity prompt can be answered
// with a tap. Desktop also prioritizes the document and keeps drawers optional.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { root } from "./validate.mjs";

const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

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

/** Build (if needed), serve dist/, open a page at `viewport`, run the sim to
 * completion, and hand the page back. */
async function bootSim(t, port, viewport) {
  assert.ok(existsSync(CHROME), "Google Chrome required for headless e2e");
  if (!existsSync(path.join(root, "dist", "index.html"))) {
    execFileSync("npx", ["vite", "build"], { cwd: root, stdio: "inherit" });
  }
  const server = spawn(
    process.execPath,
    [path.join(root, "node_modules", "vite", "bin", "vite.js"), "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    { cwd: root, stdio: "ignore" }
  );
  t.after(() => server.kill("SIGTERM"));
  const url = `http://127.0.0.1:${port}`;
  await waitFor(`${url}/`);

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--disable-gpu", "--no-first-run", "--no-sandbox", "--disable-setuid-sandbox"],
  });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setViewport(viewport);
  try {
    await page.goto(`${url}/?sim=1&fast=1`, { waitUntil: "load" });
  } catch {
    await new Promise((r) => setTimeout(r, 500)); // one honest retry
    await page.goto(`${url}/?sim=1&fast=1`, { waitUntil: "load" });
  }
  await page.waitForSelector("#jt-report", { timeout: 60000 });
  return page;
}

const noHorizontalOverflow = (page) =>
  page.evaluate(() => ({
    innerWidth: window.innerWidth,
    docScroll: document.documentElement.scrollWidth,
    bodyScroll: document.body.scrollWidth,
    scrollX: Math.round(window.scrollX),
  }));

const visibleTargetGeometry = (page) =>
  page.evaluate(() => {
    const marker = document.getElementById("marker");
    const marked = document.querySelector("mark.jt-highlight");
    const block = marked?.closest("p[data-block]") ?? null;
    const box = (node) => {
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        width: rect.width,
        height: rect.height,
        opacity: Number.parseFloat(style.opacity),
        display: style.display,
      };
    };
    return { marker: box(marker), marked: box(marked), block: box(block) };
  });

function assertVisibleExactTarget(geometry, viewport) {
  assert.ok(geometry.marker, `${viewport}: water guide missing`);
  assert.ok(geometry.marker.height > 0, `${viewport}: water guide has zero height`);
  assert.ok(geometry.marker.opacity > 0, `${viewport}: water guide is transparent`);
  assert.ok(geometry.marked, `${viewport}: exact inline highlight missing`);
  assert.ok(geometry.marked.height > 0, `${viewport}: inline highlight has zero height`);
  assert.ok(geometry.marked.opacity > 0, `${viewport}: inline highlight is transparent`);
  assert.ok(
    geometry.marked.width < geometry.block.width,
    `${viewport}: mid-block phrase was painted as the whole paragraph`,
  );
}

test("phone viewport: full-width document, sheet panels, 44px targets, no sideways scroll", { timeout: 120000 }, async (t) => {
  const page = await bootSim(t, 4933, {
    width: 375,
    height: 812,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });

  const simState = await page.evaluate(() => ({
    reportPresent: !!document.getElementById("jt-report"),
    entryCount: window.__jtApp.entries().length,
    harnessFlag: window.__jtHarness ?? null,
    done: window.__jt?.done,
    error: window.__jt?.report?.error,
  }));
  assert.equal(simState.reportPresent, true, "ordinary 375px sim emitted no report");
  assert.equal(simState.entryCount, 4, "ordinary 375px sim did not finish all scripted records");
  assert.equal(simState.harnessFlag, null, "sim depended on a test-harness runtime flag");
  assert.equal(simState.done, true, `ordinary 375px sim stopped early: ${simState.error}`);
  const phoneGeometry = await visibleTargetGeometry(page);
  assertVisibleExactTarget(phoneGeometry, "375px");
  t.diagnostic(`FIX-FLAGSHIP 375px geometry ${JSON.stringify(phoneGeometry)}`);
  if (process.env.JT_SCREENSHOT_DIR) {
    await page.$eval("mark.jt-highlight", (node) => node.scrollIntoView({ block: "center" }));
    await new Promise((resolve) => setTimeout(resolve, 100));
    await page.screenshot({
      path: path.join(process.env.JT_SCREENSHOT_DIR, "jt-fix-flagship-375.png"),
    });
  }

  // 1. No horizontal overflow anywhere.
  const o = await noHorizontalOverflow(page);
  assert.ok(o.docScroll <= o.innerWidth, `document overflows sideways: ${o.docScroll} > ${o.innerWidth}`);
  assert.ok(o.bodyScroll <= o.innerWidth, `body overflows sideways: ${o.bodyScroll} > ${o.innerWidth}`);

  // The document column and the reading marker stay inside the viewport.
  const rects = await page.evaluate(() => {
    const r = (el) => {
      const b = el.getBoundingClientRect();
      return { left: b.left, right: b.right, width: b.width, height: b.height };
    };
    return {
      article: r(document.getElementById("doc")),
      marker: r(document.getElementById("marker")),
      vw: window.innerWidth,
    };
  });
  assert.ok(rects.article.left >= 0 && rects.article.right <= rects.vw + 0.5, "article sticks out of the viewport");
  assert.ok(rects.marker.left >= 0 && rects.marker.right <= rects.vw + 0.5, "marker sticks out of the viewport");
  assert.ok(rects.article.width >= rects.vw * 0.9, "document is not full width on a phone");

  // 2. Compact navigation is visible, with thumb-sized entry points.
  const bar = await page.evaluate(() => {
    const visible = (el) => {
      const b = el.getBoundingClientRect();
      return b.width > 0 && b.height > 0 && getComputedStyle(el).display !== "none";
    };
    const h = (el) => el.getBoundingClientRect().height;
    return {
      barVisible: visible(document.getElementById("tabbar")),
      libraryH: h(document.querySelector('[data-view-link="home"]')),
      moreH: h(document.getElementById("tab-more")),
    };
  });
  assert.equal(bar.barVisible, true, "compact navigation not visible on phone");
  assert.ok(bar.libraryH >= 44, `Library link too small to tap: ${bar.libraryH}px`);
  assert.ok(bar.moreH >= 44, `More button too small to tap: ${bar.moreH}px`);

  // 3. Panels start closed — nothing overlaps the document.
  const closed = await page.evaluate(() => {
    const off = (el) => {
      const b = el.getBoundingClientRect();
      return getComputedStyle(el).visibility === "hidden" || b.top >= window.innerHeight;
    };
    return {
      sheet: window.__jtApp.sheet(),
      library: off(document.getElementById("library-panel")),
      history: off(document.getElementById("history-panel")),
    };
  });
  assert.equal(closed.sheet, null, "a sheet is open at load");
  assert.equal(closed.library, true, "library panel overlaps the document at load");
  assert.equal(closed.history, true, "history panel overlaps the document at load");

  // 4. Library sheet opens with a tap, sits inside the viewport, closes on the scrim.
  await page.locator("#tab-more").click();
  await page.waitForFunction(() => window.__jtApp.sheet() === "more");
  await page.locator("#tab-library").click();
  await page.waitForFunction(() => window.__jtApp.sheet() === "library", { timeout: 3000 });
  // the sheet slides in (0.28s of water-calm motion) — wait for it to arrive
  await page.waitForFunction(
    () => {
      const b = document.getElementById("library-panel").getBoundingClientRect();
      return b.top >= 0 && b.top < window.innerHeight && b.right <= innerWidth + 0.5;
    },
    { timeout: 3000 }
  );
  const lib = await page.evaluate(() => {
    const p = document.getElementById("library-panel");
    const b = p.getBoundingClientRect();
    const doc = p.querySelector(".doc-btn");
    return {
      visible: getComputedStyle(p).visibility === "visible",
      top: b.top,
      bottom: b.bottom,
      left: b.left,
      right: b.right,
      vw: window.innerWidth,
      vh: window.innerHeight,
      docBtnH: doc ? doc.getBoundingClientRect().height : 0,
      expanded: document.getElementById("tab-library").getAttribute("aria-expanded"),
    };
  });
  assert.equal(lib.visible, true, "library sheet did not open");
  assert.ok(lib.top >= 0 && lib.top < lib.vh, "library sheet not on screen");
  assert.ok(lib.left >= 0 && lib.right <= lib.vw + 0.5, "library sheet overflows sideways");
  assert.ok(lib.docBtnH >= 44, `document row too small to tap: ${lib.docBtnH}px`);
  assert.equal(lib.expanded, "true");
  await page.touchscreen.tap(195, 20); // the scrim covers the inactive app bar
  await page.waitForFunction(() => window.__jtApp.sheet() === null, { timeout: 3000 });

  // 5. History sheet: opens, shows the sim's records, undo is tappable, closes.
  await page.locator("#tab-more").click();
  await page.waitForFunction(() => window.__jtApp.sheet() === "more");
  await page.locator("#tab-history").click();
  await page.waitForFunction(() => window.__jtApp.sheet() === "history" && getComputedStyle(document.getElementById("history-panel")).visibility === "visible", { timeout: 3000 });
  const hist = await page.evaluate(() => {
    const p = document.getElementById("history-panel");
    const undo = p.querySelector(".undo-btn");
    return {
      visible: getComputedStyle(p).visibility === "visible",
      entries: p.querySelectorAll(".entry").length,
      undoH: undo ? undo.getBoundingClientRect().height : 0,
    };
  });
  assert.equal(hist.visible, true, "history sheet did not open");
  assert.ok(hist.entries >= 4, `expected the sim's 4 records, saw ${hist.entries}`);
  assert.ok(hist.undoH >= 44, `undo button too small to tap: ${hist.undoH}px`);
  await page.locator("#history-panel .reader-drawer-close").click();
  await page.waitForFunction(() => window.__jtApp.sheet() === null, { timeout: 3000 });

  // 6. The ambiguity prompt is on screen and answerable with a thumb.
  await page.$eval("#ask",node=>node.scrollIntoView({block:"center",behavior:"instant"}));
  await page.waitForFunction(()=>{const option=document.querySelector('#ask .ask-option[data-candidate="0"]');const r=option.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===option||option.contains(hit);});
  const ask = await page.evaluate(() => {
    const box = document.getElementById("ask");
    const b = box.getBoundingClientRect();
    const opt = box.querySelector('.ask-option[data-candidate="0"]');
    return {
      hidden: box.hidden,
      onScreen: b.top >= 0 && b.left >= 0 && b.right <= window.innerWidth + 0.5,
      optH: opt ? opt.getBoundingClientRect().height : 0,
    };
  });
  assert.equal(ask.hidden, false, "did-you-mean prompt not visible on phone");
  assert.equal(ask.onScreen, true, "did-you-mean prompt off screen");
  assert.ok(ask.optH >= 44, `ask option too small to tap: ${ask.optH}px`);
  const before = await page.evaluate(() => window.__jtApp.entries().length);
  await page.tap('#ask .ask-option[data-candidate="0"]');
  await page.waitForFunction(()=>!window.__jtApp.ask());
  assert.equal(await page.evaluate(()=>window.__jtApp.entries().length),before,'a missing endpoint must not become a guessed range');
  await page.evaluate(()=>window.__jtApp.voiceSegment('highlight from rent is due to the final inspection'));
  await page.waitForFunction(
    (n) => window.__jtApp.entries().length > n,
    { timeout: 5000 },
    before
  );
  const resolved = await page.evaluate(() => {
    const es = window.__jtApp.entries();
    const e = es[es.length - 1];
    return { act: e.act, blockIndex: e.blockIndex, blockEnd: e.blockEnd, askGone: !window.__jtApp.ask() };
  });
  assert.equal(resolved.act, "highlight");
  assert.equal(resolved.blockIndex, 3);
  assert.equal(resolved.blockEnd, 4);
  assert.equal(resolved.askGone, true, "ask should clear after a tap");
});

test("desktop viewport: document-focused layout, optional drawers, no sideways scroll", { timeout: 120000 }, async (t) => {
  const page = await bootSim(t, 4934, { width: 1280, height: 800 });

  const desktopGeometry = await visibleTargetGeometry(page);
  assertVisibleExactTarget(desktopGeometry, "1280px");
  t.diagnostic(`FIX-FLAGSHIP 1280px geometry ${JSON.stringify(desktopGeometry)}`);
  if (process.env.JT_SCREENSHOT_DIR) {
    await page.$eval("mark.jt-highlight", (node) => node.scrollIntoView({ block: "center" }));
    await new Promise((resolve) => setTimeout(resolve, 100));
    await page.screenshot({
      path: path.join(process.env.JT_SCREENSHOT_DIR, "jt-fix-flagship-1280.png"),
    });
  }

  const o = await noHorizontalOverflow(page);
  assert.ok(o.docScroll <= o.innerWidth, `document overflows sideways: ${o.docScroll} > ${o.innerWidth}`);

  const desk = await page.evaluate(() => {
    const lib = document.getElementById("library-panel");
    const hist = document.getElementById("history-panel");
    const libBox = lib.getBoundingClientRect();
    const histBox = hist.getBoundingClientRect();
    const art = document.getElementById("doc").getBoundingClientRect();
    return {
      barDisplay: getComputedStyle(document.getElementById("tabbar")).display,
      scrimVisible: getComputedStyle(document.getElementById("sheet-scrim")).display !== "none",
      libPosition: getComputedStyle(lib).position,
      histPosition: getComputedStyle(hist).position,
      columns: libBox.right <= art.left + 1 && art.right <= histBox.left + 1,
      libVisible: libBox.width > 0 && getComputedStyle(lib).visibility === "visible",
      histVisible: histBox.width > 0 && getComputedStyle(hist).visibility === "visible",
    };
  });
  assert.notEqual(desk.barDisplay, "none", "compact app actions should be available on desktop");
  assert.equal(desk.scrimVisible, false, "closed drawers must not cover the reader");
  assert.equal(desk.libPosition, "fixed", "documents should be an optional drawer");
  assert.equal(desk.histPosition, "fixed", "activity should be an optional drawer");
  assert.equal(desk.libVisible, false, "documents must not consume a permanent column");
  assert.equal(desk.histVisible, false, "activity must not consume a permanent column");
  await page.locator("#tab-more").click();
  await page.locator("#tab-history").click();
  await page.waitForFunction(() => window.__jtApp.sheet() === "history");
  await page.waitForFunction(()=>getComputedStyle(document.getElementById("history-panel")).visibility === "visible");
  assert.equal(await page.$eval("#history-panel", el => getComputedStyle(el).visibility), "visible");
  assert.ok(await page.$$eval("#history-panel .entry", entries => entries.length >= 4));
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__jtApp.sheet() === null);
});
