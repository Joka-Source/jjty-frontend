// Engine parity: the same sim transcript, word by word, through the JS
// reference matcher (src/engine.js createJsEngine — the exact code path the
// app uses with ?engine=js) and through the jt-core wasm engine (the
// default). The emitted block sequences must be identical and the
// confidence scores bit-identical (jt-core's determinism claim).
//
// This test is the gate that let the default engine flip to wasm.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJsEngine } from "../src/engine.js";
import { tokenize } from "../src/match.js";
import { splitParagraphs, STARTER_DOC } from "../src/doc.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

async function loadWasmForNode() {
  const mod = await import("jt-core");
  const bytes = readFileSync(path.join(root, "node_modules", "jt-core", "jt_core_bg.wasm"));
  mod.initSync({ module: bytes });
  return mod;
}

/** The sim's exact word feed: two misheard readings, the spoken acts, the
 * ambiguous range phrase — everything the live pipeline sees. */
function simWordFeed(blocks) {
  const mishear = { grace: "grays", deposit: "the posit", inspection: "inspections" };
  const script = [
    { read: 3 },
    { say: "highlight this" },
    { read: 4 },
    { say: "add a note check the inspection date before move out" },
    { say: "mark this important" },
    { say: "undo" },
    { say: "highlight from rent is due to the deposit to the final inspection" },
  ];
  const words = [];
  for (const step of script) {
    if (step.read != null) {
      for (const w of tokenize(blocks[step.read])) words.push(mishear[w] ?? w);
    } else {
      words.push(...step.say.split(" "));
    }
  }
  return words;
}

test("parity: JS matcher and wasm engine emit identical block sequences", async () => {
  const blocks = splitParagraphs(STARTER_DOC);
  const words = simWordFeed(blocks);

  const js = createJsEngine(blocks);
  const wasmMod = await loadWasmForNode();
  const wasm = new wasmMod.Engine(JSON.stringify(blocks));

  const jsSeq = [];
  const wasmSeq = [];
  let transcript = "";
  for (const w of words) {
    transcript += `${w} `;
    const a = js.follow(transcript);
    if (a) jsSeq.push({ block: a.blockIndex, score: a.confidence });
    const b = wasm.match_update(transcript);
    if (b != null) wasmSeq.push({ block: b.blockIndex, score: b.confidence });
  }

  assert.ok(jsSeq.length > 0, "JS matcher emitted nothing — feed is broken");
  assert.equal(wasmSeq.length, jsSeq.length, "different number of emissions");
  for (let i = 0; i < jsSeq.length; i++) {
    assert.equal(wasmSeq[i].block, jsSeq[i].block, `block diverged at emission ${i}`);
    assert.equal(
      wasmSeq[i].score,
      jsSeq[i].score,
      `confidence diverged at emission ${i}: js=${jsSeq[i].score} wasm=${wasmSeq[i].score}`
    );
  }
  // both engines followed the reading through blocks 3 and 4
  const blocksSeen = new Set(jsSeq.map((e) => e.block));
  assert.ok(blocksSeen.has(3) && blocksSeen.has(4), "reading did not traverse blocks 3 and 4");
});

test("parity: wasm cursor record validators agree with the vendored schemas", async () => {
  const wasmMod = await loadWasmForNode();
  const fresh = JSON.parse(wasmMod.cursor_new("cur-1", "anc-1", "doc-1"));
  assert.equal(fresh.state, "rest");
  assert.ok(wasmMod.cursor_validate(JSON.stringify(fresh)), "fresh cursor should validate");
  assert.ok(!wasmMod.cursor_validate(JSON.stringify({ ...fresh, state: "nonsense" })));
});
