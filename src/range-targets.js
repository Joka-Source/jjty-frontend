import {tokenizeWithSpans} from './match.js';

// Keep every occurrence, including repeated phrases within the same block.
// A range endpoint must match the complete spoken phrase; never trim it.
export function findRangeTargets(blockTexts, phrase) {
  const query=tokenizeWithSpans(phrase).map(word=>word.token);
  if(!query.length)return [];
  const matches=[];
  for(const [blockIndex,text] of blockTexts.entries()){
    const tokens=tokenizeWithSpans(text);
    for(let start=0;start+query.length<=tokens.length;start++){
      if(!query.every((token,i)=>tokens[start+i].token===token))continue;
      const end=start+query.length-1;
      matches.push({blockIndex,tokenStart:start,tokenEnd:end,quotedText:text.slice(tokens[start].start,tokens[end].end)});
    }
  }
  return matches;
}
