/**
 * Command lexicon v0 — rule-based common-sense layer.
 * Founder ruling: rule-based before ML.
 *
 * Each entry lists trigger phrases (canonical + common recognizer
 * misrecognitions + Indian English phrasings). Fuzzy matching on top of
 * these handles the long tail of recognizer errors.
 */
import type { IntentName } from "./types.js";
export interface LexiconEntry {
    intent: IntentName;
    /** phrases that can begin this command */
    triggers: string[];
    /** minimum fuzzy similarity to accept a trigger */
    threshold: number;
    /**
     * words like "this/that/it" expected right after the verb for deictic
     * commands; their presence raises confidence, absence lowers it
     */
    deictic?: boolean;
}
/** Optional leading marker — "jt, highlight this". NOT required (zero-click law:
 * speaking is the interface; a wake word is a crutch, not a gate). */
export declare const LEADING_MARKERS: string[];
export declare const DEICTIC_WORDS: string[];
export declare const LEXICON: LexiconEntry[];
/** Range connectors for two-anchor highlight ("from X to Y"). */
export declare const RANGE_FROM: string[];
export declare const RANGE_TO: string[];
