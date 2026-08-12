/**
 * Spoken mathematics -> LaTeX, rule-based v0.
 *
 * Scope (see docs/SPEECH_TO_LATEX_SCOPE.md): numbers, fractions, powers,
 * integrals, Greek letters, roots, and basic operators. No ML, no training,
 * no external data — pure rules over the recognizer transcript.
 *
 * Isomorphic: pure functions only.
 */
export interface SpokenMathResult {
    latex: string;
    /** words that could not be parsed (empty = full parse) */
    unparsed: string[];
}
/**
 * Convert a spoken-math utterance to LaTeX. Rule-based v0.
 * Unknown words are collected in `unparsed` rather than silently dropped.
 */
export declare function spokenMathToLatex(utterance: string): SpokenMathResult;
