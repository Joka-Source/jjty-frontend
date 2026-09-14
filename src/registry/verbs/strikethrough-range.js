import {defineVerb,objectArgs} from '../define.js';
export default defineVerb({
  id:'strikethrough-range',spokenForms:[],
  description:'Strike through the complete range between two selected places.',
  argsSchema:objectArgs({fromAnchor:{type:'string'},toAnchor:{type:'string'},markupColor:{type:'string'}},['fromAnchor','toAnchor']),
  recordKinds:['act','intention','proof'],status:'real',testReference:'test/text-markup.test.mjs',
  intentNames:['strikethrough.range'],recordAct:'strikethrough',recordDefault:false,effectVerbId:'strikethrough',historyTitle:'struck through',
  commandFromIntent(event,evidence,confidence){return {type:'range',verbId:'strikethrough-range',fromAnchor:event.args.fromAnchor,toAnchor:event.args.toAnchor,markupColor:event.args.markupColor,evidence,confidence};},
  describeIntent:args=>`strike through from “${args.fromAnchor}” to “${args.toAnchor}”`,
  execute(ctx,args){return ctx.performRange('strikethrough-range',args);},
  recordDescription:({target})=>`strike through the selected range (${target})`,
  recordResult:({target})=>`${target} struck through`,
});
