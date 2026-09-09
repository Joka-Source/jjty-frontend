// jt — speech intent adapter. The ad-hoc command grammar is gone: every
// final transcript segment goes through jt-speech's IntentStream, which
// classifies reading vs command and parses commands into typed intents —
// with ambiguity as a first-class result. This module maps those intents
// onto jt-web's act vocabulary and describes candidates in plain words for
// the "did you mean…" prompt. It never guesses: an ambiguous event is
// returned as {type:"ask"} and the app must ask the person.

import { IntentStream as SourceIntentStream } from "../vendor/jt-speech/index.js";
import { verbRegistry } from "./registry/index.js";

// Recognize only complete supported markup commands. Unsupported markup speech
// stays non-actionable rather than becoming a fuzzy Highlight command.
function markupEvents(text) {
  if(!/\b(?:underline|strikethrough|strike\s+through)\b/i.test(text))return null;
  const sourceSpan={text,startToken:0,endToken:text.trim().split(/\s+/).length};
  const match=/^\s*(underline|strikethrough|strike\s+through)\s+(this|that)[.!?]?\s*$/i.exec(text);
  return match?[{type:'intent',intent:`${match[1].toLowerCase()==='underline'?'underline':'strikethrough'}.this`,args:{},confidence:1,sourceSpan}]:[{type:'reading',sourceSpan}];
}

// Keep source spans unchanged, but do not treat a standalone courtesy word
// beside a recognized instruction as document reading that invalidates its target.
export class IntentStream extends SourceIntentStream {
  push(input) {
    // Let the source stream consume the boundary and clear held interim words.
    const events = super.push(input);
    if(input.final===false)return events;
    const text=input.words?.length?input.words.map(word=>word.text).join(' '):input.text??'';
    const markup=markupEvents(text);if(markup)return markup;
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
  flush() {
    const text=this.buffer.concat(this.interim).map(word=>word.text).join(' ');
    const events=super.flush();
    return markupEvents(text)??events;
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
