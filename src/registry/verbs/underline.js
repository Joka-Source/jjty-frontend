import {targetedVerb,objectArgs} from '../define.js';
import {applyInlineHighlight,removeInlineHighlight} from '../../highlight.js';
export default targetedVerb({
  id:'underline',spokenForms:['underline this','underline that'],
  description:'Mark the selected words with underline.',
  argsSchema:objectArgs({blockIndex:{type:'integer',minimum:0},markupColor:{type:'string'}}),
  recordKinds:['act','intention','proof'],status:'real',testReference:'test/text-markup.test.mjs',
  intentArgs:args=>({markupColor:args.markupColor}),
  intentNames:['underline.this'],recordAct:'underline',historyTitle:'underlined',
  describeIntent:()=>'underline the selected words',
  recordDescription:({target})=>`underline the selected text (${target})`,
  recordResult:({target})=>`${target} underlined`,
  applyEffect(block,entry){
    const resolved=entry.resolvedSegments?.find(segment=>segment.blockIndex===Number(block.dataset.block))??entry.resolvedAnchor;
    if(resolved&&resolved.blockIndex===Number(block.dataset.block)&&['exact','refound'].includes(entry.arrival))
      applyInlineHighlight(block,entry.id,resolved.tokenStart,resolved.tokenEnd,{act:'underline',markupColor:entry.markupColor});
  },
  reverseEffect(block,entry){removeInlineHighlight(block,entry.id);},
});
