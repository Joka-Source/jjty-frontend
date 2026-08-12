// Headless proof that jt is a complete application shell, not a single
// screen: every surface exists, is reachable, and interlinks, at phone size
// and at desktop size. First-run appears exactly once; settings changes
// survive a reload; export produces valid JSON of everything; the spaces
// surface really creates and lists org records; no surface overflows
// sideways. Runs WITHOUT ?sim=1 — this is the app as a person meets it.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "path";
import puppeteer from "puppeteer-core";
import { root } from "./validate.mjs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

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

async function bootShell(t, port, viewport) {
  assert.ok(existsSync(CHROME), "Google Chrome required for headless e2e");
  if (!existsSync(path.join(root, "dist", "index.html"))) {
    execFileSync("npx", ["vite", "build"], { cwd: root, stdio: "inherit" });
  }
  const server = spawn(
    "npx",
    ["vite", "preview", "--host", "127.0.0.1", "--port", String(port)],
    { cwd: root, stdio: ["ignore", "pipe", "ignore"] }
  );
  t.after(() => server.kill("SIGTERM"));
  const url = await new Promise((resolve, reject) => {
    let out = "";
    const timer = setTimeout(() => reject(new Error(`vite preview never announced a URL\n${out}`)), 20000);
    server.stdout.on("data", (chunk) => {
      out += String(chunk);
      const m = out.match(/(http:\/\/127\.0\.0\.1:\d+)\//);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    });
    server.on("exit", () => reject(new Error(`vite preview exited early\n${out}`)));
  });
  await waitFor(`${url}/`);

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--disable-gpu", "--no-first-run"],
  });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setViewport(viewport);
  try {
    await page.goto(`${url}/`, { waitUntil: "load" });
  } catch {
    await new Promise((r) => setTimeout(r, 500)); // one honest retry
    await page.goto(`${url}/`, { waitUntil: "load" });
  }
  await page.waitForFunction(() => window.__jtApp?.booted === true, { timeout: 30000 });
  return page;
}

const overflowOf = (page) =>
  page.evaluate(() => ({
    view: document.body.dataset.view,
    innerWidth: window.innerWidth,
    docScroll: document.documentElement.scrollWidth,
    bodyScroll: document.body.scrollWidth,
  }));

async function assertNoOverflow(page) {
  const o = await overflowOf(page);
  assert.ok(o.docScroll <= o.innerWidth, `surface "${o.view}" overflows sideways: ${o.docScroll} > ${o.innerWidth}`);
  assert.ok(o.bodyScroll <= o.innerWidth, `surface "${o.view}" body overflows sideways: ${o.bodyScroll} > ${o.innerWidth}`);
}

async function surfaceVisible(page, v) {
  return page.evaluate((view) => {
    if (view === "read") {
      const layout = document.querySelector(".layout");
      return getComputedStyle(layout).display !== "none";
    }
    const sec = document.getElementById(`view-${view}`);
    return !sec.hidden && sec.getBoundingClientRect().height > 0;
  }, v);
}

test("desktop shell walk: first-run once, every surface, settings persist, export, spaces, delete-all", { timeout: 180000 }, async (t) => {
  const page = await bootShell(t, 4935, { width: 1280, height: 800 });

  // 1. First run: the welcome surface, and only the welcome surface.
  assert.equal(await page.evaluate(() => window.__jtApp.view()), "welcome");
  assert.equal(await surfaceVisible(page, "welcome"), true, "welcome surface not visible on first run");
  await assertNoOverflow(page);
  await page.click("#welcome-next");
  await page.waitForFunction(() => !document.getElementById("welcome-step-2").hidden);
  // the mic question is the one gate; skipping is allowed and remembered
  await page.click("#welcome-skip");
  await page.waitForFunction(() => window.__jtApp.view() === "home", { timeout: 5000 });

  // 2. Reload: first-run appears exactly once — straight to home now.
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => window.__jtApp?.booted && window.__jtApp.view() === "home", { timeout: 30000 });
  assert.equal(await surfaceVisible(page, "welcome"), false, "welcome shown a second time");

  // 3. Home empty state is designed and actionable: the sample opens reading.
  assert.equal(
    await page.evaluate(() => !document.getElementById("home-empty").hidden),
    true,
    "empty home should explain what to do first"
  );
  await page.click("#home-sample");
  await page.waitForFunction(() => window.__jtApp.view() === "read", { timeout: 10000 });
  await page.waitForFunction(() => document.querySelectorAll("#doc p[data-block]").length > 0, { timeout: 10000 });
  const head = await page.evaluate(() => ({
    title: document.getElementById("doc-title").textContent,
    provBtn: !document.getElementById("doc-prov-btn").hidden,
  }));
  assert.ok(head.title.length > 0, "reading surface should name the open document");
  assert.equal(head.provBtn, true, "provenance disclosure missing from reading surface");

  // 4. Every surface is reachable from the header nav and none overflows.
  for (const v of ["history", "share", "spaces", "settings", "rooms", "home", "read"]) {
    await page.click(`.topnav a[data-view-link="${v}"]`);
    await page.waitForFunction((want) => window.__jtApp.view() === want, { timeout: 5000 }, v);
    assert.equal(await surfaceVisible(page, v), true, `surface "${v}" not visible after nav`);
    await assertNoOverflow(page);
  }

  // 5. What-happened surface: a real act shows up with evidence; undo works there.
  await page.evaluate(() => window.__jtApp.perform("highlight", 0));
  await page.click('.topnav a[data-view-link="history"]');
  await page.waitForFunction(() => document.querySelectorAll("#history-all .entry").length >= 1, { timeout: 5000 });
  const before = await page.evaluate(() => window.__jtApp.entries().length);
  await page.click("#history-all .undo-btn");
  await page.waitForFunction(
    (n) => window.__jtApp.entries().length > n,
    { timeout: 5000 },
    before
  );
  await page.waitForFunction(
    () => document.querySelectorAll("#history-all .entry.struck").length >= 1,
    { timeout: 5000 }
  );

  // 6. Spaces: create institution -> space -> member; all listed, no seeds.
  await page.click('.topnav a[data-view-link="spaces"]');
  await page.waitForFunction(() => window.__jtApp.view() === "spaces");
  assert.equal(
    await page.evaluate(() => document.querySelectorAll("#org-tree .org-inst").length),
    0,
    "spaces must start honestly empty — no fake seeded people"
  );
  await page.type("#inst-name", "A Small College");
  await page.click("#form-institution button[type=submit]");
  await page.waitForFunction(() => document.querySelectorAll("#org-tree .org-inst").length === 1);
  await page.select("#space-kind", "class");
  await page.type("#space-name", "CSE-A");
  await page.click("#form-space button[type=submit]");
  await page.waitForFunction(() => document.querySelectorAll("#org-tree .org-space").length === 1);
  await page.type("#member-name", "asha");
  await page.type("#member-roll", "22CSE014");
  await page.click("#form-member button[type=submit]");
  await page.waitForFunction(() =>
    [...document.querySelectorAll("#org-tree .org-members li")].some((li) =>
      li.textContent.includes("asha") && li.textContent.includes("22CSE014")
    )
  );

  // 7. Settings: change language, motion, engine.
  await page.click('.topnav a[data-view-link="settings"]');
  await page.waitForFunction(() => window.__jtApp.view() === "settings");
  await page.select("#set-lang", "en-IN");
  await page.click('#set-motion .choice[data-value="calm"]');
  await page.click('#set-engine .choice[data-value="js"]');

  // 8. Export: one valid JSON file of everything on the device.
  const exported = await page.evaluate(() => window.__jtApp.exportData());
  const data = JSON.parse(exported); // throws if not valid JSON
  assert.equal(data.format, "jt-export");
  assert.ok(data.documents.length >= 1, "export missing documents");
  assert.ok(data.records.length >= 2, "export missing records (act + undo)");
  assert.equal(data.spaces.institutions[0].name, "A Small College");
  assert.equal(data.settings.lang, "en-IN");
  assert.equal(data.settings.motion, "calm");

  // 9. Reload: everything persisted — settings, spaces, engine choice live.
  // The hash deep-link is honored too: we reload while on #/settings.
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => window.__jtApp?.booted === true, { timeout: 30000 });
  assert.equal(
    await page.evaluate(() => window.__jtApp.view()),
    "settings",
    "reloading #/settings should land back on settings — surfaces are real places"
  );
  await page.waitForFunction(() => window.__jtApp.engineKind() === "js", { timeout: 15000 });
  await page.click('.topnav a[data-view-link="settings"]');
  await page.waitForFunction(() => window.__jtApp.view() === "settings");
  const persisted = await page.evaluate(() => ({
    lang: document.getElementById("set-lang").value,
    motion: document.querySelector('#set-motion .choice[aria-checked="true"]').dataset.value,
    engine: document.querySelector('#set-engine .choice[aria-checked="true"]').dataset.value,
  }));
  assert.deepEqual(persisted, { lang: "en-IN", motion: "calm", engine: "js" });
  await page.click('.topnav a[data-view-link="spaces"]');
  await page.waitForFunction(() =>
    [...document.querySelectorAll("#org-tree .org-members li")].some((li) => li.textContent.includes("asha"))
  );

  // 10. The honest room actually translates spoken math on this device.
  await page.click('.topnav a[data-view-link="rooms"]');
  await page.waitForFunction(() => window.__jtApp.view() === "rooms");
  await page.type("#math-input", "one half plus x squared");
  await page.click("#math-try");
  await page.waitForFunction(() => !document.getElementById("math-out").hidden);
  const latex = await page.evaluate(() => document.getElementById("math-out").textContent);
  assert.ok(latex.includes("\\frac{1}{2}"), `expected a real fraction, got: ${latex}`);
  assert.ok(latex.includes("x^{2}"), `expected a real power, got: ${latex}`);

  // 11. Delete-all is real: two presses, then a truly fresh start.
  await page.click('.topnav a[data-view-link="settings"]');
  await page.waitForFunction(() => window.__jtApp.view() === "settings");
  await page.click("#delete-btn"); // arm
  await page.click("#delete-btn"); // confirm
  await page.waitForFunction(() => window.__jtApp?.booted && window.__jtApp.view() === "welcome", { timeout: 30000 });
  assert.equal(
    await page.evaluate(() => localStorage.getItem("jt.org")),
    null,
    "delete-all left org data behind"
  );
});

