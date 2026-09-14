import {inspectPdfForm} from './pdf-forms.js';
const fail=code=>{const error=new Error(code);error.code=code;throw error;};
const copy=bytes=>new Uint8Array(bytes).slice();
const canonical=value=>JSON.stringify(value,(_key,v)=>typeof v==='number'?Math.round(v*10000)/10000:v);
const normalize=text=>String(text??'').normalize('NFC').replace(/\s+/gu,' ').trim();
const overlap=(a,b)=>a[0]<b[2]&&a[2]>b[0]&&a[1]<b[3]&&a[3]>b[1];
const contains=(a,b)=>b[0]>=a[0]&&b[1]>=a[1]&&b[2]<=a[2]&&b[3]<=a[3];
const bounds=points=>[Math.min(...points.filter((_,i)=>i%2===0)),Math.min(...points.filter((_,i)=>i%2)),Math.max(...points.filter((_,i)=>i%2===0)),Math.max(...points.filter((_,i)=>i%2))];
export const EDIT_PIXEL_POLICY=Object.freeze({scale:1,regionPadding:2,channelTolerance:2,maxPagePixels:25000000});
function plainFieldSemantics(fields){return fields.map(({groupId,...field})=>({...field,groupKeys:fields.filter(f=>f.groupId===groupId).map(f=>f.key).sort()}));}
export async function inspectEditSource(bytes){
 const raw=copy(bytes);if(!raw.length||raw.length>64*1024*1024)fail('EDIT_SOURCE_LIMIT');
 const forms=await inspectPdfForm(raw),m=await import('mupdf'),doc=new m.PDFDocument(raw),pages=[],owned=[];
 const keep=o=>(owned.push(o),o);const get=(o,key)=>o.isNull()?o:keep(o.get(key));
 try{
  doc.disableJS();const restrictions=[...forms.restrictions];
  const trailer=keep(doc.getTrailer()),root=get(trailer,'Root');
  if(doc.needsPassword()||!get(trailer,'Encrypt').isNull())restrictions.push('encrypted');
  if(!doc.hasPermission('edit'))restrictions.push('edit-permission-denied');
  if(!get(root,'StructTreeRoot').isNull())restrictions.push('tagged-document');
  if(!get(root,'OpenAction').isNull()||!get(root,'AA').isNull()||!get(get(root,'Names'),'JavaScript').isNull())restrictions.push('document-actions');
  if(restrictions.length)return {pages,restrictions:[...new Set(restrictions)],forms:plainFieldSemantics(forms.fields)};
  if(doc.countPages()>200)fail('EDIT_PAGE_LIMIT');
  for(let index=0;index<doc.countPages();index++){
   const page=doc.loadPage(index),annotations=[];let items=[],nativeLinks=[];const local=[];
   try{
    const object=page.getObject();local.push(object);
    const geometry={};for(const key of ['MediaBox','CropBox','Rotate','UserUnit']){const value=object.getInheritable(key);local.push(value);geometry[key]=value.toString();}
    const action=object.get('AA');local.push(action);if(!action.isNull())restrictions.push('page-actions');
    items=page.getAnnotations();for(const a of items)annotations.push({type:a.getType(),name:a.getName(),contents:a.getContents(),bounds:[...a.getBounds()],quads:a.hasQuadPoints()?a.getQuadPoints().map(q=>[...q]):[],flags:a.getFlags(),color:[...a.getColor()],opacity:a.getOpacity()});
    nativeLinks=page.getLinks();const links=nativeLinks.map(link=>({bounds:[...link.getBounds()],uri:link.getURI(),external:link.isExternal()}));
    pages.push({links,bounds:[...page.getBounds()],transform:[...page.getTransform()],geometry,annotations,widgets:forms.fields.filter(f=>f.pageIndex===index).map(f=>[...f.rect])});
   }finally{nativeLinks.forEach(link=>link.destroy());items.forEach(a=>a.destroy());local.reverse().forEach(o=>o.destroy());page.destroy();}
  }
  return {pages,restrictions:[...new Set(restrictions)],forms:plainFieldSemantics(forms.fields)};
 }finally{owned.reverse().forEach(o=>o.destroy());doc.destroy();}
}
function paragraphPolygon(page,p){
 const box=p?.box??p;const {x,top,w,h}=box??{};
 let raw;
 if(p?.quad!==undefined){raw=Array.isArray(p.quad)?p.quad.flat():null;if(!raw||raw.length!==8||!raw.every(Number.isFinite))fail('EDIT_REGION_INVALID');}
 else {if(![x,top,w,h].every(Number.isFinite)||w<=0||h<=0)fail('EDIT_REGION_INVALID');raw=[x,top,x+w,top,x+w,top-h,x,top-h];}
 const t=page.transform;if(t.length!==6||!t.every(Number.isFinite)||Math.abs(t[0]*t[3]-t[1]*t[2])<1e-10)fail('EDIT_TRANSFORM_INVALID');
 const points=[];for(let i=0;i<8;i+=2)points.push([t[0]*raw[i]+t[2]*raw[i+1]+t[4],t[1]*raw[i]+t[3]*raw[i+1]+t[5]]);
 let sign=0;for(let i=0;i<4;i++){const a=points[i],b=points[(i+1)%4],c=points[(i+2)%4],cross=(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);if(!Number.isFinite(cross)||Math.abs(cross)<1e-10||sign&&Math.sign(cross)!==sign)fail('EDIT_REGION_INVALID');sign=Math.sign(cross);}
 return points;
}
function inPolygonWithPadding(points,x,y,padding){
 let inside=true,sign=0;
 for(let i=0;i<4;i++){
  const a=points[i],b=points[(i+1)%4],dx=b[0]-a[0],dy=b[1]-a[1],cross=dx*(y-a[1])-dy*(x-a[0]);
  if(cross){if(sign&&Math.sign(cross)!==sign)inside=false;else if(!sign)sign=Math.sign(cross);}
  const u=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)));
  if((x-a[0]-u*dx)**2+(y-a[1]-u*dy)**2<=padding*padding)return true;
 }
 return inside;
}
function masked(region,x,y){
 if(!region)return false;const r=region.protectedRect;
 return x>=r[0]&&x<=r[2]&&y>=r[1]&&y<=r[3]&&region.polygons.some(p=>inPolygonWithPadding(p,x,y,EDIT_PIXEL_POLICY.regionPadding));
}
export function assertEditRegion(metadata,pageIndex,before,after){
 if(metadata?.restrictions?.length)fail('EDIT_DOCUMENT_RESTRICTED');
 if(!Number.isInteger(pageIndex)||!metadata?.pages?.[pageIndex])fail('EDIT_PAGE_INVALID');
 const page=metadata.pages[pageIndex],polygons=[paragraphPolygon(page,before),paragraphPolygon(page,after)],beforeRect=bounds(polygons[0].flat()),afterRect=bounds(polygons[1].flat());
 if(!contains(page.bounds,beforeRect)||!contains(page.bounds,afterRect))fail('EDIT_REGION_OUTSIDE_PAGE');
 const allowedRect=[Math.min(beforeRect[0],afterRect[0]),Math.min(beforeRect[1],afterRect[1]),Math.max(beforeRect[2],afterRect[2]),Math.max(beforeRect[3],afterRect[3])];
 const pad=EDIT_PIXEL_POLICY.regionPadding,protectedRect=allowedRect.map((n,i)=>n+(i<2?-pad:pad));
 for(const annotation of page.annotations){const regions=annotation.quads.length?annotation.quads.map(bounds):[annotation.bounds];if(regions.some(r=>overlap(protectedRect,r)))fail('EDIT_REGION_OVERLAPS_ANNOTATION');}
 if(page.widgets.some(r=>overlap(protectedRect,r)))fail('EDIT_REGION_OVERLAPS_WIDGET');
 if(page.links.some(link=>overlap(protectedRect,link.bounds)))fail('EDIT_REGION_OVERLAPS_LINK');
 return {beforeRect,afterRect,allowedRect,protectedRect,polygons};
}
function textParts(page,region){
 const structured=page.toStructuredText('preserve-whitespace');let inside='',outside='';
 try{structured.walk({onChar(c,_origin,_font,_size,quad){const r=bounds(quad),cx=(r[0]+r[2])/2,cy=(r[1]+r[3])/2;if(masked(region,cx,cy))inside+=c;else outside+=c;},endLine(){inside+='\n';outside+='\n';}});}finally{structured.destroy();}
 return {inside:normalize(inside),outside:normalize(outside)};
}
export async function verifyEditedPdf(beforeBytes,afterBytes,{pageIndex,before,after}){
 const original=copy(beforeBytes),output=copy(afterBytes),a=await inspectEditSource(original),b=await inspectEditSource(output);
 const region=assertEditRegion(a,pageIndex,before,after);assertEditRegion(b,pageIndex,before,after);
 if(a.pages.length!==b.pages.length)fail('EDIT_PAGE_COUNT_CHANGED');
 if(canonical(a.forms)!==canonical(b.forms))fail('EDIT_FORMS_CHANGED');
 for(let i=0;i<a.pages.length;i++)if(canonical(a.pages[i])!==canonical(b.pages[i]))fail('EDIT_PAGE_SEMANTICS_CHANGED');
 const m=await import('mupdf'),left=new m.PDFDocument(original),right=new m.PDFDocument(output);
 try{left.disableJS();right.disableJS();for(let i=0;i<a.pages.length;i++){
  let p,q,lp,rp;
  try{
   p=left.loadPage(i);q=right.loadPage(i);
   const mask=i===pageIndex?region:null,ltext=textParts(p,mask),rtext=textParts(q,mask);
   if(ltext.outside!==rtext.outside)fail('EDIT_SURROUNDING_TEXT_CHANGED');
   if(i===pageIndex){if(!normalize(before.text)||ltext.inside!==normalize(before.text))fail('EDIT_SOURCE_TEXT_MISMATCH');if(rtext.inside!==normalize(after.text))fail('EDIT_REPLACEMENT_TEXT_MISMATCH');}
   const rect=a.pages[i].bounds;if(Math.ceil(rect[2]-rect[0])*Math.ceil(rect[3]-rect[1])>EDIT_PIXEL_POLICY.maxPagePixels)fail('EDIT_RASTER_LIMIT');
   lp=p.toPixmap([1,0,0,1,0,0],m.ColorSpace.DeviceRGB,false,true);rp=q.toPixmap([1,0,0,1,0,0],m.ColorSpace.DeviceRGB,false,true);
   if(lp.getWidth()!==rp.getWidth()||lp.getHeight()!==rp.getHeight()||lp.getX()!==rp.getX()||lp.getY()!==rp.getY()||lp.getNumberOfComponents()!==rp.getNumberOfComponents())fail('EDIT_RASTER_GEOMETRY_CHANGED');
   const l=lp.getPixels(),r=rp.getPixels(),n=lp.getNumberOfComponents();
   for(let y=0;y<lp.getHeight();y++)for(let x=0;x<lp.getWidth();x++){
    const px=x+lp.getX()+.5,py=y+lp.getY()+.5;if(masked(mask,px,py))continue;
    for(let c=0;c<n;c++)if(Math.abs(l[y*lp.getStride()+x*n+c]-r[y*rp.getStride()+x*n+c])>EDIT_PIXEL_POLICY.channelTolerance)fail('EDIT_OUTSIDE_PIXELS_CHANGED');
   }
  }finally{lp?.destroy();rp?.destroy();p?.destroy();q?.destroy();}
 }}finally{left.destroy();right.destroy();}return output;
}
