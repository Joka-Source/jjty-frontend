/** Shared local text-markup semantics. Style stays on the durable act wrapper. */
export const TEXT_MARKUP_ACTS=Object.freeze(['highlight','underline','strikethrough']);
export const isTextMarkup=act=>TEXT_MARKUP_ACTS.includes(act);
export const isTextMarkupRangeVerb=id=>TEXT_MARKUP_ACTS.some(act=>id===`${act}-range`);
export const MARKUP_COLORS=Object.freeze([
  {id:'yellow',label:'Yellow',rgb:[1,.85,0]},
  {id:'green',label:'Green',rgb:[.2,.75,.35]},
  {id:'blue',label:'Blue',rgb:[.2,.55,1]},
  {id:'pink',label:'Pink',rgb:[1,.35,.65]},
  {id:'red',label:'Red',rgb:[.9,.2,.2]},
].map(color=>Object.freeze({...color,rgb:Object.freeze(color.rgb)})));
export const MARKUP_OPACITY=.4;
export function normalizeMarkupColor(value){
  if(value==null)return 'yellow';
  if(typeof value!=='string'||!MARKUP_COLORS.some(color=>color.id===value))throw new TypeError('Invalid text markup color.');
  return value;
}
export function markupColorRgb(value){return MARKUP_COLORS.find(color=>color.id===normalizeMarkupColor(value)).rgb;}
