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

async function bootShell(t, port, viewport) {
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
  await page.locator("#welcome-next").click();
  await page.waitForFunction(() => !document.getElementById("welcome-step-2").hidden);
  // the mic question is the one gate; skipping is allowed and remembered
  await page.locator("#welcome-skip").click();
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
  await page.locator("#home-sample").click();
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
  await page.locator("#history-all .undo-btn").click();
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
  await page.locator("#form-institution button[type=submit]").click();
  await page.waitForFunction(() => document.querySelectorAll("#org-tree .org-inst").length === 1);
  await page.select("#space-kind", "class");
  await page.type("#space-name", "CSE-A");
  await page.locator("#form-space button[type=submit]").click();
  await page.waitForFunction(() => document.querySelectorAll("#org-tree .org-space").length === 1);
  await page.type("#member-name", "asha");
  await page.type("#member-roll", "22CSE014");
  await page.locator("#form-member button[type=submit]").click();
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
  await page.locator("#math-try").click();
  await page.waitForFunction(() => !document.getElementById("math-out").hidden);
  const latex = await page.evaluate(() => document.getElementById("math-out").textContent);
  assert.ok(latex.includes("\\frac{1}{2}"), `expected a real fraction, got: ${latex}`);
  assert.ok(latex.includes("x^{2}"), `expected a real power, got: ${latex}`);

  // 11. Delete-all is real: two presses, then a truly fresh start.
  await page.click('.topnav a[data-view-link="settings"]');
  await page.waitForFunction(() => window.__jtApp.view() === "settings");
  await page.locator("#delete-btn").click(); // arm
  await page.locator("#delete-btn").click(); // confirm
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
    ["#/share", "#/spaces", "#/settings", "#/capabilities", "#/rooms"]
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

test('empty library accepts pasted text; search and saved work survive return', { timeout: 60000 }, async t => {
  const page = await bootShell(t, 4937, { width: 1440, height: 1000 });
  await page.locator('#welcome-next').click();
  await page.locator('#welcome-skip').click();
  // An available install must not intercept the user's document action.
  await page.evaluate(() => { document.getElementById('install-hint').hidden = false; });
  await page.type('#home-paste-box', 'Field notes\n\nThe alumni gathering is on Saturday.');
  await page.locator('#home-paste-add').click();
  await page.waitForFunction(() => document.body.dataset.view === 'read');
  await page.goto(`${page.url().split('#')[0]}#/home`);
  await page.waitForSelector('.home-doc');
  await page.type('#home-search', 'alumni');
  await page.waitForFunction(() => document.getElementById('home-result-count').textContent === '1 document');
  assert.equal(await page.$$eval('.home-doc', rows => rows.length), 1);
  await page.click('#home-search', { clickCount: 3 });
  await page.type('#home-search', 'unfindable-phrase');
  await page.waitForFunction(() => !document.getElementById('home-no-results').hidden);
  assert.equal(await page.$$eval('.home-doc', rows => rows.length), 0);
  await page.reload();
  await page.waitForSelector('.home-doc');
  await page.locator('.home-doc .doc-btn').click();
  await page.waitForFunction(() => document.body.dataset.view === 'read');
  assert.match(await page.$eval('#doc', el => el.textContent), /alumni gathering/);
  await assertNoOverflow(page);
});

test('Markdown renders structure and downloads the exact original after reload', { timeout: 60000 }, async t => {
  const { mkdtemp, writeFile, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const dir = await mkdtemp(path.join(tmpdir(), 'jett-markdown-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const input = path.join(dir, 'notes.md');
  const source = '\uFEFF# Field notes\r\n\r\n> Keep the original.\r\n\r\n```js\r\nconst answer = 42;\r\n```\r\n';
  await writeFile(input, source);
  const page = await bootShell(t, 4938, { width: 1280, height: 900 });
  await page.locator('#welcome-next').click(); await page.locator('#welcome-skip').click();
  await (await page.$('#home-file-input')).uploadFile(input);
  await page.waitForSelector('#doc h1[data-block]', { visible: true });
  assert.equal(await page.$eval('#doc h1', el => el.textContent), 'Field notes');
  assert.equal(await page.$eval('#doc blockquote', el => el.textContent), 'Keep the original.');
  assert.match(await page.$eval('#doc pre', el => el.textContent), /const answer = 42/);
  await page.reload(); await page.waitForSelector('#doc h1[data-block]', { visible: true });
  const output = path.join(dir, 'download');
  const { mkdir } = await import('node:fs/promises'); await mkdir(output);
  const session = await page.createCDPSession();
  await session.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: output });
  await page.locator('#download-original').click();
  const downloaded = path.join(output, 'notes.md');
  const deadline = Date.now() + 5000;
  while (!existsSync(downloaded) && Date.now() < deadline) await new Promise(r => setTimeout(r, 100));
  assert.deepEqual(await readFile(downloaded), await readFile(input));
});

test('failed local save retains the draft and retry creates one document', { timeout: 60000 }, async t => {
  const page = await bootShell(t, 4939, { width: 1280, height: 900 });
  await page.locator('#welcome-next').click(); await page.locator('#welcome-skip').click();
  await page.type('#home-paste-box', 'Keep this thought even when storage fails.');
  await page.evaluate(() => {
    window.originalJettPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...args) {
      if (this.name === 'docs') throw new DOMException('Synthetic storage failure', 'QuotaExceededError');
      return window.originalJettPut.apply(this, args);
    };
  });
  await page.locator('#home-paste-add').click();
  await page.waitForFunction(() => document.getElementById('home-intake-state').textContent.includes('Your text is still here'));
  assert.equal(await page.$eval('#home-paste-box', el => el.value), 'Keep this thought even when storage fails.');
  await page.evaluate(() => { IDBObjectStore.prototype.put = window.originalJettPut; });
  await page.locator('#home-paste-add').click();
  await page.waitForFunction(() => document.body.dataset.view === 'read');
  const exported = JSON.parse(await page.evaluate(() => window.__jtApp.exportData()));
  assert.equal(exported.documents.length, 1);
});

test('reader failure after persistence reports saved and allows reopening without duplicate import', { timeout: 60000 }, async t => {
  const page = await bootShell(t, 4944, { width: 1280, height: 900 });
  await page.locator('#welcome-next').click(); await page.locator('#welcome-skip').click();
  await page.type('#home-paste-box', 'A saved thought survives a reader error.');
  await page.evaluate(() => {
    const original = Node.prototype.appendChild;
    Node.prototype.appendChild = function(child) {
      if (this.id === 'doc') {
        Node.prototype.appendChild = original;
        throw new Error('Synthetic reader failure');
      }
      return original.call(this, child);
    };
  });
  await page.locator('#home-paste-add').click();
  await page.waitForFunction(() => document.getElementById('status-text').textContent.includes('Saved “'));
  const exported = JSON.parse(await page.evaluate(() => window.__jtApp.exportData()));
  assert.equal(exported.documents.length, 1);
  await page.waitForSelector('.home-doc .doc-btn');
  await page.locator('.home-doc .doc-btn').click();
  await page.waitForFunction(() => document.body.dataset.view === 'read');
  assert.match(await page.$eval('#doc', el => el.textContent), /survives a reader error/);
});

test('reading-panel paste survives storage failure and preserves original text on retry', { timeout: 60000 }, async t => {
  const page = await bootShell(t, 4945, { width: 1440, height: 1000 });
  await page.locator('#welcome-next').click(); await page.locator('#welcome-skip').click();
  await page.waitForSelector('#home-sample', { visible: true });
  await page.locator('#home-sample').click();
  await page.waitForFunction(() => document.body.dataset.view === 'read');
  const text = 'An unlost reading-side note.\n\nKeep its blank line.';
  await page.type('#paste-box', text);
  await page.evaluate(() => {
    window.savedPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...args) {
      if (this.name === 'docs') throw new DOMException('Synthetic quota', 'QuotaExceededError');
      return window.savedPut.apply(this, args);
    };
  });
  await page.locator('#paste-add').click();
  await page.waitForFunction(() => document.getElementById('status-text').textContent.includes('Couldn’t save'));
  assert.equal(await page.$eval('#paste-box', e => e.value), text);
  await page.evaluate(() => { IDBObjectStore.prototype.put = window.savedPut; });
  await page.locator('#paste-add').click();
  await page.waitForFunction(() => document.getElementById('paste-box').value === '');
  const data = JSON.parse(await page.evaluate(() => window.__jtApp.exportData()));
  const pasted = data.documents.find(d => d.provenance.sourceKind === 'paste');
  assert.ok(pasted);
  assert.deepEqual(Object.values(pasted.sourceBytes), [...new TextEncoder().encode(text)]);
});

