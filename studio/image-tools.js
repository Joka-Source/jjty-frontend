import {inspectEditableImages,editPdfImage} from '../src/pdf-image-editor.js';

const field=(label,name)=>`<label>${label}<input name="image-${name}" type="number" min="0" step="any" required></label>`;
export function imageToolsView(){return `<section class="studio-image-tools" aria-label="Edit an existing PDF image">
 <p class="image-tools-intro">Change the image itself. Each edit saves a separate PDF copy.</p>
 <details class="image-tools-support"><summary>Which images can I edit?</summary><p>Currently, one opaque image on a page without other text or artwork. The page must be unrotated and uncropped. Shared images, masks and clipped artwork need another editor.</p></details>
 <button type="button" data-image-action="inspect">Inspect current page</button>
 <p data-image-status role="status" aria-live="polite" aria-atomic="true">Reading the current page…</p>
 <div data-image-controls hidden>
  <label class="image-tools-choice"><input type="radio" name="image-target" value="single" checked><span><strong data-image-label>Image 1</strong><small data-image-bounds></small></span></label>
  <p class="image-tools-units">Positions start at the page’s top-left corner. Sizes are in PDF points.</p>
  <form data-image-form="move"><fieldset><legend>Position</legend><div class="image-tools-fields">${field('From left (pt)','x')}${field('From top (pt)','y')}</div><button type="submit" data-image-action="move">Save moved copy</button></fieldset></form>
  <form data-image-form="resize"><fieldset><legend>Size</legend><div class="image-tools-fields">${field('Width (pt)','width')}${field('Height (pt)','height')}</div><p>Top-left stays fixed. Width and height change independently.</p><button type="submit" data-image-action="resize">Save resized copy</button></fieldset></form>
  <form data-image-form="replace"><fieldset><legend>Replace image</legend><label>PNG or JPEG<input name="image-file" type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" required></label><p data-image-file>No replacement chosen.</p><p>The new image fills the current frame. Transparent pixels are not supported.</p><button type="submit" data-image-action="replace">Save replaced copy</button></fieldset></form>
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
  panel.querySelector('[name="image-file"]').value='';panel.querySelector('[data-image-file]').textContent='No replacement chosen.';controls.hidden=false;
 }
 async function inspectCurrent(){
  if(busy||!alive())return;const token=++generation;let page;
  busy=true;selected=null;controls.hidden=true;disable(true);report('working','Checking the image on this page…');
  try{page=getPage();heldPage=page;const view=await inspectEditableImages(snapshot,page);if(!active(token,page))return;showSelection(view);report('ready',`Image ready on page ${page+1}. Your original will stay unchanged.`);}
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
 function pageChanged(){if(!alive())return;const targetPage=selected?.pageIndex??heldPage;if(targetPage===null||getPage()===targetPage)return;generation++;selected=null;controls.hidden=true;report('ready','Page changed. Inspect the current page before editing its image.');}
 function routeChanged(event){if(!routeMatches(event?.newURL?new URL(event.newURL).hash:win.location.hash)){disposed=true;generation++;selected=null;}else pageChanged();}
 function submit(event){const form=event.target.closest('[data-image-form]');if(form){event.preventDefault();void apply(form.dataset.imageForm,form);}}
 function click(event){if(event.target.closest('[data-image-action="inspect"]'))void inspectCurrent();}
 function fileChanged(){if(alive())panel.querySelector('[data-image-file]').textContent=panel.querySelector('[name="image-file"]').files[0]?.name||'No replacement chosen.';}
 panel.addEventListener('submit',submit);panel.addEventListener('click',click);panel.querySelector('[name="image-file"]').addEventListener('change',fileChanged);doc.addEventListener('jetty-editor-page',pageChanged);win.addEventListener('hashchange',routeChanged);
 void inspectCurrent();
 return {pending:()=>busy,dispose(){disposed=true;generation++;selected=null;panel.removeEventListener('submit',submit);panel.removeEventListener('click',click);panel.querySelector('[name="image-file"]').removeEventListener('change',fileChanged);doc.removeEventListener('jetty-editor-page',pageChanged);win.removeEventListener('hashchange',routeChanged);}};
}
