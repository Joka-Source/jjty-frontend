// Headless end-to-end proof: build output served by `vite preview`, loaded in
// headless Chrome (driven by puppeteer-core) with ?sim=1&fast=1. The sim
// replays a scripted transcript through the live pipeline (matcher, command
// grammar, act engine, IndexedDB) and serializes a #jt-report node; we assert
// on it and re-validate every cursor/receipt with ajv. The test builds dist/
// if it is missing.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { validateCursor, validateReceipt, errorsOf, root } from "./validate.mjs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 4931;

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

test("sim replay: records created, schema-valid, undo works", { timeout: 120000 }, async (t) => {
  assert.ok(existsSync(CHROME), "Google Chrome required for headless e2e");
  if (!existsSync(path.join(root, "dist", "index.html"))) {
    execFileSync("npx", ["vite", "build"], { cwd: root, stdio: "inherit" });
  }
  const server = spawn("npx", ["vite", "preview", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], {
    cwd: root,
    stdio: "ignore",
  });
  t.after(() => server.kill("SIGTERM"));
  await waitFor(`http://127.0.0.1:${PORT}/`);

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--disable-gpu", "--no-first-run"],
  });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/?sim=1&fast=1`, { waitUntil: "load" });
  await page.waitForSelector("#jt-report", { timeout: 60000 });
  const report = JSON.parse(
    await page.$eval("#jt-report", (n) => n.textContent)
  );
  assert.equal(report.error, null, `sim stopped early: ${report.error}`);
  assert.equal(report.stepsCompleted, 7, "sim did not finish every live-path step");

  // The glide worked: live matching hit both read passages.
  assert.ok(report.matches > 0, "no transcript matches recorded");
  assert.ok(report.blocksHit.includes(3), "block 3 never matched");
  assert.ok(report.blocksHit.includes(4), "block 4 never matched");

  // The default matching engine is the jt-core wasm kernel.
  assert.equal(report.engine, "wasm", "default engine should be wasm");

  // The sim document entered through jt-connectors: provenance travels.
  assert.ok(report.provenance, "sim document has no provenance");
  assert.match(report.provenance.contentDigest, /^sha256:[0-9a-f]{64}$/);
  assert.ok(report.provenance.byteSize > 0);

  // All spoken commands were recognized, in order; the final ambiguous
  // range utterance surfaced as an ask, not an act.
  assert.deepEqual(report.commands, ["highlight", "note", "important", "undo", "ask"]);
  assert.equal(report.ambiguities.length, 1, "ambiguous utterance not surfaced");
  assert.ok(report.ambiguities[0].candidates.length >= 2);
  assert.equal(report.askPending, true, "the app should still be asking");

  // Four history entries: three acts + one undo.
  const acts = report.entries.filter((e) => e.kind === "act");
  const undos = report.entries.filter((e) => e.kind === "undo");
  assert.equal(acts.length, 3, `expected 3 acts, got ${acts.length}`);
  assert.equal(undos.length, 1, `expected 1 undo, got ${undos.length}`);
  assert.deepEqual(
    acts.map((e) => e.act),
    ["highlight", "note", "important"]
  );

  // The undo reversed the last act, and says so.
  const important = acts.find((e) => e.act === "important");
  assert.equal(important.undone, true, "important act not marked undone");
  assert.equal(undos[0].undoes, important.id, "undo does not reference the reversed act");
  const survivors = acts.filter((e) => !e.undone);
  assert.deepEqual(survivors.map((e) => e.act), ["highlight", "note"]);

  // Acts happened where the reading was: highlight on block 3, note on 4.
  assert.equal(acts[0].blockIndex, 3);
  assert.equal(acts[1].blockIndex, 4);

  // Evidence is attached: what was said, and match confidence for acts.
  for (const e of report.entries) {
    assert.ok(e.evidence?.length > 0, `entry ${e.id} has no evidence`);
  }
  assert.ok(acts[0].confidence > 0.6, "no plausible confidence on highlight act");

  // Every record on the wire conforms to the contracts.
  for (const e of report.entries) {
    assert.ok(validateCursor(e.cursor), `${e.id} cursor: ${errorsOf(validateCursor)}`);
    assert.ok(validateReceipt(e.receipt), `${e.id} receipt: ${errorsOf(validateReceipt)}`);
  }

  // Ambiguity resolves by asking: the "did you mean…" prompt is visible;
  // choosing the first candidate performs a range highlight — only then.
  const askVisible = await page.$eval("#ask", (n) => !n.hidden);
  assert.equal(askVisible, true, "did-you-mean prompt not visible");
  const before = await page.evaluate(() => window.__jtApp.entries().length);
  await page.evaluate(() =>
    document.querySelector('#ask .ask-option[data-candidate="0"]').click()
  );
  await page.waitForFunction(
    (n) => window.__jtApp.entries().length > n,
    { timeout: 5000 },
    before
  );
  const resolved = await page.evaluate(() => {
    const es = window.__jtApp.entries();
    const e = es[es.length - 1];
    return {
      act: e.act,
      blockIndex: e.blockIndex,
      blockEnd: e.blockEnd,
      modality: e.modality,
      cursor: e.cursor,
      receipt: e.receipt,
      askGone: !window.__jtApp.ask(),
    };
  });
  assert.equal(resolved.act, "highlight");
  assert.equal(resolved.blockIndex, 3, "range should start at the rent block");
  assert.equal(resolved.blockEnd, 4, "range should end at the deposit block");
  assert.equal(resolved.askGone, true, "ask should clear after resolution");
  assert.ok(validateCursor(resolved.cursor), `range cursor: ${errorsOf(validateCursor)}`);
  assert.ok(validateReceipt(resolved.receipt), `range receipt: ${errorsOf(validateReceipt)}`);

  await t.test("close target spans ask, show context, and store the chosen evidence", async () => {
    assert.equal(
      await page.evaluate(() => typeof window.__jtApp.follow),
      "function",
      "the real matcher-follow path is unavailable to the browser proof",
    );
    await page.evaluate(() =>
      window.__jtApp.addDocument(
        [
          "alpha context before shared target phrase lives here after alpha context",
          "middle passage",
          "beta context before shared target phrase lives here after beta context",
        ].join("\n\n"),
        "target choice proof",
      ),
    );
    await page.waitForFunction(() => document.getElementById("doc-title").textContent === "target choice proof");
    await page.evaluate(() => window.__jtApp.follow("shared target phrase lives here"));
    const beforeChoice = await page.evaluate(() => window.__jtApp.entries().length);
    await page.evaluate(() => window.__jtApp.segment("highlight this"));
    await page.waitForFunction(() => !document.getElementById("ask").hidden);
    const pending = await page.evaluate(() => ({
      entries: window.__jtApp.entries().length,
      labels: [...document.querySelectorAll("#ask-options .target-ask")].map((node) => node.textContent),
    }));
    assert.equal(pending.entries, beforeChoice, "uncertain target wrote an act before a choice");
    assert.equal(pending.labels.length, 2);
    assert.match(pending.labels[0], /alpha context.*shared target phrase lives here.*alpha context/i);
    assert.match(pending.labels[1], /beta context.*shared target phrase lives here.*beta context/i);

    await page.click('#ask-options .target-ask[data-candidate="1"]');
    await page.waitForFunction(
      (count) => window.__jtApp.entries().length === count + 1,
      { timeout: 5000 },
      beforeChoice,
    );
    const chosen = await page.evaluate(() => window.__jtApp.entries().at(-1));
    assert.equal(chosen.act, "highlight");
    assert.equal(chosen.blockIndex, 2);
    assert.equal(chosen.targetChoice.asked, true);
    assert.match(chosen.targetChoice.reason, /more than one passage/i);
    assert.equal(chosen.targetChoice.candidates.length, 2);
    assert.match(chosen.targetChoice.chosen, /shared target phrase lives here/i);
    assert.match(chosen.cursor.history.at(-1).event, /person chose/i);

    assert.equal(
      await page.evaluate(() => typeof window.__jtApp.openDocument),
      "function",
      "the browser proof cannot reopen a revised copy of the current document",
    );
    const moved = await page.evaluate(async (entryId) => {
      const doc = structuredClone(window.__jtApp.currentDoc());
      doc.text = `newly prepended paragraph\n\n${doc.text}`;
      doc.blocks = [{ text: "newly prepended paragraph", kind: "paragraph" }, ...doc.blocks];
      doc.revision += 1;
      doc.provenance.contentDigest = `sha256:${"d".repeat(64)}`;
      await window.__jtApp.openDocument(doc);
      const entry = window.__jtApp.entries().find((row) => row.id === entryId);
      return {
        arrival: entry.arrival,
        blockIndex: entry.blockIndex,
        history: document.getElementById("history-list").textContent,
        markPresent: !!document.querySelector(`mark.jt-highlight[data-entry="${entry.id}"]`),
      };
    }, chosen.id);
    assert.equal(moved.arrival, "refound");
    assert.equal(moved.blockIndex, 3);
    assert.match(moved.history, /text found again after it moved/i);
    assert.equal(moved.markPresent, true, "refound text was not visibly highlighted");

    const lost = await page.evaluate(async (entryId) => {
      const doc = structuredClone(window.__jtApp.currentDoc());
      doc.text = doc.text.replaceAll("shared target phrase lives here", "changed words are no longer the same");
      doc.blocks = doc.blocks.map((block) => ({
        ...block,
        text: block.text.replaceAll("shared target phrase lives here", "changed words are no longer the same"),
      }));
      doc.revision += 1;
      doc.provenance.contentDigest = `sha256:${"e".repeat(64)}`;
      await window.__jtApp.openDocument(doc);
      const entry = window.__jtApp.entries().find((row) => row.id === entryId);
      return {
        arrival: entry.arrival,
        history: document.getElementById("history-list").textContent,
        markPresent: !!document.querySelector(`mark.jt-highlight[data-entry="${entry.id}"]`),
      };
    }, chosen.id);
    assert.equal(lost.arrival, "lost");
    assert.match(lost.history, /this text may have moved\/changed/i);
    assert.equal(lost.markPresent, false, "lost text was painted onto a different passage");
  });

  await t.test("math voice sim enters mode, keeps in history, and validates", async () => {
  // Voice math mode uses the same final-segment pipeline as the mic. Typed
  // words also remain editable (spaces are not trimmed out from under the
  // person) and unknown words are surfaced before the required spoken case.
  await page.evaluate(() => window.__jtApp.math.segment("math mode"));
  await page.type("#math-spoken", "x squared mystery");
  const typedMath = await page.evaluate(() => ({
    value: document.getElementById("math-spoken").value,
    unparsed: document.getElementById("math-unparsed").textContent,
  }));
  assert.equal(typedMath.value, "x squared mystery");
  assert.match(typedMath.unparsed, /mystery/);

  await page.evaluate(() => window.__jtApp.math.segment("one half plus x squared"));
  await page.waitForSelector("#math-rendered .katex");
  const mathPreview = await page.evaluate(() => ({
    active: window.__jtApp.math.active(),
    spoken: document.getElementById("math-spoken").value,
    latex: window.__jtApp.math.expression().latex,
    unparsedHidden: document.getElementById("math-unparsed").hidden,
    modePressed: document.getElementById("math-mode-toggle").getAttribute("aria-pressed"),
  }));
  assert.deepEqual(mathPreview, {
    active: true,
    spoken: "one half plus x squared",
    latex: "\\frac{1}{2} + x^{2}",
    unparsedHidden: true,
    modePressed: "true",
  });

  const beforeMath = await page.evaluate(() => window.__jtApp.entries().length);
  await page.evaluate(() => window.__jtApp.math.segment("keep that"));
  await page.waitForFunction(
    (count) => window.__jtApp.entries().length === count + 1,
    { timeout: 5000 },
    beforeMath
  );
  const keptMath = await page.evaluate(async () => {
    const entry = window.__jtApp.entries().at(-1);
    const exported = JSON.parse(await window.__jtApp.exportData());
    return {
      entry,
      strip: document.getElementById("math-session-list").textContent,
      readingHistory: document.getElementById("history-list").textContent,
      exported: exported.records.some(
        (record) => record.id === entry.id && record.mathLatex === entry.mathLatex
      ),
    };
  });
  assert.equal(keptMath.entry.act, "math");
  assert.equal(keptMath.entry.evidence, "one half plus x squared");
  assert.equal(keptMath.entry.mathLatex, "\\frac{1}{2} + x^{2}");
  assert.match(keptMath.strip, /one half plus x squared/);
  assert.match(keptMath.readingHistory, /mathematics kept/);
  assert.equal(keptMath.exported, true);
  assert.ok(validateCursor(keptMath.entry.cursor), `math cursor: ${errorsOf(validateCursor)}`);
  assert.ok(validateReceipt(keptMath.entry.receipt), `math receipt: ${errorsOf(validateReceipt)}`);

  await page.evaluate(() => window.__jtApp.showView("history"));
  await page.waitForFunction(() =>
    document.getElementById("history-all").textContent.includes("mathematics kept")
  );
  assert.match(await page.$eval("#history-all", (node) => node.textContent), /one half plus x squared/);

  await page.evaluate(() => document.querySelector("#history-list .entry .undo-btn").click());
  await page.waitForFunction(
    (entryId) => window.__jtApp.entries().find((entry) => entry.id === entryId)?.undone === true,
    { timeout: 5000 },
    keptMath.entry.id
  );
  const undoneMath = await page.evaluate((entryId) => ({
    target: window.__jtApp.entries().find((entry) => entry.id === entryId),
    last: window.__jtApp.entries().at(-1),
    annotationPresent: !!document.querySelector(`[data-entry="${entryId}"]`),
  }), keptMath.entry.id);
  assert.equal(undoneMath.target.undone, true);
  assert.equal(undoneMath.last.undoes, keptMath.entry.id);
  assert.equal(undoneMath.annotationPresent, false);
  });
});
