import {processImage} from './session.js';
self.onmessage=async({data})=>{
 try{const result=await processImage(data.bytes,data.edits);self.postMessage({result},[result.bytes.buffer]);}
 catch(error){self.postMessage({error:/^SCAN_[A-Z_]+$/.test(error.message)?error.message:'SCAN_PROCESSING_FAILED'});}
};
self.postMessage({ready:true});
