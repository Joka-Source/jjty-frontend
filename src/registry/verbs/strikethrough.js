import {targetedVerb,objectArgs} from '../define.js';
import {applyInlineHighlight,removeInlineHighlight} from '../../highlight.js';
export default targetedVerb({
  id:'strikethrough',spokenForms:['strike through this','strike through that'],
  description:'Mark the selected words with strikethrough.',
  argsSchema:objectArgs({blockIndex:{type:'integer',minimum:0},markupColor:{type:'string'}}),
  recordKinds:['act','intention','proof'],status:'real',testReference:'test/text-markup.test.mjs',
  intentArgs:args=>({markupColor:args.markupColor}),
  intentNames:['strikethrough.this'],recordAct:'strikethrough',historyTitle:'struck through',
  describeIntent:()=>'strike through the selected words',
  recordDescription:({target})=>`strike through the selected text (${target})`,
  recordResult:({target})=>`${target} struck through`,
  applyEffect(block,entry){
    const resolved=entry.resolvedSegments?.find(segment=>segment.blockIndex===Number(block.dataset.block))??entry.resolvedAnchor;
    if(resolved&&resolved.blockIndex===Number(block.dataset.block)&&['exact','refound'].includes(entry.arrival))
      applyInlineHighlight(block,entry.id,resolved.tokenStart,resolved.tokenEnd,{act:'strikethrough',markupColor:entry.markupColor});
  },
  reverseEffect(block,entry){removeInlineHighlight(block,entry.id);},
});
