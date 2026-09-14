import * as m from 'mupdf';
const valid=line=>line&&typeof line.text==='string'&&line.text.length>0&&line.text.length<=10000&&/^[\x20-\x7e]+$/.test(line.text)&&Array.isArray(line.bounds)&&line.bounds.length===4&&line.bounds.every(Number.isFinite)&&line.bounds[0]>=0&&line.bounds[1]>=0&&line.bounds[2]>0&&line.bounds[3]>0&&line.bounds[0]+line.bounds[2]<=1&&line.bounds[1]+line.bounds[3]<=1;
const normalized=text=>text.trim().replace(/\s+/g,' ');
/** Conservative Latin text layer. Other scripts and unpositioned text remain explicit sidecars. */
export function embedRecognition(bytes,recognition,pageIds){
 const eligible=recognition.filter(r=>Array.isArray(r.lines)&&r.lines.length>0&&r.lines.length<=2000&&r.lines.every(valid)&&normalized(r.lines.map(l=>l.text).join(' '))===normalized(r.text));
 if(!eligible.length)return {pdfBytes:bytes,embeddedPages:[]};
 const source=new m.PDFDocument(bytes),buffer=new m.Buffer(),writer=new m.DocumentWriter(buffer,'pdf','compress=yes'),font=new m.Font('Helvetica');const embeddedPages=[];
 try{
  for(let i=0;i<source.countPages();i++){const page=source.loadPage(i);let device;
   try{const box=page.getBounds(),w=box[2]-box[0],h=box[3]-box[1];device=writer.beginPage(box);page.run(device,m.Matrix.identity);const result=eligible.find(r=>r.pageId===pageIds[i]);
    if(result){for(const line of result.lines){const [x,y,bw,bh]=line.bounds,text=new m.Text();try{const advance=[...line.text].reduce((n,c)=>n+font.advanceGlyph(font.encodeCharacter(c)),0);if(advance<=0)continue;text.showString(font,[bw*w/advance,0,0,-bh*h,x*w,(y+bh*.8)*h],line.text);device.ignoreText(text,m.Matrix.identity);}finally{text.destroy();}}embeddedPages.push(result.pageId);}
    writer.endPage();
   }finally{device?.destroy();page.destroy();}
  }
  writer.close();return {pdfBytes:new Uint8Array(buffer.asUint8Array()),embeddedPages};
 }finally{font.destroy();writer.destroy();buffer.destroy();source.destroy();}
}
