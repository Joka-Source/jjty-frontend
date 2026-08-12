/**
 * Fuzzy matching utilities tolerant of recognizer errors.
 * Pure functions, isomorphic.
 */
/** Lowercase, strip punctuation, collapse whitespace. */
export function normalize(s) {
    return s
        .toLowerCase()
        .replace(/[^a-z0-9\s']/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
/** Levenshtein edit distance (iterative, two-row). */
export function editDistance(a, b) {
    if (a === b)
        return 0;
    if (a.length === 0)
        return b.length;
    if (b.length === 0)
        return a.length;
    let prev = new Array(b.length + 1);
    let curr = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++)
        prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
        curr[0] = i;
        const ca = a.charCodeAt(i - 1);
        for (let j = 1; j <= b.length; j++) {
            const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
            curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
        }
        [prev, curr] = [curr, prev];
    }
    return prev[b.length];
}
/**
 * Similarity in 0..1 between two phrases, computed on the space-stripped
 * normalized forms so recognizer word-splits ("hi light" vs "highlight")
 * cost nothing.
 */
export function phraseSimilarity(a, b) {
    const na = normalize(a).replace(/\s/g, "");
    const nb = normalize(b).replace(/\s/g, "");
    if (na.length === 0 || nb.length === 0)
        return 0;
    const d = editDistance(na, nb);
    return 1 - d / Math.max(na.length, nb.length);
}
/**
 * Try to match any of `phrases` at the start of `tokens`, allowing the
 * phrase to be split or merged across recognizer tokens. Returns the best
 * match at or above `threshold`, else null.
 */
export function matchPhraseAt(tokens, start, phrases, threshold = 0.8) {
    let best = null;
    const maxWindow = Math.min(5, tokens.length - start);
    for (const phrase of phrases) {
        const phraseWords = phrase.split(" ").length;
        // window sizes around the phrase's own word count (split/merge tolerance)
        for (let w = Math.max(1, phraseWords - 1); w <= Math.min(maxWindow, phraseWords + 2); w++) {
            const window = tokens.slice(start, start + w).join(" ");
            const score = phraseSimilarity(window, phrase);
            // ties prefer the longer window ("undo that" beats "undo" so the
            // deictic word is consumed by the command, not left to reading)
            if (score >= threshold &&
                (!best || score > best.score || (score === best.score && w > best.tokensConsumed))) {
                best = { phrase, score, tokensConsumed: w };
            }
        }
    }
    return best;
}
