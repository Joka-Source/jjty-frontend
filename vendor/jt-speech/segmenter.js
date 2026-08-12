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
import { matchPhraseAt, normalize, phraseSimilarity } from "./fuzzy.js";
import { DEICTIC_WORDS, LEADING_MARKERS, LEXICON, RANGE_FROM, RANGE_TO, } from "./lexicon.js";
/** Pause (ms) before a word that suggests a segment boundary. */
const PAUSE_BOUNDARY_MS = 600;
/** Pause (ms) that ends free text (a spoken note, an anchor, a name). */
const PAUSE_END_MS = 700;
/** Emit as a single confident intent at/above this confidence... */
const CONFIDENT = 0.7;
/** ...provided the runner-up is at least this far behind. */
const MARGIN = 0.12;
/** Below this, a candidate is discarded and the span stays READING. */
const FLOOR = 0.5;
const FILLER_AFTER_TRIGGER = new Set(["please", "kindly", "just", "now", "only", "here"]);
const NOTE_LEADINS = new Set(["that", "saying", "colon"]);
/** Tokenize a plain string into TranscriptWords (no timing). */
export function tokenize(text) {
    return normalize(text)
        .split(" ")
        .filter((w) => w.length > 0)
        .map((text) => ({ text }));
}
function pauseBefore(words, i) {
    if (i <= 0)
        return undefined;
    const prev = words[i - 1];
    const curr = words[i];
    if (prev.tEnd === undefined || curr.tStart === undefined)
        return undefined;
    return curr.tStart - prev.tEnd;
}
function makeSpan(words, start, end, kind) {
    return {
        kind,
        text: words.slice(start, end).map((w) => w.text).join(" "),
        startToken: start,
        endToken: end,
        tStart: words[start]?.tStart,
        tEnd: words[end - 1]?.tEnd,
    };
}
/** Find where free text (note/name/anchor) ends: next long pause or end. */
function freeTextEnd(words, start, cap) {
    const hardEnd = cap !== undefined ? Math.min(words.length, start + cap) : words.length;
    for (let i = start + 1; i < hardEnd; i++) {
        const p = pauseBefore(words, i);
        if (p !== undefined && p >= PAUSE_END_MS)
            return i;
    }
    return hardEnd;
}
function tokenIs(word, options, threshold = 0.85) {
    if (!word)
        return false;
    return options.some((o) => phraseSimilarity(word.text, o) >= threshold);
}
function skipFillers(words, i) {
    while (i < words.length && FILLER_AFTER_TRIGGER.has(words[i].text))
        i++;
    return i;
}
function score(ev, extras) {
    let c = ev.base;
    if (ev.marker)
        c += 0.15;
    if (ev.pause)
        c += 0.12;
    if (ev.atStart)
        c += 0.05;
    if (extras.deictic)
        c += 0.15;
    if (extras.complete)
        c += 0.15;
    // grammar didn't fully resolve (e.g. bare "highlight" with no deictic and
    // no range) — strong pull toward "this was just reading"
    if (extras.incomplete)
        c -= 0.32;
    if (extras.midReading && !ev.pause && !ev.marker)
        c -= 0.15;
    return Math.max(0, Math.min(0.98, c));
}
/**
 * Try to parse a command for `entry` starting at token `pos`
 * (pos is AFTER any leading marker). Returns zero or more candidate parses —
 * more than one when the grammar itself is ambiguous (e.g. multiple "to"
 * split points in a two-anchor highlight).
 */
