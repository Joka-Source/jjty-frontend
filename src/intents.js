// jt — speech intent adapter. The ad-hoc command grammar is gone: every
// final transcript segment goes through jt-speech's IntentStream, which
// classifies reading vs command and parses commands into typed intents —
// with ambiguity as a first-class result. This module maps those intents
// onto jt-web's act vocabulary and describes candidates in plain words for
// the "did you mean…" prompt. It never guesses: an ambiguous event is
// returned as {type:"ask"} and the app must ask the person.

import { IntentStream as SourceIntentStream } from "../vendor/jt-speech/index.js";
import { verbRegistry } from "./registry/index.js";

// Keep source spans unchanged, but do not treat a standalone courtesy word
// beside a recognized instruction as document reading that invalidates its target.
export class IntentStream extends SourceIntentStream {
  push(input) {
    const events = super.push(input);
    // Only reinterpret the incomplete, leading imperative. Existing complete
    // deictic/range commands and compound commands retain the source grammar.
    const phrase = /^\s*highlight\s+(.+?)\s*$/i.exec(input.text ?? '');
    if (phrase && !/^(?:from|this|that|these|those)\b/i.test(phrase[1]) &&
        events.length === 2 && events[0].type === 'ambiguous' &&
        events[0].sourceSpan.text.toLowerCase() === 'highlight' &&
        events[1].type === 'reading') {
      return [{type:'intent', intent:'highlight.phrase', args:{targetPhrase:phrase[1]},
        confidence:1, sourceSpan:{...events[0].sourceSpan,
          text:input.text, endToken:events[1].sourceSpan.endToken}}];
    }
    if (!events.some(event => toCommand(event).type !== 'reading')) return events;
    return events.filter(event => {
      const command = toCommand(event);
      return command.type !== 'reading' || !/^please[,.!?]*$/i.test(command.text.trim());
    });
  }
}

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
  if (ev.type === 'intent' && ev.intent === 'highlight.phrase') {
    // Syntax certainty is not target certainty: the app must resolve the entire
    // named phrase exactly, independently of the previous reading cursor.
    return {type:'act', act:'highlight', verbId:'highlight',
      targetPhrase:ev.args.targetPhrase, evidence:ev.sourceSpan.text, confidence:ev.confidence};
  }
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
