import { TARGET_POLICY, tokenizeWithSpans } from "./match.js";
import { findRangeTargets } from './range-targets.js';

// Explicitly named words have stronger custody than the reading cursor: no
// automatic fuzzy correction, suffix clipping, proximity preference, or block fallback.
export function decidePhraseTarget(blockTexts, phrase) {
  const candidates = findRangeTargets(blockTexts, phrase).map(target => ({...target, score:1}));
  if (!candidates.length) return suggestPhraseTargets(blockTexts, phrase);
  if (candidates.length > 1) return {kind:'ask', reason:'the named words occur more than once', candidates};
  return {kind:'commit', target:candidates[0]};
}

const COMMON_CONTEXT = new Set('this that these those with from have will shall must should would could there their they them then than some such very only also into onto about after before where when what which your ours been were does'.split(' '));
// Deliberately small English spelling/voicing heuristic, not a pronunciation
// model. It can propose lead/late, but can never authorize a corrected edit.
function consonants(word) {
  return word.replace(/[aeiouy]/g, '').replace(/[bdgvz]/g, char => ({b:'p',d:'t',g:'k',v:'f',z:'s'})[char]);
}
function nearWord(a, b) {
  if (!/^[a-z]{4,32}$/.test(a) || !/^[a-z]{4,32}$/.test(b) || Math.abs(a.length-b.length)>2) return false;
  let row = Array.from({length:b.length+1}, (_, i) => i);
  for (let i=1;i<=a.length;i++) {
    const next = [i];
    for (let j=1;j<=b.length;j++) next[j] = Math.min(next[j-1]+1,row[j]+1,row[j-1]+(a[i-1]===b[j-1]?0:1));
    row=next;
  }
  const distance=row[b.length];
  return distance===1 || (distance<=3 && a[0]===b[0] && consonants(a).length>=2 && consonants(a)===consonants(b));
}

function suggestPhraseTargets(blockTexts, phrase) {
  // Bound this optional recovery pass before token allocation/window scanning.
  // Exact search above keeps its existing behavior for larger documents.
  if (String(phrase).length>512) return {kind:'none'};
  let characters=0;
  for (const text of blockTexts) if ((characters+=text.length)>200000) return {kind:'none'};
  const query=tokenizeWithSpans(phrase).map(word=>word.token);
  if (query.length<3 || query.length>12) return {kind:'none'};
  const candidates=[];
  for (const [blockIndex,text] of blockTexts.entries()) {
    const tokens=tokenizeWithSpans(text);
    for (let start=0;start+query.length<=tokens.length;start++) {
      let changed=-1, distinctive=false;
      for (let i=0;i<query.length;i++) {
        if (query[i]===tokens[start+i].token) {
          if (/^[a-z]{4,32}$/.test(query[i]) && !COMMON_CONTEXT.has(query[i])) distinctive=true;
        } else if (changed<0) changed=i;
        else { changed=-2; break; }
      }
      if (changed<0 || !distinctive || !nearWord(query[changed],tokens[start+changed].token)) continue;
      if (candidates.length===8) return {kind:'ask',matchType:'suggestion',reason:'similar source wording needs confirmation',candidates,truncated:true};
      const end=start+query.length-1;
      candidates.push({blockIndex,tokenStart:start,tokenEnd:end,
        quotedText:text.slice(tokens[start].start,tokens[end].end),
        score:Math.min(0.95,(query.length-0.5)/query.length),matchType:'suggestion',
        explanation:`Heard “${query[changed]}”; source says “${tokens[start+changed].text}”. Confirm these source words.`});
    }
  }
  return candidates.length ? {kind:'ask',matchType:'suggestion',reason:'similar source wording needs confirmation',candidates,truncated:false} : {kind:'none'};
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
