import {rememberWork} from './resume-work.js';
import {mountScanner} from '../packages/jt-scan/ui.js';
import {saveScanResult} from './scan-custody.js';
import {activityView,mountActivity,documentActivity} from './runtime-activity.js';
import './scan-page.css';
let controller=null,generation=0;
export function scanView(){return `<div class="a-page real-scan-page"><a class="a-back" href="#files">← Back to Library</a><a class="a-btn" id="scan-new" href="#scan/new">New document</a>${activityView()}<p id="scan-host-status" role="status">Opening your scan workspace…</p><div id="scan-host"></div></div>`;}
export function releaseScan(){generation++;controller?.destroy();controller=null;}
export async function mountScanPage(root){
 releaseScan();const version=generation,host=root.querySelector('#scan-host'),status=root.querySelector('#scan-host-status');mountActivity(root);
 let id=location.hash.split('/')[1];if(id==='new')id=crypto.randomUUID();if(!id)try{id=localStorage.getItem('jetty-active-scan')||undefined;}catch{}
 try{
  const mounted=await mountScanner({root:host,id,onSave:async result=>{const ticket=documentActivity.begin('Saving your scan','Keeping the PDF and original images together.');try{const receipt=await saveScanResult(result,{sessionId:id});documentActivity.finish(ticket,'Scan saved','The PDF and original images are kept on this device.');if(version===generation&&host.isConnected)location.hash='#editor/'+encodeURIComponent(receipt.documentId);return receipt;}catch(error){documentActivity.fail(ticket,'Scan needs a retry',error.message);throw error;}}});
  if(version!==generation||!host.isConnected){mounted.destroy();return;}
  controller=mounted;id=mounted.id;try{localStorage.setItem('jetty-active-scan',id);}catch{}
  history.replaceState(null,'','#scan/'+encodeURIComponent(id));rememberWork(location.hash);document.dispatchEvent(new Event('jetty-scan-route'));status.textContent='Captured pages are checkpointed on this device. Return here to continue.';
 }catch(error){if(version===generation&&host.isConnected)status.textContent='The scan workspace could not open. Your saved documents are unchanged. '+error.message;}
}
