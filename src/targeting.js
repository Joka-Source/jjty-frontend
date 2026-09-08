import { TARGET_POLICY } from "./match.js";
import { findRangeTargets } from './range-targets.js';

// Explicitly named words have stronger custody than the reading cursor: no
// fuzzy correction, suffix clipping, proximity preference, or block fallback.
export function decidePhraseTarget(blockTexts, phrase) {
  const candidates = findRangeTargets(blockTexts, phrase).map(target => ({...target, score:1}));
  if (!candidates.length) return {kind:'none'};
  if (candidates.length > 1) return {kind:'ask', reason:'the named words occur more than once', candidates};
  return {kind:'commit', target:candidates[0]};
}

function sameSpan(a, b) {
  return (
    a?.blockIndex === b?.blockIndex &&
    a?.tokenStart === b?.tokenStart &&
    a?.tokenEnd === b?.tokenEnd
  );
}

function candidatesFor(match, policy) {
  const primary = match.target ? { ...match.target, score: match.score } : null;
  const ranked = [...(match.candidates ?? [])]
    .filter((candidate) => candidate.score >= policy.minScore)
    .sort((a, b) => b.score - a.score || a.blockIndex - b.blockIndex);
  if (primary && !ranked.some((candidate) => sameSpan(candidate, primary))) ranked.unshift(primary);
  const unique = [];
  for (const candidate of ranked) {
    if (!unique.some((seen) => sameSpan(seen, candidate) || seen.blockIndex === candidate.blockIndex)) {
      unique.push(candidate);
    }
  }
  return unique.slice(0, 4);
}

export function decideTarget(match, policy = TARGET_POLICY) {
  if (!match?.target || match.score < policy.minScore) return { kind: "none" };
  const candidates = candidatesFor(match, policy);
  const uncertain = match.score < policy.askBelow;
  const alternative = candidates.find(
    (candidate) =>
      candidate.blockIndex !== match.target.blockIndex &&
      match.score - candidate.score <= policy.closeScoreGap,
  );
  if (alternative) {
    return {
      kind: "ask",
      reason: "more than one passage was similarly likely",
      candidates,
    };
  }
  if (uncertain) {
    return {
      kind: "ask",
      reason: "target confidence was uncertain",
      candidates: candidates.length ? candidates : [{ ...match.target, score: match.score }],
    };
  }
  return { kind: "commit", target: { ...match.target, score: match.score } };
}
