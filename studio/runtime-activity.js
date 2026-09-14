import {esc,icon} from './screens.js';
let current=null, counter=0, host=null, expanded=false;
const listeners=new Set();
export const documentActivity={
  begin(title,detail=''){const id=++counter;current={id,phase:'working',title,detail};paint();return id;},
  finish(id,title,detail=''){if(current?.id===id){current={id,phase:'complete',title,detail};paint();}},
  fail(id,title,detail=''){if(current?.id===id){current={id,phase:'error',title,detail};paint();}},
  waiting(id,title,detail=''){if(current?.id===id){current={id,phase:'waiting',title,detail};paint();}},
  collapse(){expanded=false;paint();},
  snapshot(){return current?{...current}:null;},
  subscribe(callback){listeners.add(callback);return()=>listeners.delete(callback);},
};
export function activityView(){return '<div id="real-runtime-activity" class="real-runtime-activity"></div>';}
export function mountActivity(target){host=target;paint();}
function paint(){
  for(const callback of listeners)callback(documentActivity.snapshot());
  const target=host?.querySelector('#real-runtime-activity');if(!target)return;
  if(!current){target.innerHTML='';return;}
  const c=current;
  target.innerHTML=`<button class="real-activity-capsule" data-phase="${c.phase}" aria-label="${esc(c.title)}. ${expanded?'Hide':'Show'} activity details" aria-expanded="${expanded}" aria-controls="real-activity-detail"><span class="real-activity-symbol">${icon(c.phase==='complete'?'check':c.phase==='error'?'close':'clock')}</span><span role="status" aria-live="polite">${esc(c.title)}</span>${icon('chevron')}</button><div id="real-activity-detail" ${expanded?'':'hidden'}><p>${esc(c.detail||c.title)}</p><small>${c.phase==='working'?'Working on this device':c.phase==='waiting'?'Waiting for your choice':c.phase==='error'?'Action needed':'Completed on this device'}</small></div>`;
  target.querySelector('button').onclick=()=>{expanded=!expanded;paint();target.querySelector('button').focus({preventScroll:true});};
}
