/**
 * jt-speech core types.
 * Isomorphic: no node-only APIs anywhere in src/.
 */
/** One recognized word, optionally with recognizer timestamps (ms). */
export interface TranscriptWord {
    text: string;
    /** start time in ms, if the recognizer provides word timing */
    tStart?: number;
    /** end time in ms */
    tEnd?: number;
}
/**
 * One event from the speech recognizer. Either a plain text chunk or
 * word-level detail with timing. `final` marks recognizer-final results;
 * non-final (interim) events may be revised by later events.
 */
export interface TranscriptEvent {
    text: string;
    words?: TranscriptWord[];
    tStart?: number;
    tEnd?: number;
    final?: boolean;
}
export type SpanKind = "READING" | "COMMAND";
/** A contiguous span of the rolling transcript with a classification. */
export interface Span {
    kind: SpanKind;
    text: string;
    /** token index range [start, end) into the segmented token stream */
    startToken: number;
    endToken: number;
    tStart?: number;
    tEnd?: number;
}
export type IntentName = "highlight.this" | "highlight.range" | "annotate.this" | "mark.important" | "send.to" | "undo" | "acts.show" | "document.open" | "document.return";
export interface HighlightThisArgs {
    /** deictic target: whatever the matcher's cursor currently covers */
    target: "current";
}
export interface HighlightRangeArgs {
    fromAnchor: string;
    toAnchor: string;
}
export interface AnnotateThisArgs {
    note: string;
}
export interface MarkImportantArgs {
    target: "current";
}
export interface SendToArgs {
    recipient: string;
}
export interface OpenDocumentArgs {
    documentName: string;
}
export interface ReturnDocumentArgs {
    documentName?: string;
}
export type IntentArgs = HighlightThisArgs | HighlightRangeArgs | AnnotateThisArgs | MarkImportantArgs | SendToArgs | OpenDocumentArgs | ReturnDocumentArgs | Record<string, never>;
/** A single resolved parse of a command span. */
export interface IntentResult {
    type: "intent";
    intent: IntentName;
    args: IntentArgs;
    /** 0..1 — how sure the parser is of THIS parse */
    confidence: number;
    sourceSpan: Span;
}
/** A span the segmenter classified as reading (to be matched to the document). */
export interface ReadingResult {
    type: "reading";
    sourceSpan: Span;
}
export type Candidate = IntentResult | ReadingResult;
/**
 * First-class ambiguity: two or more parses were plausible and close.
 * The consumer must disambiguate (ask, or use document context) —
 * the parser never silently guesses.
 */
export interface AmbiguousResult {
    type: "ambiguous";
    /** ordered best-first; may include a reading alternative */
    candidates: Candidate[];
    sourceSpan: Span;
    reason: string;
}
export type IntentEvent = IntentResult | ReadingResult | AmbiguousResult;
