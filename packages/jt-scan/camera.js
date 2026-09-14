export class ScanCamera{
 constructor({video,mediaDevices=globalThis.navigator?.mediaDevices}){this.video=video;this.mediaDevices=mediaDevices;this.generation=0;this.stream=null;this.timings=[];}
 async start(){
  this.stop();const token=this.generation,start=performance.now();
  if(!this.mediaDevices?.getUserMedia)throw new Error('SCAN_CAMERA_UNSUPPORTED');
  const stream=await this.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:2560},height:{ideal:1920}}});
  if(token!==this.generation){stream.getTracks().forEach(t=>t.stop());throw new Error('SCAN_CAMERA_CANCELLED');}
  this.stream=stream;this.video.srcObject=stream;this.video.muted=true;this.video.playsInline=true;
  try{await this.video.play();if(token!==this.generation)throw new Error('SCAN_CAMERA_CANCELLED');this.timings.push({stage:'preview-play',ms:performance.now()-start});}
  catch(error){if(token===this.generation)this.stop();throw error;}
 }
 stop(){this.generation++;this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;this.video.pause();this.video.srcObject=null;}
 frame(maxWidth=480){
  const w=this.video.videoWidth,h=this.video.videoHeight;if(!this.stream||!w||!h)throw new Error('SCAN_PREVIEW_NOT_READY');
  if(!Number.isFinite(maxWidth)||maxWidth<2)throw new Error('SCAN_PIXEL_LIMIT');
  const scale=Math.min(1,maxWidth/w),width=Math.max(2,Math.round(w*scale)),height=Math.max(2,Math.round(h*scale));
  if(width*height>24000000)throw new Error('SCAN_PIXEL_LIMIT');
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(this.video,0,0,canvas.width,canvas.height);return ctx.getImageData(0,0,canvas.width,canvas.height);
 }
 async capture(){
  const start=performance.now(),token=this.generation,frame=this.frame(6000);
  if(frame.width*frame.height>24000000)throw new Error('SCAN_PIXEL_LIMIT');
  const canvas=document.createElement('canvas');canvas.width=frame.width;canvas.height=frame.height;canvas.getContext('2d').putImageData(frame,0,0);
  const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));if(!blob)throw new Error('SCAN_CAPTURE_FAILED');
  const bytes=new Uint8Array(await blob.arrayBuffer());if(token!==this.generation)throw new Error('SCAN_CAMERA_CANCELLED');
  return {bytes,mime:'image/png',width:frame.width,height:frame.height,timing:{stage:'capture',ms:performance.now()-start},diagnostics:[{code:'VIDEO_FRAME_CAPTURE',message:'Resolution is the negotiated video stream, not a full-resolution still.'}]};
 }
}
