/** One set of reader controls, compactly presented on narrow screens. */
export function initReaderCompactTools({read,layout=()=>{}}){
  const toolbar=document.getElementById('reader-toolbar'),narrow=matchMedia('(max-width:900px)');
  const trigger=document.createElement('button');trigger.type='button';trigger.id='reader-view-toggle';trigger.textContent='View';trigger.setAttribute('aria-controls','reader-view-popover');trigger.setAttribute('aria-expanded','false');
  const popup=document.createElement('div');popup.id='reader-view-popover';popup.popover='auto';popup.setAttribute('role','dialog');popup.setAttribute('aria-label','Document view controls');
  popup.innerHTML='<header><strong>View</strong><button type="button" id="reader-view-close">Close</button></header><div id="reader-view-controls"><section id="reader-view-zoom" aria-label="Zoom"></section><section id="reader-view-navigation" aria-label="Page navigation"></section><section id="reader-view-document" aria-label="Document actions"></section><section id="reader-view-more" aria-label="More tools"></section></div>';
  toolbar.prepend(trigger);toolbar.append(popup);
  const anchors=new Map();let compact=false,owner=null,frame=0;
  function isOpen(){return popup.matches(':popover-open');}
  function close(focus=false){if(!isOpen())return;popup.hidePopover();if(focus&&!trigger.hidden)trigger.focus({preventScroll:true});}
  function relocate(node,destination){if(!node)return;if(!anchors.has(node)){const anchor=document.createComment('reader-control-home');node.before(anchor);anchors.set(node,anchor);}if(node.parentElement!==destination)destination.append(node);}
  function moveControls(){
    const groups=[['.pdf-zoom','reader-view-zoom'],['#reader-page-navigation','reader-view-navigation'],['#doc-head','reader-view-document'],['#reader-more-tools','reader-view-more']];
    if(compact)for(const [selector,id]of groups)relocate(document.querySelector(selector),document.getElementById(id));
    else for(const [node,anchor]of anchors)if(anchor.isConnected&&node.previousSibling!==anchor)anchor.after(node);
  }
  function position(){const rect=trigger.getBoundingClientRect();popup.style.setProperty('--reader-view-top',`${Math.min(rect.bottom+8,innerHeight-180)}px`);}
  function refresh(){
    const state=read(),nextOwner=state?.owner??null;
    if(nextOwner!==owner){close(false);owner=nextOwner;}
    const active=!!owner&&document.body.dataset.view==='read';trigger.hidden=!compact||!active;
    if(!active)close(false);moveControls();
    document.getElementById('reader-view-zoom').hidden=!state?.isPdf;document.getElementById('reader-view-navigation').hidden=!state?.isPdf;
    const page=state?.page,total=state?.total;
    const label=state?.isPdf&&page&&total?`View · ${page}/${total}`:'View';if(trigger.textContent!==label)trigger.textContent=label;
    trigger.setAttribute('aria-label',state?.isPdf&&page&&total?`View controls, page ${page} of ${total}`:'View controls');
    if(isOpen())position();
  }
  function syncBreakpoint(){
    if(compact===narrow.matches){refresh();return;}
    layout({phase:'before'});
    const focused=popup.contains(document.activeElement)?document.activeElement:null;close(false);
    compact=narrow.matches;toolbar.dataset.compact=String(compact);moveControls();refresh();
    if(focused?.isConnected&&!compact&&focused.getClientRects().length)focused.focus({preventScroll:true});
    layout({phase:'after'});
  }
  trigger.addEventListener('pointerdown',event=>event.preventDefault());
  popup.addEventListener('pointerdown',event=>{if(event.target.closest('button,summary'))event.preventDefault();});
  trigger.addEventListener('click',()=>{if(isOpen()){close(true);return;}refresh();if(trigger.hidden)return;position();popup.showPopover();popup.querySelector('#reader-view-close').focus({preventScroll:true});});
  popup.querySelector('#reader-view-close').addEventListener('click',()=>close(true));
  popup.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);}});
  popup.addEventListener('toggle',()=>{trigger.setAttribute('aria-expanded',String(isOpen()));});
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;refresh();});};
  new MutationObserver(schedule).observe(toolbar,{childList:true,subtree:true});
  new MutationObserver(refresh).observe(document.body,{attributes:true,attributeFilter:['data-view']});
  addEventListener('scroll',schedule,{passive:true});addEventListener('resize',()=>{syncBreakpoint();if(isOpen())position();});
  syncBreakpoint();return {refresh,close};
}
