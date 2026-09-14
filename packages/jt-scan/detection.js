import {validateQuad} from './raster.js';
/** Conservative bright-paper proposal only. Manual edges remain necessary on ambiguous scenes. */
export function detectDocument({width:w,height:h,data}){
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<3||h<3||w*h>1000000||data?.length!==w*h*4)throw new Error('SCAN_DETECTION_FRAME');
 const mask=new Uint8Array(w*h);let lo=255,hi=0;
 for(let i=0;i<mask.length;i++){const v=Math.round(.2126*data[i*4]+.7152*data[i*4+1]+.0722*data[i*4+2]);mask[i]=v;lo=Math.min(lo,v);hi=Math.max(hi,v);}
 const none={quad:null,method:'bright-paper',confidence:'insufficient'};if(hi-lo<45)return none;
 const threshold=lo+(hi-lo)*.65,seen=new Uint8Array(w*h),queue=new Int32Array(w*h);let best=null;
 for(let i=0;i<mask.length;i++){
  if(seen[i]||mask[i]<threshold)continue;
  let head=0,tail=1,touch=false;queue[0]=i;seen[i]=1;let tl=null,tr=null,br=null,bl=null;
  while(head<tail){const p=queue[head++],x=p%w,y=Math.floor(p/w),v=[x,y];
   if(x<=1||x>=w-2||y<=1||y>=h-2)touch=true;
   if(!tl||x+y<tl[0]+tl[1])tl=v;if(!br||x+y>br[0]+br[1])br=v;
   if(!tr||x-y>tr[0]-tr[1])tr=v;if(!bl||x-y<bl[0]-bl[1])bl=v;
   for(const n of [x>0?p-1:-1,x<w-1?p+1:-1,y>0?p-w:-1,y<h-1?p+w:-1])if(n>=0&&!seen[n]&&mask[n]>=threshold){seen[n]=1;queue[tail++]=n;}
  }
  if(!touch&&tail>w*h*.15&&(!best||tail>best.count))best={count:tail,quad:[tl,tr,br,bl].map(([x,y])=>[x/(w-1),y/(h-1)])};
 }
 if(!best)return none;try{return {quad:validateQuad(best.quad),method:'bright-paper',confidence:'proposal'};}catch{return none;}
}
