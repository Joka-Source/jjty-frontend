const fail=code=>{throw new Error(`SCAN_${code}`);};
function checkFrame(f){if(!f||!Number.isInteger(f.width)||!Number.isInteger(f.height)||f.width<2||f.height<2||f.width*f.height>24000000||!(f.data instanceof Uint8ClampedArray)||f.data.length!==f.width*f.height*4)fail('INVALID_FRAME');}
export function validateQuad(q){
 if(!Array.isArray(q)||q.length!==4||q.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v)||v<0||v>1)))fail('INVALID_QUAD');
 const cross=q.map((p,i)=>{const b=q[(i+1)%4],c=q[(i+2)%4];return (b[0]-p[0])*(c[1]-b[1])-(b[1]-p[1])*(c[0]-b[0]);});
 if(cross.some(v=>v<=1e-6))fail('INVALID_QUAD');
 return q.map(p=>[...p]);
}
/** Projective, not bilinear geometry. Input TL TR BR BL normalised in upright RGB. */
export function rectify(frame,quad,{width,height,rotation=0,enhance=false}={}){
 checkFrame(frame);const q=validateQuad(quad);
 if(![0,90,180,270].includes(rotation))fail('INVALID_ROTATION');
 const points=q.map(([x,y])=>[x*(frame.width-1),y*(frame.height-1)]);
 const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
 width??=Math.round(Math.max(distance(points[0],points[1]),distance(points[3],points[2])))+1;
 height??=Math.round(Math.max(distance(points[0],points[3]),distance(points[1],points[2])))+1;
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<2||height<2||width*height>24000000)fail('OUTPUT_LIMIT');
 const [[x0,y0],[x1,y1],[x2,y2],[x3,y3]]=points;
 const dx1=x1-x2,dx2=x3-x2,dx3=x0-x1+x2-x3,dy1=y1-y2,dy2=y3-y2,dy3=y0-y1+y2-y3;
 const det=dx1*dy2-dx2*dy1;if(Math.abs(det)<1e-8)fail('INVALID_QUAD');
 const g=(dx3*dy2-dx2*dy3)/det,h=(dx1*dy3-dx3*dy1)/det;
 const a=x1-x0+g*x1,b=x3-x0+h*x3,d=y1-y0+g*y1,e=y3-y0+h*y3;
 const ow=rotation%180?height:width,oh=rotation%180?width:height,data=new Uint8ClampedArray(ow*oh*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const u=x/(width-1),v=y/(height-1),den=g*u+h*v+1;
  const sx=Math.max(0,Math.min(frame.width-1,(a*u+b*v+x0)/den)),sy=Math.max(0,Math.min(frame.height-1,(d*u+e*v+y0)/den));
  const ix=Math.floor(sx),iy=Math.floor(sy),jx=Math.min(ix+1,frame.width-1),jy=Math.min(iy+1,frame.height-1),fx=sx-ix,fy=sy-iy;
  let ox=x,oy=y;if(rotation===90){ox=height-1-y;oy=x;}else if(rotation===180){ox=width-1-x;oy=height-1-y;}else if(rotation===270){ox=y;oy=width-1-x;}
  const dst=(oy*ow+ox)*4;
  for(let c=0;c<4;c++){const top=frame.data[(iy*frame.width+ix)*4+c]*(1-fx)+frame.data[(iy*frame.width+jx)*4+c]*fx,bot=frame.data[(jy*frame.width+ix)*4+c]*(1-fx)+frame.data[(jy*frame.width+jx)*4+c]*fx;data[dst+c]=top*(1-fy)+bot*fy;}
  // Mild contrast only, opt-in; never threshold away faint marks.
  if(enhance)for(let c=0;c<3;c++)data[dst+c]=(data[dst+c]-128)*1.08+128;
 }
 return {width:ow,height:oh,data};
}
export function analyseFrame(f){
 checkFrame(f);const {width:w,height:h,data}=f,n=w*h,luma=new Float32Array(n);let sum=0,bright=0;
 for(let i=0;i<n;i++){const v=.2126*data[i*4]+.7152*data[i*4+1]+.0722*data[i*4+2];luma[i]=v;sum+=v;if(v>250)bright++;}
 let lap=0,lap2=0,count=0;for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x,v=4*luma[i]-luma[i-1]-luma[i+1]-luma[i-w]-luma[i+w];lap+=v;lap2+=v*v;count++;}
 return {meanLuma:sum/n,sharpness:count?Math.max(0,lap2/count-(lap/count)**2):0,glareFraction:bright/n};
}
/** Conservative automatic trigger, never a guarantee of OCR readability. */
export class CaptureGate{
 constructor({stableMs=600,maxMovement=.015}={}){this.stableMs=stableMs;this.maxMovement=maxMovement;this.reset();}
 reset(){this.last=-Infinity;this.anchor=null;this.since=null;this.latched=false;}
 update(f){
  if(!Number.isFinite(f.timestamp)||f.timestamp<=this.last)return {capture:false,guidance:'stale-frame'};this.last=f.timestamp;
  let q;try{q=validateQuad(f.quad);}catch{this.anchor=null;this.since=null;this.latched=false;return {capture:false,guidance:'position-document'};}
  const guidance=!Number.isFinite(f.meanLuma)||f.meanLuma<45?'more-light':!Number.isFinite(f.sharpness)||f.sharpness<40?'hold-steady':f.glareFraction>.9?'reduce-glare':null;
  if(guidance){this.anchor=null;this.since=null;return {capture:false,guidance};}
  if(!this.anchor||q.some((p,i)=>Math.hypot(p[0]-this.anchor[i][0],p[1]-this.anchor[i][1])>this.maxMovement)){this.anchor=q;this.since=f.timestamp;return {capture:false,guidance:'hold-steady'};}
  if(!this.latched&&f.timestamp-this.since>=this.stableMs){this.latched=true;return {capture:true,guidance:'captured'};}
  return {capture:false,guidance:this.latched?'turn-page-or-capture-manually':'hold-steady'};
 }
}
