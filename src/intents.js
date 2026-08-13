// jt — speech intent adapter. The ad-hoc command grammar is gone: every
// final transcript segment goes through jt-speech's IntentStream, which
// classifies reading vs command and parses commands into typed intents —
// with ambiguity as a first-class result. This module maps those intents
// onto jt-web's act vocabulary and describes candidates in plain words for
// the "did you mean…" prompt. It never guesses: an ambiguous event is
// returned as {type:"ask"} and the app must ask the person.

import { IntentStream } from "../vendor/jt-speech/index.js";
import { verbRegistry } from "./registry/index.js";

export { IntentStream };

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
  const verb = verbRegistry.forIntent(ev.intent);
  if (!verb?.commandFromIntent) return { type: "reading", text: evidence };
  return verb.commandFromIntent(ev, evidence, ev.confidence);
}

/** Plain-words label for a disambiguation candidate ("did you mean…"). */
export function describeCandidate(cand) {
  if (cand.type === "reading") return "nothing — I was just reading";
  const verb = verbRegistry.forIntent(cand.intent);
  if (!verb) return cand.intent;
  return verb.describeIntent?.(cand.args ?? {}) ?? verb.description;
}