test("phone shell walk: bottom bar reaches everything, sheets, 44px targets, no overflow anywhere", { timeout: 180000 }, async (t) => {
  const page = await bootShell(t, 4936, {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });

  // First run on a phone: readable, tappable, skippable.
  assert.equal(await page.evaluate(() => window.__jtApp.view()), "welcome");
  await assertNoOverflow(page);
  const welcomeBtns = await page.evaluate(() => ({
    next: document.getElementById("welcome-next").getBoundingClientRect().height,
  }));
  assert.ok(welcomeBtns.next >= 44, `welcome button too small to tap: ${welcomeBtns.next}px`);
  await page.tap("#welcome-next");
  await page.waitForFunction(() => !document.getElementById("welcome-step-2").hidden);
  await page.tap("#welcome-skip");
  await page.waitForFunction(() => window.__jtApp.view() === "home", { timeout: 5000 });

  // The bottom bar is the phone's spine: home + documents + history + more.
  const bar = await page.evaluate(() => {
    const h = (id) => document.getElementById(id).getBoundingClientRect().height;
    return { home: h("tab-home"), lib: h("tab-library"), hist: h("tab-history"), more: h("tab-more") };
  });
  for (const [k, v] of Object.entries(bar)) {
    assert.ok(v >= 44, `bottom bar "${k}" too small to tap: ${v}px`);
  }

  // Open the sample so the reading surface has content.
  await page.tap("#home-sample");
  await page.waitForFunction(() => window.__jtApp.view() === "read", { timeout: 10000 });
  await assertNoOverflow(page);

  // "more" opens a sheet with the remaining surfaces, all thumb-sized.
  await page.tap("#tab-more");
  await page.waitForFunction(() => window.__jtApp.sheet() === "more", { timeout: 3000 });
  const moreLinks = await page.evaluate(() =>
    [...document.querySelectorAll("#more-panel .more-nav a")].map((a) => ({
      href: a.getAttribute("href"),
      h: a.getBoundingClientRect().height,
    }))
  );
  assert.deepEqual(
    moreLinks.map((l) => l.href),
    ["#/share", "#/spaces", "#/settings", "#/rooms"]
  );
  for (const l of moreLinks) assert.ok(l.h >= 44, `more link ${l.href} too small: ${l.h}px`);

  // Tapping a surface in the sheet goes there and closes the sheet.
  // (the sheet slides in over 0.28s — wait until the link itself is what a
  // finger would hit, not the bar still underneath it)
  await page.waitForFunction(
    () => {
      const a = document.querySelector('#more-panel a[href="#/share"]');
      const b = a.getBoundingClientRect();
      const settled = window.__jtLastTop === b.top; // same spot two polls running
      window.__jtLastTop = b.top;
      if (!settled || b.top < 0 || b.bottom > window.innerHeight) return false;
      return document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2) === a;
    },
    { polling: 150 }
  );
  await page.tap('#more-panel a[href="#/share"]');
  await page.waitForFunction(() => window.__jtApp.view() === "share", { timeout: 5000 });
  assert.equal(await page.evaluate(() => window.__jtApp.sheet()), null, "sheet should close after picking a surface");
  await assertNoOverflow(page);

  // Every surface, phone-size, no overflow.
  for (const v of ["spaces", "settings", "rooms", "history", "home", "read"]) {
    await page.evaluate((want) => window.__jtApp.showView(want), v);
    await page.waitForFunction((want) => window.__jtApp.view() === want, { timeout: 5000 }, v);
    assert.equal(await surfaceVisible(page, v), true, `surface "${v}" not visible on phone`);
    await assertNoOverflow(page);
  }

  // From a non-reading surface, "documents" brings the reading back with its sheet.
  await page.evaluate(() => window.__jtApp.showView("home"));
  await page.waitForFunction(() => window.__jtApp.view() === "home");
  await page.tap("#tab-library");
  await page.waitForFunction(
    () => window.__jtApp.view() === "read" && window.__jtApp.sheet() === "library",
    { timeout: 5000 }
  );
  await page.tap("#tab-home");
  await page.waitForFunction(() => window.__jtApp.view() === "home" && window.__jtApp.sheet() === null, {
    timeout: 5000,
  });
});
