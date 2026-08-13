// Fuzzy n-gram matcher: maps a window of spoken words onto a token stream
// extracted from a document's text layer.
//
// Approach ("two anchors, fuzzy middle"): the first and last words of the
// spoken window are weighted as anchors; interior words tolerate ASR errors
// via character-bigram similarity. The best-scoring window of document
// tokens wins, with a small proximity bonus so repeated phrases resolve to
// the occurrence nearest the reader's current position.
//
// Dependency-free ESM so it runs in the browser and under `node --test`.

/** Normalize prose for matching (not for display). */
export function normalize(text) {
  return String(text ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "") // strip diacritics
    .toLowerCase()
    .replace(/([\p{L}\p{N}])['’]([\p{L}\p{N}])/gu, "$1$2") // don't -> dont
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Split text into normalized word tokens. */
export function tokenize(text) {
  const n = normalize(text);
  return n ? n.split(" ") : [];
}

/**
 * Split display text into the same normalized tokens while retaining exact
 * UTF-16 source offsets. `end` is exclusive, matching DOM Range offsets.
 */
export function tokenizeWithSpans(text) {
  const source = String(text ?? "");
  const spans = [];
  const words = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*|&/gu;
  for (const match of source.matchAll(words)) {
    const normalized = tokenize(match[0]);
    if (normalized.length !== 1) continue;
    spans.push({
      token: normalized[0],
      start: match.index,
      end: match.index + match[0].length,
      text: match[0],
    });
  }
  return spans;
}

/** Character bigrams of a token, including boundary markers. */
function bigrams(token) {
  const padded = `${token}`;
  const grams = [];
  for (let i = 0; i < padded.length - 1; i++) grams.push(padded.slice(i, i + 2));
  return grams;
}

/**
 * Similarity of two tokens in [0, 1].
 * Exact match is 1; otherwise Sorensen-Dice over character bigrams,
 * which forgives typical ASR slips ("holmes" vs "homes").
 */
export function tokenSimilarity(a, b) {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const ga = bigrams(a);
  const gb = bigrams(b);
  const counts = new Map();
  for (const g of ga) counts.set(g, (counts.get(g) ?? 0) + 1);
  let shared = 0;
  for (const g of gb) {
    const c = counts.get(g);
    if (c > 0) {
      shared++;
      counts.set(g, c - 1);
    }
  }
  return (2 * shared) / (ga.length + gb.length);
}

export const TARGET_POLICY = Object.freeze({
  minScore: 0.62,
  askBelow: 0.78,
  closeScoreGap: 0.05,
});

const DEFAULTS = {
  minScore: TARGET_POLICY.minScore, // below this, report no match
  anchorWeight: 1.6, // first and last spoken tokens count more
  proximityBonus: 0.04, // max bonus for matching near lastIndex
};

/** Rank every accepted document window while preserving its exact span. */
export function findMatches(docTokens, spokenTokens, opts = {}) {
  const { minScore, anchorWeight, proximityBonus, lastIndex, limit = Infinity } = {
    ...DEFAULTS,
    ...opts,
  };
  const n = docTokens.length;
  const m = spokenTokens.length;
  if (m === 0 || n === 0 || m > n) return [];

  const weights = new Array(m).fill(1);
  if (m >= 2) {
    weights[0] = anchorWeight;
    weights[m - 1] = anchorWeight;
  }
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const matches = [];
  for (let start = 0; start + m <= n; start++) {
    let acc = 0;
    for (let i = 0; i < m; i++) {
      acc += weights[i] * tokenSimilarity(spokenTokens[i], docTokens[start + i]);
    }
    const score = acc / weightSum;
    if (score < minScore) continue;
    let rankedScore = score;
    if (Number.isInteger(lastIndex) && n > 1) {
      const dist = Math.abs(start - lastIndex);
      rankedScore += proximityBonus * (1 - Math.min(dist, n) / n);
    }
    matches.push({ start, end: start + m - 1, score, rankedScore });
  }
  matches.sort((a, b) => b.rankedScore - a.rankedScore || a.start - b.start);
  return matches.slice(0, Math.max(0, limit)).map(({ rankedScore: _ranked, ...match }) => match);
}

/**
 * Find the best window of `docTokens` matching `spokenTokens`.
 *
 * @param {string[]} docTokens  normalized tokens of the whole document
 * @param {string[]} spokenTokens  normalized tokens of the latest speech window
 * @param {object} [opts]
 * @param {number} [opts.lastIndex]  doc-token index of the previous match;
 *   nearby occurrences of ambiguous phrases get a small bonus
 * @param {number} [opts.minScore]
 * @returns {{start: number, end: number, score: number} | null}
 *   start/end are inclusive doc-token indices; null when nothing clears
 *   minScore.
 */
export function findMatch(docTokens, spokenTokens, opts = {}) {
  return findMatches(docTokens, spokenTokens, { ...opts, limit: 1 })[0] ?? null;
}

/**
 * Convenience for the live path: match the last `windowSize` words of a
 * running transcript against the document.
 *
 * @param {string[]} docTokens
 * @param {string} transcript  raw running transcript text
 * @param {object} [opts]  forwarded to findMatch; plus windowSize (default 8)
 */
export function matchTranscript(docTokens, transcript, opts = {}) {
  const { windowSize = 8, ...rest } = opts;
  const words = tokenize(transcript);
  if (words.length === 0) return null;
  const spoken = words.slice(-windowSize);
  // Very short windows are too ambiguous to act on.
  if (spoken.length < 3) return null;
  return findMatch(docTokens, spoken, rest);
}

/** Ranked form used when an act must decide whether its target is ambiguous. */
export function matchTranscriptCandidates(docTokens, transcript, opts = {}) {
  const { windowSize = 8, ...rest } = opts;
  const words = tokenize(transcript);
  if (words.length < 3) return [];
  return findMatches(docTokens, words.slice(-windowSize), rest);
}