function parseCommand(entry, words, triggerStart, spanStart, ev) {
    const m = matchPhraseAt(words.map((w) => w.text), triggerStart, entry.triggers, entry.threshold);
    if (!m)
        return [];
    const base = 0.5 + 0.35 * ((m.score - entry.threshold) / (1 - entry.threshold));
    const evidence = { ...ev, base };
    let i = skipFillers(words, triggerStart + m.tokensConsumed);
    const midReading = spanStart > 0;
    const out = [];
    const finish = (intent, args, end, extras) => {
        out.push({
            result: {
                type: "intent",
                intent,
                args,
                confidence: score(evidence, { ...extras, midReading }),
                sourceSpan: makeSpan(words, spanStart, end, "COMMAND"),
            },
            endToken: end,
        });
    };
    switch (entry.intent) {
        case "highlight.this": {
            // range form: highlight from X to Y
            if (tokenIs(words[i], RANGE_FROM)) {
                const anchorStart = i + 1;
                const yEndOverall = freeTextEnd(words, anchorStart);
                // every plausible "to"-connector split is a candidate parse
                for (let t = anchorStart + 1; t < yEndOverall - 1; t++) {
                    if (tokenIs(words[t], RANGE_TO, 0.9)) {
                        const fromAnchor = words.slice(anchorStart, t).map((w) => w.text).join(" ");
                        const toAnchor = words.slice(t + 1, yEndOverall).map((w) => w.text).join(" ");
                        if (fromAnchor && toAnchor) {
                            finish("highlight.range", { fromAnchor, toAnchor }, yEndOverall, { complete: true });
                        }
                    }
                }
                return out;
            }
            // deictic form: highlight this
            const hasDeictic = tokenIs(words[i], DEICTIC_WORDS);
            const end = hasDeictic ? i + 1 : i;
            finish("highlight.this", { target: "current" }, end, {
                deictic: hasDeictic,
                complete: hasDeictic,
                // bare "highlight" with no deictic/range: probably reading
                // ("the report will highlight the risks")
                incomplete: !hasDeictic,
            });
            return out;
        }
        case "annotate.this": {
            if (tokenIs(words[i], DEICTIC_WORDS))
                i++;
            if (words[i] && NOTE_LEADINS.has(words[i].text))
                i++;
            const end = freeTextEnd(words, i);
            const note = words.slice(i, end).map((w) => w.text).join(" ");
            if (!note)
                return out;
            finish("annotate.this", { note }, end, { complete: true });
            return out;
        }
        case "mark.important": {
            finish("mark.important", { target: "current" }, i, { complete: true });
            return out;
        }
        case "send.to": {
            const end = freeTextEnd(words, i, 4);
            const recipient = words.slice(i, end).map((w) => w.text).join(" ");
            if (!recipient)
                return out;
            finish("send.to", { recipient }, end, { complete: true });
            return out;
        }
        case "undo": {
            finish("undo", {}, i, { complete: true });
            return out;
        }
        case "acts.show": {
            finish("acts.show", {}, i, { complete: true });
            return out;
        }
        case "document.open": {
            // "open" is common in prose ("open the door"), so demand evidence:
            // an explicit "document"/"file" word, or a leading marker. Otherwise
            // the parse is marked incomplete and lands in the ambiguous zone.
            let usedDocWord = /document|file/.test(m.phrase);
            if (!usedDocWord) {
                if (words[i] && words[i].text === "the")
                    i++;
                if (words[i] && (words[i].text === "document" || words[i].text === "file")) {
                    usedDocWord = true;
                    i++;
                }
            }
            const end = freeTextEnd(words, i, 6);
            const documentName = words.slice(i, end).map((w) => w.text).join(" ");
            if (!documentName)
                return out;
            const strong = usedDocWord || ev.marker;
            finish("document.open", { documentName }, end, {
                complete: strong,
                incomplete: !strong,
            });
            return out;
        }
    }
    return out;
}
/**
 * Segment a window of transcript words into reading spans and intent events.
 * Pure function over one window; `IntentStream` handles the rolling buffer.
 */
export function segmentAndParse(words) {
    const events = [];
    let readingStart = 0;
    let i = 0;
    const flushReading = (upto) => {
        if (upto > readingStart) {
            events.push({
                type: "reading",
                sourceSpan: makeSpan(words, readingStart, upto, "READING"),
            });
        }
    };
    while (i < words.length) {
        // leading marker? ("jt, highlight this") — optional, boosts confidence
        let triggerStart = i;
        let marker = false;
        const texts = words.map((w) => w.text);
        const markerMatch = matchPhraseAt(texts, i, LEADING_MARKERS, 0.85);
        if (markerMatch && i + markerMatch.tokensConsumed < words.length) {
            marker = true;
            triggerStart = i + markerMatch.tokensConsumed;
        }
        const p = pauseBefore(words, i);
        const ev = {
            base: 0,
            marker,
            pause: p !== undefined && p >= PAUSE_BOUNDARY_MS,
            atStart: i === 0,
        };
        let candidates = [];
        for (const entry of LEXICON) {
            candidates = candidates.concat(parseCommand(entry, words, triggerStart, i, ev));
        }
        candidates = candidates
            .filter((c) => c.result.confidence >= FLOOR)
            .sort((a, b) => b.result.confidence - a.result.confidence);
        if (candidates.length === 0) {
            i++;
            continue;
        }
        const best = candidates[0];
        const second = candidates[1];
        const distinctSecond = second &&
            (second.result.intent !== best.result.intent ||
                JSON.stringify(second.result.args) !== JSON.stringify(best.result.args));
        if (best.result.confidence >= CONFIDENT &&
            (!distinctSecond || best.result.confidence - second.result.confidence >= MARGIN)) {
            flushReading(i);
            events.push(best.result);
            readingStart = i = best.endToken;
            continue;
        }
        // plausible but not certain — first-class ambiguity, never a silent guess
        flushReading(i);
        const alts = [];
        for (const c of candidates.slice(0, 3))
            alts.push(c.result);
        let reason = "close competing parses";
        if (best.result.confidence < CONFIDENT) {
            // the span might just be reading
            alts.push({
                type: "reading",
                sourceSpan: makeSpan(words, i, best.endToken, "READING"),
            });
            reason = "command-like phrase inside reading flow";
        }
        events.push({
            type: "ambiguous",
            candidates: alts,
            sourceSpan: makeSpan(words, i, best.endToken, "COMMAND"),
            reason,
        });
        readingStart = i = best.endToken;
    }
    flushReading(words.length);
    return events;
}
