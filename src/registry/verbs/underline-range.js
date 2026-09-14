import {defineVerb,objectArgs} from '../define.js';
export default defineVerb({
  id:'underline-range',spokenForms:[],
  description:'Underline the complete range between two selected places.',
  argsSchema:objectArgs({fromAnchor:{type:'string'},toAnchor:{type:'string'},markupColor:{type:'string'}},['fromAnchor','toAnchor']),
  recordKinds:['act','intention','proof'],status:'real',testReference:'test/text-markup.test.mjs',
  intentNames:['underline.range'],recordAct:'underline',recordDefault:false,effectVerbId:'underline',historyTitle:'underlined',
  commandFromIntent(event,evidence,confidence){return {type:'range',verbId:'underline-range',fromAnchor:event.args.fromAnchor,toAnchor:event.args.toAnchor,markupColor:event.args.markupColor,evidence,confidence};},
  describeIntent:args=>`underline from “${args.fromAnchor}” to “${args.toAnchor}”`,
  execute(ctx,args){return ctx.performRange('underline-range',args);},
  recordDescription:({target})=>`underline the selected range (${target})`,
  recordResult:({target})=>`${target} underlined`,
});
