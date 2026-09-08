/** Source-page previews; navigation and the Return point belong to the reader. */
export function initReaderPageBrowser({read,navigate: navigatePage}) {
  const trigger=document.createElement('button');
  trigger.type='button'; trigger.id='reader-pages-toggle'; trigger.textContent='Pages';
  trigger.setAttribute('aria-controls','reader-page-browser'); trigger.setAttribute('aria-expanded','false');
  document.getElementById('pdf-tools').append(trigger);
  const panel=document.createElement('dialog'); panel.id='reader-page-browser';
  panel.setAttribute('aria-labelledby','reader-page-browser-title');
  panel.innerHTML='<header><h2 id="reader-page-browser-title">Pages</h2><button type="button" id="reader-page-browser-close" aria-label="Close pages">Close</button></header><div id="reader-page-browser-scroll"><div id="reader-page-browser-contents"></div><ol id="reader-page-thumbnails" aria-label="Document pages"></ol></div><p id="reader-page-browser-status" role="status"></p>';
  document.body.append(panel);
  const scroll=panel.querySelector('#reader-page-browser-scroll'),list=panel.querySelector('ol'),status=panel.querySelector('[role="status"]');
  const contents=document.getElementById('pdf-contents');
  if(contents)panel.querySelector('#reader-page-browser-contents').append(contents);
  const doc=document.getElementById('doc'),narrow=matchMedia('(max-width: 640px)');
  let owner=null,canvases=[],rows=[],observer=null,generation=0,frame=0,busy=false,modal=false;
  const visible=new Set();
  const sourceCanvases=()=>[...doc.querySelectorAll('.pdf-page > .pdf-canvas')];
  function discard(row) {
    const canvas=row.querySelector('canvas');
    if(canvas){canvas.width=0;canvas.height=0;canvas.remove();}
  }
  function stopPreviews(){observer?.disconnect();observer=null;visible.clear();for(const row of rows)discard(row);}
  function paintVisible(){
    if(!panel.open)return;
    const center=scroll.getBoundingClientRect().top+scroll.clientHeight/2;
    const selected=[...visible].sort((a,b)=>Math.abs(a.getBoundingClientRect().top-center)-Math.abs(b.getBoundingClientRect().top-center)).slice(0,12);
    const keep=new Set(selected);
    for(const row of rows)if(!keep.has(row))discard(row);
    for(const row of selected){
      if(row.querySelector('canvas'))continue;
      const source=canvases[Number(row.dataset.index)];
      if(!source?.isConnected||!source.width||!source.height)continue;
      const preview=document.createElement('canvas'),scale=Math.min(1,240/source.width,320/source.height);
      preview.width=Math.max(1,Math.round(source.width*scale));preview.height=Math.max(1,Math.round(source.height*scale));
      preview.className='reader-page-thumbnail';preview.setAttribute('aria-hidden','true');
      try{preview.getContext('2d').drawImage(source,0,0,preview.width,preview.height);row.querySelector('.reader-page-preview').append(preview);}catch{preview.width=0;preview.height=0;}
    }
  }
  function startPreviews(){
    stopPreviews();if(!panel.open)return;
    const version=generation;
    observer=new IntersectionObserver(entries=>{
      if(version!==generation||!panel.open)return;
      for(const entry of entries){if(entry.isIntersecting)visible.add(entry.target);else visible.delete(entry.target);}
      paintVisible();
    },{root:scroll,rootMargin:'80px 0px'});
    for(const row of rows)observer.observe(row);
  }
  function close(restoreFocus=false){
    if(!panel.open)return;
    generation++;stopPreviews();panel.close();trigger.setAttribute('aria-expanded','false');
    if(restoreFocus&&trigger.isConnected&&!trigger.hidden)trigger.focus({preventScroll:true});
    else if(document.activeElement===trigger)trigger.blur();
  }
  function position(){
    const chrome=document.getElementById('reader-chrome');
    const top=Math.min(Math.max(8,chrome?.getBoundingClientRect().bottom||8),innerHeight-180);
    panel.style.setProperty('--page-browser-top',`${Math.max(8,top)}px`);
  }
  function refresh(){
    const state=read(),next=state?sourceCanvases():[];
    trigger.hidden=!state;
    if(owner!==state?.owner){close(false);owner=state?.owner??null;status.textContent='';}
    if(!state){canvases=[];rows=[];list.replaceChildren();return;}
    if(next.length!==canvases.length||next.some((canvas,index)=>canvas!==canvases[index])){
      generation++;stopPreviews();canvases=next;rows=[];list.replaceChildren();
      for(let index=0;index<state.total;index++){
        const row=document.createElement('li');row.dataset.index=String(index);
        const button=document.createElement('button');button.type='button';button.dataset.page=String(index+1);button.dataset.readerPage=String(index+1);button.setAttribute('aria-label',`Page ${index+1}`);
        const preview=document.createElement('span');preview.className='reader-page-preview';preview.setAttribute('aria-hidden','true');
        const source=canvases[index];preview.style.aspectRatio=source?.width&&source.height?`${source.width} / ${source.height}`:'3 / 4';
        const number=document.createElement('span');number.textContent=String(index+1);
        button.append(preview,number);row.append(button);list.append(row);rows.push(row);
        const rowOwner=owner;button.addEventListener('click',()=>{void go(index+1,rowOwner).catch(()=>{});});
      }
      startPreviews();
    }
    for(const row of rows){const button=row.firstElementChild;button.setAttribute('aria-current',Number(button.dataset.page)===state.page?'page':'false');button.disabled=busy;}
    if(panel.open)position();
  }
  async function go(pageNumber,requestedOwner){
    if(busy)return false;
    const state=read();if(!state||state.owner!==requestedOwner)return false;
    const wasOpen=panel.open,wasModal=modal,version=generation;
    busy=true;status.textContent='';refresh();
    try{
      const result=await navigatePage(pageNumber,requestedOwner,{focus:false});
      if(result===false||read()?.owner!==requestedOwner)return false;
      if(wasOpen&&panel.open&&generation===version){
        if(wasModal)close(false);
        status.textContent=`Opened page ${pageNumber}.`;
        if(wasModal){const page=doc.querySelector(`.pdf-page[data-page="${pageNumber}"]`);if(page){page.tabIndex=-1;page.focus({preventScroll:true});}}
      }
      return result;
    }catch(error){if(read()?.owner===requestedOwner&&panel.open)status.textContent=error.message||'This page could not be opened.';throw error;}
    finally{busy=false;refresh();}
  }
  trigger.addEventListener('click',()=>{
    if(panel.open){close(true);return;}
    refresh();if(!read())return;
    modal=narrow.matches;position();status.textContent='';
    if(modal)panel.showModal();else panel.show();
    trigger.setAttribute('aria-expanded','true');startPreviews();
    const current=list.querySelector('[aria-current="page"]');
    if(current)scroll.scrollTop=current.parentElement.offsetTop-scroll.offsetTop;
    panel.querySelector('#reader-page-browser-close').focus({preventScroll:true});
  });
  panel.querySelector('#reader-page-browser-close').addEventListener('click',()=>close(true));
  panel.addEventListener('cancel',event=>{event.preventDefault();close(true);});
  panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);}});
  // Desktop Escape works after a reader control takes focus outside the panel.
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&panel.open&&!modal){event.preventDefault();close(true);}});
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;refresh();});};
  new MutationObserver(schedule).observe(doc,{childList:true,subtree:true});
  addEventListener('scroll',schedule,{passive:true});
  scroll.addEventListener('scroll',paintVisible,{passive:true});
  addEventListener('resize',()=>{if(panel.open&&modal!==narrow.matches)close(true);schedule();});
  refresh();return {refresh,navigate:go};
}
