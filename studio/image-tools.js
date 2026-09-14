import {inspectEditableImages,editPdfImage} from '../src/pdf-image-editor.js';

const field=(label,name)=>`<label>${label}<input name="image-${name}" type="number" min="0" step="any" required></label>`;
export function imageToolsView(){return `<section class="studio-image-tools" aria-label="Edit an existing PDF image">
 <p data-image-status role="status" aria-live="polite" aria-atomic="true">Finding images…</p>
 <button type="button" data-image-action="inspect" class="image-reinspect">Check this page</button>
 <div data-image-controls hidden>
  <div class="image-context-actions"><span data-image-label>Image</span><button type="button" data-image-action="choose-replacement">Replace</button><button type="button" data-image-action="reset" hidden>Reset</button><button type="button" data-image-action="apply" hidden>Apply</button></div>
  <p class="image-direct-hint">Drag the image to move it. Pull the lower-right corner to resize.</p>
  <details class="image-precision"><summary>Precision & replacement</summary>
   <small data-image-bounds></small>
   <form data-image-form="move"><fieldset><legend>Position</legend><div class="image-tools-fields">${field('From left (pt)','x')}${field('From top (pt)','y')}</div><button type="submit" data-image-action="move">Save moved copy</button></fieldset></form>
   <form data-image-form="resize"><fieldset><legend>Size</legend><div class="image-tools-fields">${field('Width (pt)','width')}${field('Height (pt)','height')}</div><button type="submit" data-image-action="resize">Save resized copy</button></fieldset></form>
   <form data-image-form="replace"><fieldset><legend>Replace image</legend><label>PNG or JPEG<input name="image-file" type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" required></label><p data-image-file>No replacement chosen.</p><p>The new image fills the frame. Choose an image without transparency.</p><button type="submit" data-image-action="replace">Save replaced copy</button></fieldset></form>
 <details class="image-tools-support"><summary>Supported images</summary><p>One opaque image on an unrotated, uncropped page without other artwork. Every change saves a separate PDF; your original stays in the library.</p></details>
  </details>
 </div>
 </section>`;}

const reasons={
 IMAGE_CONTENT_UNSUPPORTED:'This page does not contain a single image by itself. Pages with text, paths or mixed artwork are not supported yet.',
 IMAGE_RESOURCE_UNSUPPORTED:'This page has several image resources or an image that cannot be identified safely.',
 IMAGE_NESTED_UNSUPPORTED:'This PDF contains nested artwork. Its images cannot be edited safely here yet.',
 IMAGE_SHARED_UNSUPPORTED:'This image is shared elsewhere in the PDF. Editing just this occurrence is not supported yet.',
 IMAGE_MASK_UNSUPPORTED:'This image uses a mask or transparency that is not supported yet.',
 IMAGE_PAGE_GEOMETRY_UNSUPPORTED:'This page is rotated, cropped or uses a different coordinate scale. Image editing is not supported on it yet.',
 IMAGE_TRANSFORM_UNSUPPORTED:'This image is rotated, flipped or skewed. Image editing is not supported for that placement yet.',
 IMAGE_DOCUMENT_RESTRICTED:'This PDF has protected content, a signature or document behavior that prevents image editing here.',
 IMAGE_COLOR_UNSUPPORTED:'This image uses a color format that cannot be preserved safely here yet.',
 IMAGE_INTERPOLATION_UNSUPPORTED:'This image uses smoothing settings that cannot be preserved safely here yet.',
 IMAGE_BOUNDS_INVALID:'Choose a position and a positive size that keep the whole image inside the page.',
 IMAGE_BOUNDS_UNSUPPORTED:'The current image extends outside the page or has an unsupported frame.',
 IMAGE_SOURCE_STALE:'The source has changed. Reopen the document before editing its image.',
 IMAGE_TARGET_STALE:'The image target has changed. Inspect the page again.',
 IMAGE_PAGE_INVALID:'Choose a valid physical PDF page, then inspect it again.',
 IMAGE_ALPHA_UNSUPPORTED:'The replacement has transparent pixels. Choose an opaque PNG or JPEG; transparency will not be flattened.',
 IMAGE_PIXEL_LIMIT:'Choose an image with at most 16 million pixels and a file smaller than 64 MB.',
 IMAGE_SOURCE_LIMIT:'This PDF is too large for image editing here. The current limit is 64 MB.',
 IMAGE_REPLACEMENT_FORMAT:'Choose a valid PNG or JPEG image.',
};
function friendly(error){return reasons[error.code]||(/^IMAGE_.*(?:CHANGED|MISMATCH|FAILED|UNVERIFIED)$/.test(error.code||'')?'The edited PDF did not pass its preservation checks. Your original is unchanged.':/^[A-Z][A-Z_]+$/.test(error.message||'')?'This PDF uses a structure that cannot be edited safely here yet.':error.message||'The image could not be edited.');}
function refuse(code){const e=new Error(code);e.code=code;throw e;}
async function replacement(file,doc){
 if(!file||file.size>64*1024*1024)refuse(file?'IMAGE_PIXEL_LIMIT':'IMAGE_REPLACEMENT_FORMAT');
 const header=new Uint8Array(await file.slice(0,12).arrayBuffer());
 const png=[137,80,78,71,13,10,26,10].every((value,i)=>header[i]===value),jpeg=header[0]===255&&header[1]===216&&header[2]===255;
 if(!png&&!jpeg)refuse('IMAGE_REPLACEMENT_FORMAT');
 let bitmap;
 try{
  bitmap=await doc.defaultView.createImageBitmap(file);
  if(bitmap.width*bitmap.height>16000000)refuse('IMAGE_PIXEL_LIMIT');
  const canvas=doc.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
  const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw new Error('Image decoding is unavailable in this browser.');
  context.drawImage(bitmap,0,0);const rgba=context.getImageData(0,0,bitmap.width,bitmap.height).data;
  for(let i=3;i<rgba.length;i+=4)if(rgba[i]!==255)refuse('IMAGE_ALPHA_UNSUPPORTED');
  return {rgba,width:bitmap.width,height:bitmap.height};
 }catch(error){if(error.code)throw error;throw new Error('This image could not be decoded. Choose another PNG or JPEG.');}
 finally{bitmap?.close();}
}

