export const views=['Overview','Journeys','Components','Foundations','References','Readiness'];
export function filterJourneys(items,{query='',domain='All',status='All',favorites=null}={}) {
  const terms=query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return items.filter(j=>(domain==='All'||j.domain===domain)&&(status==='All'||j.status===status)&&(!favorites||favorites.includes(j.id))&&terms.every(t=>`${j.title} ${j.domain} ${j.summary} ${j.steps.join(' ')}`.toLowerCase().includes(t)));
}
export function loadPreferences(storage) {
  try {const value=JSON.parse(storage.getItem('jjty-playground-v1')||'{}');return {theme:value.theme==='dark'?'dark':'light',favorites:Array.isArray(value.favorites)?value.favorites.filter(x=>typeof x==='string'):[],notes:value.notes&&typeof value.notes==='object'&&!Array.isArray(value.notes)?value.notes:{}};}catch{return {theme:'light',favorites:[],notes:{}};}
}
export function parseRoute(hash,ids) {
  try {const [view='Overview',id='']=decodeURIComponent(hash.slice(1)).split('/');return {view:views.includes(view)?view:'Overview',id:view==='Journeys'&&ids.includes(id)?id:''};}catch{return {view:'Overview',id:''};}
}
