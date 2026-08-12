/**
 * Intent segmentation over a rolling transcript.
 *
 * A person reads aloud AND issues commands in the same stream. This module
 * classifies spans as READING (to be matched to the document) vs COMMAND,
 * and parses COMMAND spans into typed intents.
 *
 * Rule-based common-sense layer v0 (founder ruling: rule-based before ML):
 *  - command lexicon with fuzzy matching (tolerates recognizer errors)
 *  - leading-marker detection ("jt, ...") — optional, never required
 *  - pause/boundary heuristics via word timestamps when available
 *
 * Ambiguity is a first-class result: when two parses are plausible the
 * segmenter returns both, explicitly. It never silently guesses
 * ("modally certain, not modally correct").
 */
import type { IntentEvent, TranscriptWord } from "./types.js";
/** Tokenize a plain string into TranscriptWords (no timing). */
export declare function tokenize(text: string): TranscriptWord[];
/**
 * Segment a window of transcript words into reading spans and intent events.
 * Pure function over one window; `IntentStream` handles the rolling buffer.
 */
export declare function segmentAndParse(words: TranscriptWord[]): IntentEvent[];
