// jt — spoken command grammar. A final transcript segment either carries a
// command cue or it's plain reading (which drives the glide). Kept tiny and
// forgiving: normalize first, then look for the cue anywhere in the tail of
// the segment so filler words don't break it.

import { normalize } from "./match.js";

/**
 * @param {string} segment  a final transcript segment
 * @returns {{type:string, noteText?:string, evidence:string}|null}
 */
export function parseCommand(segment) {
  const t = normalize(segment);
  if (!t) return null;

  if (/(^|\s)undo( that| this| it)?$/.test(t)) {
    return { type: "undo", evidence: segment.trim() };
  }
  const note = t.match(/(^|\s)(?:note that|note this|add a note(?: saying| that)?|annotate this(?: with)?)\s+(.+)$/);
  if (note) {
    return { type: "note", noteText: note[2].trim(), evidence: segment.trim() };
  }
  if (/(^|\s)highlight (this|that|it)($|\s)/.test(t)) {
    return { type: "highlight", evidence: segment.trim() };
  }
  if (/(^|\s)mark (this |that |it )?(as )?important($|\s)/.test(t)) {
    return { type: "important", evidence: segment.trim() };
  }
  return null;
}
