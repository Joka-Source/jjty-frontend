// jt — the matching engine behind the glide. Two implementations of one
// interface:
//   js:   the reference matcher (src/match.js), block resolution by token
//         majority — the original pipeline.
//   wasm: jt-core compiled to wasm (the sibling repo's pkg), the deterministic
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

/** Load the jt-core package's wasm once. In Vite the wasm URL resolves via
 * ?url; in node tests initSync is used instead (see parity test). */
async function loadWasm() {
  if (!wasmReady) {
    wasmReady = (async () => {
      const mod = await import("jt-core");
      const wasmUrl = (await import("jt-core/jt_core_bg.wasm?url")).default;
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

// Cursor recovery is separate from fuzzy action targeting in match.js. The
// eight-word running window can straddle a spoken jump and keep an old passage
// winning. Only an exact, document-unique suffix may override that window.
const COMMON_CURSOR_WORDS = new Set((
  "the a an and or but that this these those with without from into onto over " +
  "under for have has had been being were was are will would could should shall " +
  "must may might can cannot not only also just then than when where what which " +
  "who whom whose how here there their them they your yours you our ours his her " +
  "hers its some any all each every both either neither other another such same " +
  "more most less very much many few one two three four five first last next " +
  "about after before between through during until upon does did doing done " +
  "please okay yes no highlight important note undo redo"
).split(/\s+/));

function distinctiveToken(token) {
  return /^[\p{L}]{4,}$/u.test(token) && !COMMON_CURSOR_WORDS.has(token);
}

/** Shared live adapter; raw kernels stay unchanged for their parity gate. */
export function withResponsiveCursor(engine, blockTexts) {
  const { docTokens, tokenBlock } = documentTokens(blockTexts);
  return {
    ...engine,
    follow(fullTranscript) {
      const primary = engine.follow(fullTranscript);
      const tail = tokenize(fullTranscript).slice(-8);
      if (!tail.length) return primary;
      // Preserve complete exact phrase spans and their ambiguity candidates.
      if (primary && primary.end - primary.start + 1 === tail.length &&
          tail.every((word, i) => docTokens[primary.start + i] === word)) return primary;
      // ASR can misspell an earlier word while the newest word is already
      // correctly aligned. Keep that useful multiword range, not just its tail.
      if (primary && tail.length >= 3 && primary.confidence >= 0.78 &&
          docTokens[primary.end] === tail.at(-1) &&
          docTokens[primary.end - 1] === tail.at(-2)) return primary;
      for (let length = tail.length; length >= 1; length--) {
        const suffix = tail.slice(-length);
        if (!suffix.some(distinctiveToken)) continue;
        let found = -1;
        for (let start = 0; start + length <= docTokens.length; start++) {
          if (!suffix.every((word, i) => docTokens[start + i] === word)) continue;
          // Never use proximity to choose a repeated short recovery target.
          if (found >= 0) return null;
          found = start;
        }
        if (found < 0) continue;
        const end = found + length - 1;
        // Neither kernel exposes a cursor-position setter. Drop its stale
        // proximity hint after recovery; the next phrase establishes a new one.
        engine.reset();
        return { blockIndex: blockForRange(tokenBlock, found, end),
          confidence: 1, start: found, end,
          candidates: [{ start: found, end, score: 1 }] };
      }
      return primary;
    },
    reset() { engine.reset(); },
  };
}

/**
 * Create the engine for the requested mode ("wasm" default, "js" opt-out).
 * Returns { engine, kind, note } — note explains any fallback.
 */
export async function createMatchEngine(mode, blockTexts) {
  if (mode === "js") return { engine: withResponsiveCursor(createJsEngine(blockTexts), blockTexts), kind: "js", note: null };
  try {
    return { engine: withResponsiveCursor(await createWasmEngine(blockTexts), blockTexts), kind: "wasm", note: null };
  } catch (err) {
    return {
      engine: withResponsiveCursor(createJsEngine(blockTexts), blockTexts),
      kind: "js",
      note: `wasm engine unavailable (${err?.message ?? err}) — using the reference matcher`,
    };
  }
}
