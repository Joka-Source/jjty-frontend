/**
 * Integration contract: createIntentStream(transcriptEvents) -> intentEvents.
 *
 * Sits between speech recognition and the document matcher:
 *
 *   recognizer --TranscriptEvent--> [jt-speech] --IntentEvent--> matcher/acts
 *
 * Isomorphic — plain iteration, no node-only APIs.
 */
import { segmentAndParse, tokenize } from "./segmenter.js";
/**
 * Push-style stream for live wiring. Feed recognizer events with push();
 * each FINAL event closes a window and yields intent events. Interim
 * (non-final) events are held — recognizers routinely revise them.
 */
export class IntentStream {
    constructor() {
        this.buffer = [];
        this.interim = [];
    }
    /** Feed one recognizer event. Returns any intent events now resolvable. */
    push(event) {
        const words = eventWords(event);
        if (event.final === false) {
            this.interim = words;
            return [];
        }
        this.interim = [];
        this.buffer = this.buffer.concat(words);
        // A final event is a recognizer-level boundary: segment what we have.
        const out = segmentAndParse(this.buffer);
        this.buffer = [];
        return out;
    }
    /** Flush anything held (end of session). */
    flush() {
        const words = this.buffer.concat(this.interim);
        this.buffer = [];
        this.interim = [];
        return words.length ? segmentAndParse(words) : [];
    }
}
function eventWords(event) {
    if (event.words && event.words.length)
        return event.words.map((w) => ({ ...w, text: w.text.toLowerCase() }));
    return tokenize(event.text);
}
/**
 * Pull-style convenience: run a whole sequence of transcript events
 * through the stream and get the ordered intent events back.
 */
export function createIntentStream(transcriptEvents) {
    const stream = new IntentStream();
    const out = [];
    for (const e of transcriptEvents)
        out.push(...stream.push(e));
    out.push(...stream.flush());
    return out;
}
