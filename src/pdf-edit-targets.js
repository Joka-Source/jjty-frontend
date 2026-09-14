/** Map native PDF coordinates through the inspected page transform into CSS percentages. */
export function paragraphTargetRect(paragraph,{pageBounds,transform}){
 const {x,top,w,h}=paragraph?.nativeBox??paragraph?.box??{},b=pageBounds,t=transform;
 if(![x,top,w,h].every(Number.isFinite)||w<=0||h<=0||!Array.isArray(b)||b.length!==4||!b.every(Number.isFinite)||!Array.isArray(t)||t.length!==6||!t.every(Number.isFinite)||b[2]<=b[0]||b[3]<=b[1]||Math.abs(t[0]*t[3]-t[1]*t[2])<1e-10)return null;
 const quad=paragraph?.nativeQuad;
 if(quad!==undefined&&(!Array.isArray(quad)||quad.length!==8||!quad.every(Number.isFinite)))return null;
 const corners=quad?Array.from({length:4},(_,i)=>quad.slice(i*2,i*2+2)):[[x,top-h],[x+w,top-h],[x,top],[x+w,top]];
 const points=corners.map(([px,py])=>[t[0]*px+t[2]*py+t[4],t[1]*px+t[3]*py+t[5]]);
 const left=Math.min(...points.map(p=>p[0])),right=Math.max(...points.map(p=>p[0])),upper=Math.min(...points.map(p=>p[1])),lower=Math.max(...points.map(p=>p[1]));
 if(left<b[0]-.01||upper<b[1]-.01||right>b[2]+.01||lower>b[3]+.01)return null;
 return {left:100*(left-b[0])/(b[2]-b[0]),top:100*(upper-b[1])/(b[3]-b[1]),width:100*(right-left)/(b[2]-b[0]),height:100*(lower-upper)/(b[3]-b[1])};
}

export function initPdfEditTargets({root,onChoose}){
 let layer=null,page=null,canvas=null,disposed=false,currentModel=null,currentPageIndex=null;
 function clear(){layer?.remove();layer=null;page=null;canvas=null;currentModel=null;currentPageIndex=null;}
 const observer=new MutationObserver(()=>{if(layer&&(!root.contains(page)||page.querySelector(':scope > .pdf-canvas')!==canvas))clear();});
 observer.observe(root,{childList:true,subtree:true});
 function show({pageIndex,model,selectedId,disabled=false}){
  if(layer&&currentModel===model&&currentPageIndex===pageIndex&&root.contains(page)&&page.querySelector(':scope > .pdf-canvas')===canvas){
   for(const button of layer.children){button.disabled=!!disabled;button.setAttribute('aria-pressed',String(button.dataset.paragraphId===String(selectedId)));}return;
  }
  clear();if(disposed||!Number.isSafeInteger(pageIndex)||pageIndex<0)return;
  const target=root.querySelector(`.pdf-page[data-page="${pageIndex+1}"]`),source=target?.querySelector(':scope > .pdf-canvas');if(!source)return;
  page=target;canvas=source;currentModel=model;currentPageIndex=pageIndex;layer=document.createElement('div');layer.className='pdf-edit-targets';layer.setAttribute('role','group');layer.setAttribute('aria-label',`Editable paragraphs on page ${pageIndex+1}`);
  for(const paragraph of model?.paragraphs??[]){
   const text=paragraph.runs?.map(run=>run.text??'').join('').trim();if(!paragraph.editable||paragraph.lockReason||!text)continue;
   const rect=paragraphTargetRect(paragraph,model);if(!rect)continue;
   const button=document.createElement('button');button.type='button';button.className='pdf-edit-target';button.dataset.paragraphId=String(paragraph.id);button.dataset.pageIndex=String(pageIndex);button.setAttribute('aria-label',`Edit paragraph: ${text.slice(0,180)}`);button.setAttribute('aria-pressed',String(paragraph.id===selectedId));button.disabled=!!disabled;
   for(const [property,value]of Object.entries(rect))button.style[property]=`${value}%`;
   if(paragraph.nativeQuad){
    const t=model.transform,b=model.pageBounds,q=paragraph.nativeQuad;
    const points=Array.from({length:4},(_,i)=>{const x=q[i*2],y=q[i*2+1];return [(100*(t[0]*x+t[2]*y+t[4]-b[0])/(b[2]-b[0])-rect.left)/rect.width*100,(100*(t[1]*x+t[3]*y+t[5]-b[1])/(b[3]-b[1])-rect.top)/rect.height*100];});
    button.classList.add('pdf-edit-target-quad');button.style.clipPath=`polygon(${points.map(p=>`${p[0]}% ${p[1]}%`).join(',')})`;
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),polygon=document.createElementNS('http://www.w3.org/2000/svg','polygon');svg.setAttribute('viewBox','0 0 100 100');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('aria-hidden','true');polygon.setAttribute('points',points.map(p=>p.join(',')).join(' '));polygon.setAttribute('vector-effect','non-scaling-stroke');svg.append(polygon);button.append(svg);
   }
   button.addEventListener('click',()=>{if(!button.disabled&&layer?.contains(button))onChoose(paragraph);});layer.append(button);
  }
  target.append(layer);
 }
 return {show,clear,dispose(){disposed=true;observer.disconnect();clear();}};
}