/** getPage returns the physical zero-based page. onStatus receives
 * {status:'working'|'ready'|'saved'|'error',message}. Root owns copy persistence
 * and must guard its navigation after that async save against its editor epoch.
 */
export function mountImageTools({host,source,getPage,createCopy,onStatus=()=>{}}){
 const panel=host?.matches?.('.studio-image-tools')?host:host?.querySelector('.studio-image-tools');
 if(!panel||typeof getPage!=='function'||typeof createCopy!=='function')throw new TypeError('Image tools require a host, current page and copy handler.');
 const raw=source?.sourceBytes;
 if(!(raw instanceof Uint8Array)&&!(raw instanceof ArrayBuffer)&&!(Array.isArray(raw)&&raw.every(n=>Number.isInteger(n)&&n>=0&&n<=255)))throw new TypeError('The original PDF bytes are missing.');
 if((raw.byteLength??raw.length)>64*1024*1024)refuse('IMAGE_SOURCE_LIMIT');
 const snapshot=raw instanceof ArrayBuffer?new Uint8Array(raw.slice(0)):Uint8Array.from(raw),id=String(source.id??''),title=String(source.title||'Document'),revision=source.revision,declaredDigest=source.provenance?.contentDigest;
 if(!id||!snapshot.length)throw new TypeError('The original PDF needs an identity and content.');
 const doc=panel.ownerDocument,win=doc.defaultView,initialHash=win.location.hash,status=panel.querySelector('[data-image-status]'),controls=panel.querySelector('[data-image-controls]');
 let disposed=false,busy=false,generation=0,selected=null,heldPage=null;
 const paper=host.querySelector?.('.real-paper');
 let overlay=null,baseFrame=null,frame=null,pageSize=null,gesture=null,draftOperation=null,fitObserver=null;
 function clearOverlay(){fitObserver?.disconnect();fitObserver=null;overlay?.remove();overlay=null;gesture=null;draftOperation=null;}
 function syncFrame(){
  if(!frame||!overlay)return;
  const [x,y,w,h]=frame,[pw,ph]=pageSize;
  const box=overlay.querySelector('.image-onpage-selection');
  Object.assign(box.style,{left:`${x/pw*100}%`,top:`${y/ph*100}%`,width:`${w/pw*100}%`,height:`${h/ph*100}%`});
  overlay.querySelector('.image-source-cover').hidden=!draftOperation;
  overlay.querySelector('canvas').hidden=!draftOperation;
  for(const [name,value]of Object.entries({x,y,width:w,height:h}))panel.querySelector(`[name="image-${name}"]`).value=String(Math.round(value*100)/100);
  panel.querySelector('[data-image-action="apply"]').hidden=!draftOperation;
  panel.querySelector('[data-image-action="reset"]').hidden=!draftOperation;
  box.setAttribute('aria-label',`Selected image. Left ${Math.round(x)}, top ${Math.round(y)}, width ${Math.round(w)}, height ${Math.round(h)} points. Arrow keys move; Shift moves ten points. Enter applies. Escape resets.`);
 }
 function resetFrame(){if(!baseFrame)return;frame=[...baseFrame];draftOperation=null;syncFrame();}
 function mountOverlay(view){
  clearOverlay();if(!paper)return;
  const [x,y,r,b]=view.images[0].bounds;
  pageSize=[view.pageBounds[2]-view.pageBounds[0],view.pageBounds[3]-view.pageBounds[1]];
  paper.style.setProperty('--image-page-ratio',String(pageSize[0]/pageSize[1]));
  baseFrame=[x,y,r-x,b-y];frame=[...baseFrame];
  overlay=doc.createElement('div');overlay.className='image-onpage-overlay';
  overlay.innerHTML='<div class="image-source-cover" hidden></div><div class="image-onpage-selection" tabindex="0" role="group"><canvas hidden></canvas><span class="image-selection-tag">Image</span><button type="button" class="image-resize-handle" data-corner="nw" aria-label="Resize image from top left"></button><button type="button" class="image-resize-handle" data-corner="ne" aria-label="Resize image from top right"></button><button type="button" class="image-resize-handle" data-corner="sw" aria-label="Resize image from bottom left"></button><button type="button" class="image-resize-handle" data-corner="se" aria-label="Resize image from bottom right. Arrow keys adjust size."></button></div>';
  // The engine supports resizing around the top-left anchor. Only that handle
  // changes size; the other corners remain visible selection affordances.
  for(const handle of overlay.querySelectorAll('[data-corner]:not([data-corner="se"])')){handle.removeAttribute('tabindex');handle.tabIndex=-1;handle.setAttribute('aria-hidden','true');handle.disabled=true;}
  const cover=overlay.querySelector('.image-source-cover');Object.assign(cover.style,{left:`${x/pageSize[0]*100}%`,top:`${y/pageSize[1]*100}%`,width:`${(r-x)/pageSize[0]*100}%`,height:`${(b-y)/pageSize[1]*100}%`});
  const sourceCanvas=paper.querySelector('#real-canvas'),preview=overlay.querySelector('canvas');
  if(sourceCanvas){const sx=sourceCanvas.width/pageSize[0],sy=sourceCanvas.height/pageSize[1];preview.width=Math.max(1,Math.round((r-x)*sx));preview.height=Math.max(1,Math.round((b-y)*sy));preview.getContext('2d').drawImage(sourceCanvas,x*sx,y*sy,(r-x)*sx,(b-y)*sy,0,0,preview.width,preview.height);}
  paper.append(overlay);syncFrame();
  const context=panel.closest('.real-context'),scroll=paper.closest('.real-scroll');
  if(context&&scroll){const fit=()=>{if(!overlay||!pageSize)return;const height=context.getBoundingClientRect().top-scroll.getBoundingClientRect().top-62;paper.style.setProperty('--image-fit-width',`${Math.max(100,height*pageSize[0]/pageSize[1])}px`);};fitObserver=new ResizeObserver(fit);fitObserver.observe(context);fitObserver.observe(scroll);fit();}

  const box=overlay.querySelector('.image-onpage-selection');
  box.addEventListener('pointerdown',event=>{
   if(busy||!alive()||getPage()!==selected?.pageIndex||event.button!==0)return;
   const operation=event.target.closest('[data-corner="se"]')?'resize':'move';
   if(draftOperation&&draftOperation!==operation){report('ready','Apply or reset this change before switching between move and resize.');return;}
   event.preventDefault();box.focus({preventScroll:true});box.setPointerCapture(event.pointerId);
   gesture={pointerId:event.pointerId,x:event.clientX,y:event.clientY,frame:[...frame],operation};
  });
  box.addEventListener('pointermove',event=>{
   if(!gesture||gesture.pointerId!==event.pointerId||busy)return;
   const rect=paper.getBoundingClientRect(),dx=(event.clientX-gesture.x)/rect.width*pageSize[0],dy=(event.clientY-gesture.y)/rect.height*pageSize[1];
   const [x,y,w,h]=gesture.frame;
   if(Math.abs(dx)+Math.abs(dy)<.1)return;
   draftOperation=gesture.operation;
   frame=draftOperation==='move'?[Math.max(0,Math.min(pageSize[0]-w,x+dx)),Math.max(0,Math.min(pageSize[1]-h,y+dy)),w,h]:[x,y,Math.max(1,Math.min(pageSize[0]-x,w+dx)),Math.max(1,Math.min(pageSize[1]-y,h+dy))];
   syncFrame();
  });
  box.addEventListener('pointerup',()=>{if(gesture&&draftOperation)report('ready','Preview ready. Apply to save a separate PDF.');gesture=null;});
  box.addEventListener('pointercancel',()=>{gesture=null;resetFrame();});
  box.addEventListener('keydown',event=>{
   if(busy||!alive()||getPage()!==selected?.pageIndex)return;
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();resetFrame();return;}
   if(event.key==='Enter'&&draftOperation){event.preventDefault();void apply(draftOperation,panel.querySelector(`[data-image-form="${draftOperation}"]`));return;}
   const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];if(!delta)return;
   event.preventDefault();const operation=event.target.closest('[data-corner="se"]')?'resize':'move';
   if(draftOperation&&draftOperation!==operation){report('ready','Apply or reset this change first.');return;}
   draftOperation=operation;const n=event.shiftKey?10:1,[x,y,w,h]=frame;
   frame=operation==='move'?[Math.max(0,Math.min(pageSize[0]-w,x+delta[0]*n)),Math.max(0,Math.min(pageSize[1]-h,y+delta[1]*n)),w,h]:[x,y,Math.max(1,Math.min(pageSize[0]-x,w+delta[0]*n)),Math.max(1,Math.min(pageSize[1]-y,h+delta[1]*n))];syncFrame();
  });
 }

 function routeMatches(hash=win.location.hash){const match=hash.match(/^#editor\/([^/]+)/);try{return match?decodeURIComponent(match[1])===id:hash===initialHash;}catch{return false;}}
 function alive(){return !disposed&&panel.isConnected&&routeMatches()&&source.id===id&&source.revision===revision&&source.provenance?.contentDigest===declaredDigest;}
 function active(token,page){try{return alive()&&generation===token&&getPage()===page;}catch{return false;}}
 function report(state,message){status.dataset.state=state;status.textContent=message;try{onStatus({status:state,message});}catch{/* Feedback must not invalidate a saved PDF. */}}
 function disable(value){panel.setAttribute('aria-busy',String(value));for(const e of panel.querySelectorAll('input,button'))e.disabled=value;}
 function showSelection(view){
  const image=view.images[0],[x,y,right,bottom]=image.bounds;selected={pageIndex:view.pageIndex,sourceDigest:view.sourceDigest,imageId:image.imageId};
  panel.querySelector('[data-image-label]').textContent=`Image 1 · Page ${view.pageIndex+1}`;
  panel.querySelector('[data-image-bounds]').textContent=`${image.pixelWidth} × ${image.pixelHeight} pixels · Frame ${right-x} × ${bottom-y} pt`;
  for(const [name,value]of Object.entries({x,y,width:right-x,height:bottom-y}))panel.querySelector(`[name="image-${name}"]`).value=String(value);
  panel.querySelector('[name="image-file"]').value='';panel.querySelector('[data-image-file]').textContent='No replacement chosen.';controls.hidden=false;mountOverlay(view);if(!paper)panel.querySelector('.image-precision').open=true;
 }
 async function inspectCurrent(){
  if(busy||!alive())return;const token=++generation;let page;
  busy=true;selected=null;clearOverlay();controls.hidden=true;disable(true);report('working','Checking the image on this page…');
  try{page=getPage();heldPage=page;const view=await inspectEditableImages(snapshot,page);if(!active(token,page))return;showSelection(view);report('ready',`Image selected on page ${page+1}.`);}
  catch(error){if(active(token,page))report('error',friendly(error));}
  finally{busy=false;heldPage=null;if(alive()){disable(false);if(generation===token&&getPage()!==page){selected=null;controls.hidden=true;report('ready','Page changed. Inspect the current page before editing its image.');}}}
 }
 async function apply(operation,form){
  if(busy||!alive())return;
  if(!selected||getPage()!==selected.pageIndex){selected=null;controls.hidden=true;report('ready','Page changed. Inspect the current page before editing its image.');return;}
  if(!form.reportValidity())return;
  const target={...selected},token=++generation;heldPage=target.pageIndex;let request={...target,operation},file;
  if(operation==='move'){request.x=Number(form.querySelector('[name="image-x"]').value);request.y=Number(form.querySelector('[name="image-y"]').value);}
  else if(operation==='resize'){request.width=Number(form.querySelector('[name="image-width"]').value);request.height=Number(form.querySelector('[name="image-height"]').value);}
  else if(operation==='replace')file=form.querySelector('[name="image-file"]').files[0];
  busy=true;disable(true);report('working','Editing the image and checking a separate PDF copy…');
  try{
   if(operation==='replace'){request={...request,...await replacement(file,doc)};if(!active(token,target.pageIndex))return;}
   const bytes=await editPdfImage(snapshot,request);if(!active(token,target.pageIndex))return;
   const label={move:'image moved',resize:'image resized',replace:'image replaced'}[operation];
   await createCopy(bytes,`${title.replace(/\.pdf$/i,'')} — ${label}.pdf`,`image-${operation}`);
   if(active(token,target.pageIndex))report('saved','Edited PDF copy saved. Your original is unchanged.');
  }catch(error){if(active(token,target.pageIndex))report('error',`Copy not saved. ${friendly(error)}`);}
  finally{busy=false;heldPage=null;if(alive()){disable(false);if(generation===token&&getPage()!==target.pageIndex){selected=null;controls.hidden=true;report('ready','Page changed. Inspect the current page before editing its image.');}}}
 }
 function pageChanged(){if(!alive())return;const targetPage=selected?.pageIndex??heldPage;if(targetPage===null||getPage()===targetPage)return;generation++;selected=null;clearOverlay();controls.hidden=true;report('ready','Page changed. Inspect the current page before editing its image.');}
 function routeChanged(event){if(!routeMatches(event?.newURL?new URL(event.newURL).hash:win.location.hash)){disposed=true;generation++;selected=null;}else pageChanged();}
 function submit(event){const form=event.target.closest('[data-image-form]');if(form){event.preventDefault();void apply(form.dataset.imageForm,form);}}
 function click(event){
  const action=event.target.closest('[data-image-action]')?.dataset.imageAction;
  if(action==='inspect')void inspectCurrent();
  if(action==='reset')resetFrame();
  if(action==='apply'&&draftOperation)void apply(draftOperation,panel.querySelector(`[data-image-form="${draftOperation}"]`));
  if(action==='choose-replacement'){panel.querySelector('.image-precision').open=true;panel.querySelector('[name="image-file"]').click();}
 }
 function fileChanged(){if(alive())panel.querySelector('[data-image-file]').textContent=panel.querySelector('[name="image-file"]').files[0]?.name||'No replacement chosen.';}
 panel.addEventListener('submit',submit);panel.addEventListener('click',click);panel.querySelector('[name="image-file"]').addEventListener('change',fileChanged);doc.addEventListener('jetty-editor-page',pageChanged);win.addEventListener('hashchange',routeChanged);
 void inspectCurrent();
 return {pending:()=>busy,dispose(){disposed=true;generation++;selected=null;clearOverlay();panel.removeEventListener('submit',submit);panel.removeEventListener('click',click);panel.querySelector('[name="image-file"]').removeEventListener('change',fileChanged);doc.removeEventListener('jetty-editor-page',pageChanged);win.removeEventListener('hashchange',routeChanged);}};
}
