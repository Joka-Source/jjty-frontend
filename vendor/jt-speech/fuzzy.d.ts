/**
 * Fuzzy matching utilities tolerant of recognizer errors.
 * Pure functions, isomorphic.
 */
/** Lowercase, strip punctuation, collapse whitespace. */
export declare function normalize(s: string): string;
/** Levenshtein edit distance (iterative, two-row). */
export declare function editDistance(a: string, b: string): number;
/**
 * Similarity in 0..1 between two phrases, computed on the space-stripped
 * normalized forms so recognizer word-splits ("hi light" vs "highlight")
 * cost nothing.
 */
export declare function phraseSimilarity(a: string, b: string): number;
export interface FuzzyMatch {
    /** which lexicon phrase matched */
    phrase: string;
    /** similarity 0..1 */
    score: number;
    /** how many input tokens the match consumed */
    tokensConsumed: number;
}
/**
 * Try to match any of `phrases` at the start of `tokens`, allowing the
 * phrase to be split or merged across recognizer tokens. Returns the best
 * match at or above `threshold`, else null.
 */
export declare function matchPhraseAt(tokens: string[], start: number, phrases: string[], threshold?: number): FuzzyMatch | null;
