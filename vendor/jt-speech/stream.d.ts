/**
 * Integration contract: createIntentStream(transcriptEvents) -> intentEvents.
 *
 * Sits between speech recognition and the document matcher:
 *
 *   recognizer --TranscriptEvent--> [jt-speech] --IntentEvent--> matcher/acts
 *
 * Isomorphic — plain iteration, no node-only APIs.
 */
import type { IntentEvent, TranscriptEvent } from "./types.js";
/**
 * Push-style stream for live wiring. Feed recognizer events with push();
 * each FINAL event closes a window and yields intent events. Interim
 * (non-final) events are held — recognizers routinely revise them.
 */
export declare class IntentStream {
    private buffer;
    private interim;
    /** Feed one recognizer event. Returns any intent events now resolvable. */
    push(event: TranscriptEvent): IntentEvent[];
    /** Flush anything held (end of session). */
    flush(): IntentEvent[];
}
/**
 * Pull-style convenience: run a whole sequence of transcript events
 * through the stream and get the ordered intent events back.
 */
export declare function createIntentStream(transcriptEvents: Iterable<TranscriptEvent>): IntentEvent[];
