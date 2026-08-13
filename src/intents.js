// jt — speech intent adapter. The ad-hoc command grammar is gone: every
// final transcript segment goes through jt-speech's IntentStream, which
// classifies reading vs command and parses commands into typed intents —
// with ambiguity as a first-class result. This module maps those intents
// onto jt-web's act vocabulary and describes candidates in plain words for
// the "did you mean…" prompt. It never guesses: an ambiguous event is
// returned as {type:"ask"} and the app must ask the person.

import { IntentStream } from "../vendor/jt-speech/index.js";

export { IntentStream };

/** jt-speech intent name -> jt-web act name (for single-block acts). */
export const INTENT_TO_ACT = {
  "highlight.this": "highlight",
  "annotate.this": "note",
  "mark.important": "important",
};

/**
 * Map one jt-speech IntentEvent to an app-level command.
 * @returns one of:
 *   {type:"act", act, noteText?, evidence, confidence}
 *   {type:"range", fromAnchor, toAnchor, evidence, confidence}
 *   {type:"undo", evidence}
 *   {type:"show", evidence}
 *   {type:"open", documentName, evidence}
 *   {type:"return", documentName?, evidence}
 *   {type:"send", recipient, evidence}
 *   {type:"ask", candidates, reason, evidence}   // ambiguity — must ask
 *   {type:"reading", text}
 */
export function toCommand(ev) {
  if (ev.type === "reading") {
    return { type: "reading", text: ev.sourceSpan.text };
  }
  if (ev.type === "ambiguous") {
    return {
      type: "ask",
      candidates: ev.candidates,
      reason: ev.reason,
      evidence: ev.sourceSpan.text,
    };
  }
  const evidence = ev.sourceSpan.text;
  const confidence = ev.confidence;
  switch (ev.intent) {
    case "highlight.this":
      return { type: "act", act: "highlight", evidence, confidence };
    case "mark.important":
      return { type: "act", act: "important", evidence, confidence };
    case "annotate.this":
      return { type: "act", act: "note", noteText: ev.args.note ?? "", evidence, confidence };
    case "highlight.range":
      return {
        type: "range",
        fromAnchor: ev.args.fromAnchor,
        toAnchor: ev.args.toAnchor,
        evidence,
        confidence,
      };
    case "undo":
      return { type: "undo", evidence };
    case "acts.show":
      return { type: "show", evidence };
    case "document.open":
      return { type: "open", documentName: ev.args.documentName ?? "", evidence };
    case "document.return":
      return { type: "return", documentName: ev.args.documentName ?? "", evidence };
    case "send.to":
      return { type: "send", recipient: ev.args.recipient ?? "", evidence };
    default:
      return { type: "reading", text: evidence };
  }
}

/** Plain-words label for a disambiguation candidate ("did you mean…"). */
export function describeCandidate(cand) {
  if (cand.type === "reading") return "nothing — I was just reading";
  switch (cand.intent) {
    case "highlight.this":
      return "highlight this block";
    case "mark.important":
      return "mark this block important";
    case "annotate.this":
      return `add the note “${cand.args.note ?? ""}”`;
    case "highlight.range":
      return `highlight from “${cand.args.fromAnchor}” to “${cand.args.toAnchor}”`;
    case "undo":
      return "undo the last act";
    case "acts.show":
      return "show what you have done";
    case "document.open":
      return `open “${cand.args.documentName ?? ""}”`;
    case "document.return":
      return cand.args.documentName
        ? `go back to “${cand.args.documentName}”`
        : "go back to where I was";
    case "send.to":
      return `send this to “${cand.args.recipient ?? ""}”`;
    default:
      return cand.intent;
  }
}