test('file drop keeps every file and leaves ordinary text drags alone', { timeout: 60000 }, async t => {
  const page = await bootShell(t, 4946, { width: 1440, height: 1000 });
  await page.locator('#welcome-next').click(); await page.locator('#welcome-skip').click();
  const textPrevented = await page.evaluate(() => {
    const transfer = new DataTransfer(); transfer.setData('text/plain', 'move these words');
    const event = new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true });
    document.body.dispatchEvent(event); return event.defaultPrevented;
  });
  assert.equal(textPrevented, false);
  await page.evaluate(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['First file.'], 'first.txt', { type: 'text/plain' }));
    transfer.items.add(new File(['# Second file\n\nKeep both.'], 'second.md', { type: 'text/markdown' }));
    document.body.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
  });
  await page.waitForFunction(async () => JSON.parse(await window.__jtApp.exportData()).documents.length === 2);
  const data = JSON.parse(await page.evaluate(() => window.__jtApp.exportData()));
  assert.deepEqual(data.documents.map(d => d.provenance.name).sort(), ['first.txt', 'second.md']);
});

test('images retain original bytes, render after restart and release their view on document switch', { timeout: 60000 }, async t => {
  const { mkdtemp, writeFile, readFile, mkdir, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const dir = await mkdtemp(path.join(tmpdir(), 'jett-image-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const page = await bootShell(t, 4947, { width: 1280, height: 900 });
  await page.locator('#welcome-next').click(); await page.locator('#welcome-skip').click();
  const data = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 960; c.height = 480;
    const x = c.getContext('2d'); x.fillStyle = '#264939'; x.fillRect(0,0,960,480); x.fillStyle = '#f4f3eb'; x.font = '48px sans-serif'; x.fillText('JETT image fixture',50,120);
    return c.toDataURL('image/png').split(',')[1];
  });
  const original = Buffer.from(data, 'base64'); const file = path.join(dir, 'field-notes.png'); await writeFile(file, original);
  await (await page.$('#home-file-input')).uploadFile(file);
  await page.waitForSelector('.image-document img', { visible: true });
  assert.deepEqual(await page.$eval('.image-document img', el => [el.naturalWidth, el.naturalHeight]), [960,480]);
  await page.screenshot({path:'/Users/sunlight/Documents/ChatGPT/JJTY/jett-image-desktop.png',fullPage:true});
  await page.setViewport({width:390,height:844});
  await page.waitForFunction(()=>getComputedStyle(document.getElementById("library-panel")).visibility === "hidden" && getComputedStyle(document.getElementById("history-panel")).visibility === "hidden");
  await assertNoOverflow(page);
  assert.ok(await page.evaluate(()=>document.getElementById('doc-head').getBoundingClientRect().top >= document.querySelector('.bar').getBoundingClientRect().bottom), 'document title clears the fixed header');
  await page.screenshot({path:'/Users/sunlight/Documents/ChatGPT/JJTY/jett-image-phone.png',fullPage:true});
  await page.setViewport({width:1280,height:900});
  await page.locator('.image-controls button').click();
  assert.equal(await page.$eval('.image-controls button', el => el.getAttribute('aria-pressed')), 'true');
  await page.reload(); await page.waitForSelector('.image-document img', { visible: true });
  const exported = JSON.parse(await page.evaluate(() => window.__jtApp.exportData()));
  assert.deepEqual(Object.values(exported.documents[0].sourceBytes), [...original]);
  assert.deepEqual(exported.documents[0].blocks, []);
  const output = path.join(dir,'download'); await mkdir(output);
  const session = await page.createCDPSession(); await session.send('Page.setDownloadBehavior', {behavior:'allow',downloadPath:output});
  await page.locator('#download-original').click();
  const target = path.join(output,'field-notes.png'); const deadline = Date.now()+5000;
  while (!existsSync(target) && Date.now()<deadline) await new Promise(r=>setTimeout(r,100));
  assert.deepEqual(await readFile(target), original);
  await page.goto(`${page.url().split('#')[0]}#/home`);
  await page.locator('#home-paste-box').fill('Return to a normal text document.');
  await page.locator('#home-paste-add').click();
  await page.waitForFunction(()=>document.body.dataset.view==='read' && document.querySelectorAll('#doc p[data-block]').length>0);
  assert.equal(await page.$('.image-document'),null);
  await page.goto(`${page.url().split('#')[0]}#/home`);
  const broken = path.join(dir, 'broken.png'); await writeFile(broken, Buffer.from([137,80,78,71,13,10,26,10,0,0]));
  await (await page.$('#home-file-input-2')).uploadFile(broken);
  await page.waitForFunction(()=>document.getElementById('home-intake-state').textContent.includes('could not be opened'));
  const after = JSON.parse(await page.evaluate(()=>window.__jtApp.exportData()));
  assert.equal(after.documents.length,2, 'a corrupt image must not become a saved document');
});

test('voice cursor follows within a paragraph and exact highlights survive restart and undo', {timeout:60000}, async t => {
  const page = await bootShell(t, 4948, {width:1280,height:900});
  await page.locator('#welcome-next').click();
  await page.locator('#welcome-skip').click();
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  await page.evaluate(async () => {
    await window.__jtApp.addDocument('The northern orchard produces crisp apples every autumn. Beyond the old stone bridge the southern meadow shelters nesting birds through winter.\n\nThe eastern greenhouse protects young seedlings during cold spring nights.', 'Orchard field notes');
    window.__jtApp.showView('read');
  });
  await page.waitForSelector('#doc [data-block]', {visible:true});
  await page.evaluate(()=>window.__jtApp.follow('northern orchard produces crisp apples'));
  const first = await page.$eval('#marker', n => ({top:n.style.top,left:n.style.left,width:n.style.width,height:n.style.height}));
  await page.evaluate(()=>window.__jtApp.follow('southern meadow shelters nesting birds through winter'));
  await page.waitForFunction(previous => {
    const n=document.getElementById('marker');
    return n.style.top!==previous.top || n.style.left!==previous.left || n.style.width!==previous.width || n.style.height!==previous.height;
  }, {timeout:2000}, first);
  await page.evaluate(async()=>{
    await window.__jtApp.segment('southern meadow shelters nesting birds through winter');
    await window.__jtApp.segment('highlight this');
  });
  await page.waitForSelector('mark.jt-highlight');
  const marked=await page.$eval('mark.jt-highlight',n=>n.textContent);
  assert.equal(marked,'southern meadow shelters nesting birds through winter');
  const id=await page.evaluate(()=>window.__jtApp.entries().findLast(e=>e.act==='highlight').id);
  await page.reload({waitUntil:'load'});
  await page.waitForSelector('mark.jt-highlight',{visible:true});
  assert.equal(await page.$eval('mark.jt-highlight',n=>n.textContent),marked);
  await page.evaluate(()=>window.__jtApp.segment('undo'));
  await page.waitForFunction(()=>!document.querySelector('mark.jt-highlight'));
  assert.equal(await page.evaluate(id=>window.__jtApp.entries().find(e=>e.id===id).undone,id),true);
  await page.reload({waitUntil:'load'});
  await page.waitForSelector('#doc [data-block]',{visible:true});
  assert.equal(await page.$('mark.jt-highlight'),null);
  await page.evaluate(async()=>{
    window.__jtApp.follow('northern orchard produces crisp apples');
    await window.__jtApp.segment('northern orchard produces crisp apples');
  });
  await page.locator('#doc [data-block="1"]').click();
  await page.evaluate(()=>window.__jtApp.follow('northern orchard produces crisp apples highlight this', 'highlight this'));
  assert.equal(await page.evaluate(()=>window.__jtApp.currentBlock()),1,'cumulative recognition history must not move the selection while issuing a command');
  await page.evaluate(()=>window.__jtApp.segment('highlight this'));
  const selected=await page.evaluate(()=>window.__jtApp.entries().findLast(e=>e.act==='highlight'));
  assert.equal(selected.blockIndex,1,'a deliberate passage selection replaces the earlier voice target');
});

test('failed actions and interrupted undo retain the last durable document state', {timeout:60000}, async t => {
  const page=await bootShell(t,4949,{width:1280,height:900});
  await page.locator('#welcome-next').click(); await page.locator('#welcome-skip').click();
  await page.evaluate(()=>window.__jtApp.addDocument('The river bridge will reopen after the winter inspection.', 'Bridge inspection'));
  await page.waitForSelector('#doc [data-block]',{visible:true});
  const failWrites=async (nth, abort=false)=>page.evaluate(({nth,abort})=>{
    window.savedActionPut=IDBObjectStore.prototype.put;
    let count=0;
    IDBObjectStore.prototype.put=function(...args){
      if(this.name==='records' && ++count===nth) {
        if(abort) { const request=window.savedActionPut.apply(this,args); this.transaction.abort(); return request; }
        throw new DOMException('Synthetic record failure','QuotaExceededError');
      }
      return window.savedActionPut.apply(this,args);
    };
  },{nth,abort});
  const restore=()=>page.evaluate(()=>{IDBObjectStore.prototype.put=window.savedActionPut;});
  await page.evaluate(async()=>{window.__jtApp.follow('river bridge will reopen'); await window.__jtApp.segment('river bridge will reopen');});
  await failWrites(1);
  await page.evaluate(()=>window.__jtApp.segment('highlight this').catch(()=>null));
  await restore();
  assert.equal(await page.$('mark.jt-highlight'),null,'failed highlight must not appear saved');
  assert.match(await page.$eval('#status-text',n=>n.textContent),/Could not save that change/);
  assert.equal(await page.evaluate(()=>window.__jtApp.entries().filter(e=>e.kind==='act').length),0);
  await page.evaluate(()=>window.__jtApp.segment('highlight this'));
  await page.waitForSelector('mark.jt-highlight');
  const id=await page.evaluate(()=>window.__jtApp.entries().findLast(e=>e.act==='highlight').id);
  // Fail the second write: neither the target update nor the undo record may commit.
  await failWrites(2);
  await page.evaluate(()=>window.__jtApp.segment('undo').catch(()=>null));
  await restore();
  assert.ok(await page.$('mark.jt-highlight'),'interrupted undo must leave the saved mark visible');
  assert.equal(await page.evaluate(id=>!!window.__jtApp.entries().find(e=>e.id===id).undone,id),false);
  await page.reload({waitUntil:'load'});
  await page.waitForSelector('mark.jt-highlight',{visible:true});
  assert.equal(await page.evaluate(()=>window.__jtApp.entries().filter(e=>e.kind==='undo').length),0);
  await failWrites(2,true);
  await page.evaluate(()=>window.__jtApp.segment('undo'));
  await restore();
  assert.ok(await page.$('mark.jt-highlight'),'transaction abort must preserve the visible mark');
  await page.reload({waitUntil:'load'});
  await page.waitForSelector('mark.jt-highlight',{visible:true});
  assert.equal(await page.evaluate(()=>window.__jtApp.entries().filter(e=>e.kind==='undo').length),0);
  await page.evaluate(()=>window.__jtApp.segment('undo'));
  await page.waitForFunction(()=>!document.querySelector('mark.jt-highlight'));
  await page.reload({waitUntil:'load'});
  await page.waitForSelector('#doc [data-block]',{visible:true});
  assert.equal(await page.$('mark.jt-highlight'),null);
  assert.equal(await page.evaluate(()=>window.__jtApp.entries().filter(e=>e.kind==='undo').length),1);
});

test('rapid voice highlight and undo stay ordered; overlapping document opens stay isolated', {timeout:60000}, async t=>{
  const page=await bootShell(t,4950,{width:1280,height:900});
  await page.locator('#welcome-next').click(); await page.locator('#welcome-skip').click();
  await page.evaluate(()=>window.__jtApp.addDocument('Northern forest shelters young deer during the winter.', 'Forest survey'));
  await page.waitForSelector('#doc [data-block]',{visible:true});
  await page.evaluate(async()=>{
    window.__jtApp.follow('forest shelters young deer');
    await window.__jtApp.segment('forest shelters young deer');
    await Promise.all([window.__jtApp.segment('highlight this'),window.__jtApp.segment('undo')]);
  });
  const actions=await page.evaluate(()=>window.__jtApp.entries().filter(e=>e.kind==='act'||e.kind==='undo'));
  assert.deepEqual(actions.map(e=>e.act),['highlight','undo']);
  assert.equal(actions[0].undone,true);
  assert.equal(await page.$('mark.jt-highlight'),null);
  await page.evaluate(async()=>{
    await window.__jtApp.addDocument('The northern orchard produces crisp apples every autumn.\n\nThe southern meadow shelters nesting birds through winter.', 'Fast reading');
    window.__jtApp.follow('northern orchard produces crisp apples');
    await window.__jtApp.segment('northern orchard produces crisp apples');
    const first=window.__jtApp.segment('highlight this');
    window.__jtApp.follow('southern meadow shelters nesting birds');
    const reading=window.__jtApp.segment('southern meadow shelters nesting birds');
    const second=window.__jtApp.segment('highlight this');
    await Promise.all([first,reading,second]);
  });
  assert.deepEqual(await page.evaluate(()=>window.__jtApp.entries().filter(e=>e.act==='highlight').map(e=>e.blockIndex)),[0,1],'queued commands keep the passage at recognition time');
  await page.evaluate(async()=>{
    const [a,b]=await Promise.all([
      window.__jtApp.addDocument('Alpha document contains orchard observations.', 'Alpha survey'),
      window.__jtApp.addDocument('Beta document contains shoreline observations.', 'Beta survey')
    ]);
    await Promise.all([window.__jtApp.openDocument(a),window.__jtApp.openDocument(b)]);
  });
  assert.equal(await page.$eval('#doc-title',n=>n.textContent),'Beta survey');
  assert.equal(await page.evaluate(()=>window.__jtApp.currentDoc().title),'Beta survey');
  assert.equal(await page.$$eval('#doc [data-block]',nodes=>nodes.map(n=>n.textContent).join('\n')),'Beta document contains shoreline observations.');
});

test('a delayed action completion cannot paint into the next document', {timeout:60000}, async t=>{
  const page=await bootShell(t,4951,{width:1280,height:900});
  await page.locator('#welcome-next').click(); await page.locator('#welcome-skip').click();
  await page.evaluate(async()=>{
    window.firstDoc=await window.__jtApp.addDocument('Original orchard trees shelter the nesting birds.', 'Orchard');
    window.nextDoc=await window.__jtApp.addDocument('Different shoreline survey remains untouched.', 'Shoreline');
    await window.__jtApp.openDocument(window.firstDoc);
    window.__jtApp.follow('Original orchard trees shelter');
    await window.__jtApp.segment('Original orchard trees shelter');
    const transaction=IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction=function(...args){
      const tx=transaction.apply(this,args);
      if(args[0]==='records' && args[1]==='readwrite') {
        IDBDatabase.prototype.transaction=transaction;
        Object.defineProperty(tx,'oncomplete',{set(callback){
          tx.addEventListener('complete',event=>{
            window.releaseAction=()=>callback.call(tx,event);
          });
        }});
      }
      return tx;
    };
    window.pendingAction=window.__jtApp.segment('highlight this');
    window.queuedUndo=window.__jtApp.segment('undo');
  });
  await page.waitForFunction(()=>typeof window.releaseAction==='function');
  await page.evaluate(()=>window.__jtApp.openDocument(window.nextDoc));
  await page.evaluate(async()=>{window.releaseAction(); await Promise.all([window.pendingAction,window.queuedUndo]);});
  assert.equal(await page.$('mark.jt-highlight'),null,'late action must not mark the different document');
  assert.match(await page.$eval('#status-text',n=>n.textContent),/document changed/);
  assert.equal(await page.evaluate(()=>window.__jtApp.entries().filter(e=>e.kind==='act').length),0);
  await page.evaluate(()=>window.__jtApp.openDocument(window.firstDoc));
  await page.waitForSelector('mark.jt-highlight',{visible:true});
  assert.equal(await page.$eval('mark.jt-highlight',n=>n.textContent),'Original orchard trees shelter');
});
