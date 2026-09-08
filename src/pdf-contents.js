// A document-owned contents surface. Destinations are local pages supplied by
// the engine adapter; titles are always rendered as text, never HTML or URLs.
export function initPdfContents({onNavigate,getPlace,onReturn,sharedReturn=false}) {
  const panel=document.getElementById('pdf-contents'),list=document.getElementById('pdf-contents-list'),status=document.getElementById('pdf-contents-status'),back=document.getElementById('pdf-contents-back');
  let generation=0,source=null,previous=null;back.hidden=sharedReturn;
  back.addEventListener('click',()=>{
    if(!source || !previous)return;
    if(onReturn(previous,source)!==false){previous=null;back.disabled=true;status.textContent='Returned to your reading place.';}
  });
  function rows(items,parent,version,owner){
    for(const item of items){
      const li=document.createElement('li'),row=document.createElement('div');row.className='pdf-contents-row';
      const label=item.title || 'Untitled bookmark';
      if(item.children.length){
        const toggle=document.createElement('button');toggle.type='button';toggle.className='pdf-contents-toggle';
        const children=document.createElement('ol');children.hidden=!item.open;
        const update=()=>{toggle.textContent=children.hidden?'▸':'▾';toggle.setAttribute('aria-expanded',String(!children.hidden));toggle.setAttribute('aria-label',`${children.hidden?'Expand':'Collapse'} ${label}`);};
        toggle.addEventListener('click',()=>{children.hidden=!children.hidden;update();});update();row.append(toggle);
        rows(item.children,children,version,owner);li.append(row,children);
      }else li.append(row);
      const button=document.createElement('button');button.type='button';button.className='pdf-contents-target';button.textContent=label;button.disabled=item.pageNumber===null;
      if(item.pageNumber!==null){
        const page=document.createElement('span');page.className='pdf-contents-page';page.textContent=`Page ${item.pageNumber}`;button.append(page);
        button.addEventListener('click',async()=>{
          if(version!==generation || source!==owner)return;
          const place=sharedReturn?null:previous ?? getPlace(owner);
          try{let result=onNavigate(item.pageNumber,owner);if(result?.then)result=await result;if(version!==generation||source!==owner)return;if(result!==false){previous=previous??place;back.disabled=!previous;status.textContent=`Opened page ${item.pageNumber}.`;}}catch(error){if(version===generation&&source===owner)status.textContent=error.message||'This page could not be opened.';}
        });
      }else button.title='This bookmark has no supported local page destination.';
      row.append(button);parent.append(li);
    }
  }
  return {async setSource(next){
    const version=++generation;source=next;previous=null;back.disabled=true;list.replaceChildren();panel.open=false;panel.hidden=!next;
    if(!next){status.textContent='';return;}
    status.textContent='Loading contents…';
    try{
      const items=await next.readContents?.();
      if(version!==generation || source!==next)return;
      if(!items?.length){status.textContent='This PDF has no readable bookmarks.';return;}
      rows(items,list,version,next);status.textContent='Choose a bookmark to move within this PDF.';
    }catch{if(version===generation && source===next)status.textContent='Contents could not be read. You can still read and search this PDF.';}
  }};
}
