/**
 * Command lexicon v0 — rule-based common-sense layer.
 * Founder ruling: rule-based before ML.
 *
 * Each entry lists trigger phrases (canonical + common recognizer
 * misrecognitions + Indian English phrasings). Fuzzy matching on top of
 * these handles the long tail of recognizer errors.
 */
/** Optional leading marker — "jt, highlight this". NOT required (zero-click law:
 * speaking is the interface; a wake word is a crutch, not a gate). */
export const LEADING_MARKERS = ["jt", "jaytee", "jay t", "hey jt", "ok jt"];
export const DEICTIC_WORDS = ["this", "that", "it", "these", "those"];
export const LEXICON = [
    {
        intent: "highlight.this",
        // "hi light", "high light", "highlite" are common recognizer splits
        triggers: [
            "highlight",
            "hi light",
            "high light",
            "highlite",
            "highlighted",
            "underline", // users say underline meaning the same act v0 maps it
        ],
        threshold: 0.78,
        deictic: true,
    },
    {
        intent: "annotate.this",
        triggers: [
            "annotate this",
            "annotate",
            "anna tate",
            "add a note",
            "add note",
            "make a note",
            "take a note",
            "put a note",
            "note down", // Indian English
            "note it down",
        ],
        threshold: 0.8,
    },
    {
        intent: "mark.important",
        triggers: [
            "mark this important",
            "mark this as important",
            "mark important",
            "mark as important",
            "this is important",
            "very important this", // Indian English word order
            "mark it important",
        ],
        threshold: 0.82,
    },
    {
        intent: "send.to",
        triggers: ["send this to", "send it to", "send that to", "sent this to", "share this with", "share it with"],
        threshold: 0.82,
    },
    {
        intent: "undo",
        // NB: "under that" / "and do that" deliberately excluded — they appear in
        // ordinary prose far too often to be safe triggers at v0
        triggers: ["undo", "undo that", "undo this", "take that back", "cancel that"],
        threshold: 0.85,
    },
    {
        intent: "acts.show",
        triggers: [
            "show my acts",
            "show me my acts",
            "show my actions",
            "show acts",
            "what have i done",
            "what all have i done", // Indian English
        ],
        threshold: 0.8,
    },
    {
        intent: "document.open",
        triggers: ["open", "open the document", "open document", "open up", "open the file"],
        threshold: 0.86,
    },
];
/** Range connectors for two-anchor highlight ("from X to Y"). */
export const RANGE_FROM = ["from"];
export const RANGE_TO = ["to", "till", "until", "up to", "upto", "two", "too"];
