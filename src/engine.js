// jt — the matching engine behind the glide. Two implementations of one
// interface:
//   js:   the reference matcher (src/match.js), block resolution by token
//         majority — the original pipeline.
//   wasm: jt-core compiled to wasm (vendor/jt-core), the deterministic
//         portable kernel; bit-identical scoring to the JS reference,
//         proven by test/parity.test.mjs before it became the default.
//
// Interface: engine.follow(fullTranscript) -> {blockIndex, confidence} | null
//
// Default engine: wasm (parity proven); ?engine=js forces the reference
// matcher; if wasm fails to load the app falls back to js and says so.

import { tokenize, matchTranscript, matchTranscriptCandidates } from "./match.js";

function documentTokens(blockTexts) {
  const docTokens = [];
  const tokenBlock = [];
  for (const [i, text] of blockTexts.entries()) {
    for (const tok of tokenize(text)) {
      docTokens.push(tok);
      tokenBlock.push(i);
    }
  }
  return { docTokens, tokenBlock };
}

/** Majority block over a token range; first-seen wins ties (JS reference). */
export function blockForRange(tokenBlock, start, end) {
  const counts = new Map();
  for (let i = start; i <= end; i++) {
    const b = tokenBlock[i];
    counts.set(b, (counts.get(b) ?? 0) + 1);
  }
  let best = -1;
  let bestCount = 0;
  for (const [b, c] of counts) {
    if (c > bestCount) {
      best = b;
      bestCount = c;
    }
  }
  return best;
}

/** The reference JS engine over a list of block texts. */
export function createJsEngine(blockTexts) {
  const { docTokens, tokenBlock } = documentTokens(blockTexts);
  let lastIndex = -1;
  return {
    kind: "js",
    docTokens,
    tokenBlock,
    follow(fullTranscript) {
      const m = matchTranscript(docTokens, fullTranscript, {
        lastIndex: lastIndex >= 0 ? lastIndex : undefined,
      });
      if (!m) return null;
      const candidates = matchTranscriptCandidates(docTokens, fullTranscript, {
        lastIndex: lastIndex >= 0 ? lastIndex : undefined,
        limit: 6,
      });
      lastIndex = m.end;
      const blockIndex = blockForRange(tokenBlock, m.start, m.end);
      return { blockIndex, confidence: m.score, start: m.start, end: m.end, candidates };
    },
    reset() {
      lastIndex = -1;
    },
  };
}

let wasmReady = null;

/** Load the vendored jt-core wasm once. In Vite the wasm URL resolves via
 * ?url; in node tests initSync is used instead (see parity test). */
async function loadWasm() {
  if (!wasmReady) {
    wasmReady = (async () => {
      const mod = await import("../vendor/jt-core/jt_core.js");
      const wasmUrl = (await import("../vendor/jt-core/jt_core_bg.wasm?url")).default;
      await mod.default({ module_or_path: wasmUrl });
      return mod;
    })();
  }
  return wasmReady;
}

/** The jt-core wasm engine over a list of block texts. */
export async function createWasmEngine(blockTexts) {
  const mod = await loadWasm();
  const engine = new mod.Engine(JSON.stringify(blockTexts));
  const { docTokens } = documentTokens(blockTexts);
  let lastIndex = -1;
  return {
    kind: "wasm",
    follow(fullTranscript) {
      const m = engine.match_update(fullTranscript);
      if (m == null) return null;
      const result = {
        blockIndex: m.blockIndex,
        confidence: m.confidence,
        start: m.tokenStart,
        end: m.tokenEnd,
        candidates: matchTranscriptCandidates(docTokens, fullTranscript, {
          lastIndex: lastIndex >= 0 ? lastIndex : undefined,
          limit: 6,
        }),
      };
      lastIndex = m.tokenEnd;
      return result;
    },
    reset() {
      engine.reset_position();
      lastIndex = -1;
    },
  };
}

/**
 * Create the engine for the requested mode ("wasm" default, "js" opt-out).
 * Returns { engine, kind, note } — note explains any fallback.
 */
export async function createMatchEngine(mode, blockTexts) {
  if (mode === "js") return { engine: createJsEngine(blockTexts), kind: "js", note: null };
  try {
    return { engine: await createWasmEngine(blockTexts), kind: "wasm", note: null };
  } catch (err) {
    return {
      engine: createJsEngine(blockTexts),
      kind: "js",
      note: `wasm engine unavailable (${err?.message ?? err}) — using the reference matcher`,
    };
  }
}
