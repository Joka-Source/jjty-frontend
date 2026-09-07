import { createServerClient } from './server.js';

export function initServerPanel({ saveDocument }) {
  const $ = id => document.getElementById(id);
  const panel=$('server-panel'), form=$('server-connect'), status=$('server-status');
  let client=null, origin='', current=null, pdf=null, attachment=null, work=null, busy=false, generation=0, pending=null, proposal=null, words=[], actor='';
  const clearPaint=()=>document.querySelectorAll('.server-work-layer').forEach(n=>n.remove());
  function controls() {
    $('server-upload').hidden=!client;
    $('server-upload').textContent=current?.serverLink?.origin===origin ? `Open saved copy on ${origin}` : `Send “${current?.title || 'this PDF'}” to ${origin}`;
    $('server-actions').hidden=!attachment;
    panel.querySelectorAll('button, input, textarea').forEach(n=>n.disabled=busy);
    $('server-undo').disabled=busy || !!pending || !!proposal || !work?.undo_operation_id;
    $('server-command-form').querySelector('button').disabled=busy || !!pending || !!proposal;
    $('server-retry').hidden=!pending;
    $('server-proposal').hidden=!proposal;
    $('server-apply').disabled=busy || !!pending || !proposal?.previewReady;
    $('server-cancel').disabled=busy || !!pending;
    $('server-disconnect').hidden=!client;
  }
  async function paint() {
    clearPaint();
    if (!work || !attachment || !pdf) return;
    const expected=generation, heldPdf=pdf, heldWork=work, context=attachment.context;
    if (heldWork.document_id!==context.document_id || heldWork.document_revision_id!==context.document_revision_id) throw new Error('Server work belongs to another document revision.');
    const fragmentByPage=new Map();
    for (const item of heldWork.items) {
      if (item.coordinate_space!=='pdf-user-space' || item.document_id!==context.document_id || item.document_revision_id!==context.document_revision_id) throw new Error('Server annotation does not match this PDF.');
      const pageNumber=item.page_index+1;
      let layer=fragmentByPage.get(pageNumber);
      if(!layer){
        const page=await heldPdf.pdfDocument.getPage(pageNumber);
        const viewport=page.getViewport({scale:heldPdf.model.zoom});
        const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
        svg.classList.add('server-work-layer'); svg.setAttribute('viewBox',`0 0 ${viewport.width} ${viewport.height}`); svg.setAttribute('aria-hidden','true');
        layer={svg,viewport}; fragmentByPage.set(pageNumber,layer);
      }
      const [a,b,c,d,e,f]=layer.viewport.transform;
      const point=(x,y)=>[a*x+c*y+e,b*x+d*y+f];
      for (const quad of item.geometry) {
        const points=[1,2,4,3].map(i=>point(quad[`x${i}`],quad[`y${i}`]));
        if(points.flat().some(v=>!Number.isFinite(v))) throw new Error('Server annotation geometry is invalid.');
        const linear=['underline','strike'].includes(item.annotation_type);
        const polygon=document.createElementNS('http://www.w3.org/2000/svg',linear?'line':'polygon');
        if(linear){
          const from=item.annotation_type==='underline'?points[3]:points[0].map((v,i)=>(v+points[3][i])/2);
          const to=item.annotation_type==='underline'?points[2]:points[1].map((v,i)=>(v+points[2][i])/2);
          for(const [key,value]of Object.entries({x1:from[0],y1:from[1],x2:to[0],y2:to[1]}))polygon.setAttribute(key,String(value));
        }else polygon.setAttribute('points',points.map(p=>p.join(',')).join(' '));
        polygon.dataset.annotation=item.annotation_type;
        const title=document.createElementNS('http://www.w3.org/2000/svg','title');title.textContent=item.note_text || item.quote; polygon.append(title);
        layer.svg.append(polygon);
      }
    }
    if(expected!==generation || heldPdf!==pdf || heldWork!==work) return;
    clearPaint();
    for(const [page,layer] of fragmentByPage) document.querySelector(`#doc .pdf-page[data-page="${page}"]`)?.append(layer.svg);
    $('server-work-count').textContent=`${heldWork.items.length} saved ${heldWork.items.length===1?'mark':'marks'} on ${origin}`;
    $('server-work-list').replaceChildren(...heldWork.items.map(item=>{const li=document.createElement('li');li.textContent=`${item.annotation_type}: ${item.note_text || item.quote}`;return li;}));
  }
  async function run(task) {
    if(busy)return;
    busy=true;controls(); const version=generation;
    try { await task(version); }
    catch(error){if(version===generation)status.textContent=`${error.message} Your local original is still available.`;}
    finally{busy=false;controls();}
  }
  form.addEventListener('submit',event=>{
    event.preventDefault();
    try{
      const config={baseUrl:$('server-origin').value.trim(),token:$('server-token').value,authority:{actor_id:$('server-actor').value.trim(),tenant_scope:$('server-tenant').value.trim(),project_id:$('server-project').value.trim()}};
      client=createServerClient(config);origin=new URL(config.baseUrl).origin;actor=config.authority.actor_id;
      $('server-token').value='';attachment=null;work=null;pending=null;proposal=null;clearPaint();
      status.textContent=`Destination set to ${origin}. The next button sends only this PDF, or opens its saved copy. Local notes are not uploaded.`;
      controls();
    }catch(error){status.textContent=error.message;}
  });
  $('server-upload').addEventListener('click',()=>run(async version=>{
    const doc=current, activeClient=client, destination=origin;
    status.textContent=`Opening “${doc.title}” on ${destination}…`;
    let next;
    if(doc.serverLink?.origin===destination){next=await activeClient.attach(doc.serverLink.objectId);next.objectId=doc.serverLink.objectId;}
    else{
      const bytes=doc.sourceBytes instanceof Uint8Array?doc.sourceBytes:new Uint8Array(Object.values(doc.sourceBytes));
      next=await activeClient.uploadAndAttach(new File([bytes],doc.provenance?.name || `${doc.title}.pdf`,{type:'application/pdf'}));
      doc.serverLink={origin:destination,objectId:next.objectId,sourceDigest:next.source_sha256};
      await saveDocument(doc);
    }
    if(next.source_sha256!==doc.provenance.contentDigest.replace(/^sha256:/,''))throw new Error('The server copy differs from your original.');
    const projection=await activeClient.readWork(next.context);
    if(version!==generation)return;
    attachment=next;work=projection;pending=doc.serverLink?.pending || null;proposal=null;$('server-page').max=String(next.page_count);await paint();if(version!==generation)return;status.textContent=pending ? 'A previous request needs recovery. Retry sends the exact saved instruction.' : `Server copy ready on ${destination}. Commands below change that copy.`;
  }));
  async function executeSaved(envelope, version) {
    const doc=current, activeClient=client, held=attachment;
    pending=envelope;doc.serverLink={...doc.serverLink,pending:envelope};
    await saveDocument(doc);
    const id=activeClient.restoreRequest(envelope);
    const result=await activeClient.retry(id);
    const recovered=await activeClient.attach(held.objectId);
    const projection=await activeClient.readWork(recovered.context);
    delete doc.serverLink.pending;await saveDocument(doc);activeClient.forgetRequest(id);
    if(version!==generation)return;
    pending=null;attachment={...recovered,objectId:held.objectId};work=projection;
    if(result.outcome==='proposal_available') {
      const wanted=new Set(result.target_word_ids || []), selected=words.filter(w=>wanted.has(w.id));
      proposal={...result,previewReady:wanted.size>0 && selected.length===wanted.size};
      $('server-proposal-text').textContent=proposal.previewReady ? `${({'annot.highlight':'Highlight','annot.underline':'Underline','annot.strike':'Strike through','annot.note':'Add note to'})[result.action_type] || 'Proposed change'}: ${selected.map(w=>w.text).join(' ')}` : 'The full proposed target is unavailable. Cancel this proposal and use a more explicit instruction.';
    } else proposal=null;
    await paint();if(version!==generation)return;
    status.textContent=result.safe_message || result.outcome;
    if(result.outcome==='action_applied')$('server-command').value='';
  }
  function prepared(operation,payload) {
    const id=client.prepareRequest(attachment.context,operation,payload);
    return client.requestSnapshot(id);
  }
  $('server-command-form').addEventListener('submit',event=>{event.preventDefault();void run(async version=>{
    if(pending || proposal)return;
    const text=$('server-command').value.trim();if(!text)return;
    const pageIndex=Number($('server-page').value)-1;
    if(!Number.isInteger(pageIndex)||pageIndex<0||pageIndex>=attachment.page_count)throw new Error('Choose a page in this PDF.');
    const activeClient=client, held=attachment, heldPdf=pdf;
    const page=await heldPdf.pdfDocument.getPage(pageIndex+1), viewport=page.getViewport({scale:1});
    const [x,y,right,top]=viewport.viewBox;
    const updated=await activeClient.updateContext(held.context,{event_id:crypto.randomUUID(),page_index:pageIndex,viewport:{x,y,width:right-x,height:top-y,zoom_bps:10000,rotation_degrees:0},input_source:'viewport'});
    if(version!==generation)return;
    attachment={...held,context:updated.context};words=updated.page_words;
    status.textContent='Waiting for the server…';
    await executeSaved(prepared('submit',{input:{modality:'typed',text}}),version);
  });});
  $('server-retry').addEventListener('click',()=>run(version=>executeSaved(pending,version)));
  $('server-refresh').addEventListener('click',()=>run(async version=>{const next=await client.readWork(attachment.context);if(version!==generation)return;work=next;await paint();if(version!==generation)return;status.textContent=pending?'Showing saved work. The pending request still needs recovery.':'Showing the latest server-confirmed work.';}));
  $('server-undo').addEventListener('click',()=>run(version=>executeSaved(prepared('undo',{undo:{operation_id:work.undo_operation_id,expected_work_version:work.undo_work_version,approved_by:actor,approval_reference:crypto.randomUUID()}}),version)));
  $('server-apply').addEventListener('click',()=>run(version=>executeSaved(prepared('apply',{proposal:{proposal_id:proposal.proposal_id,expected_proposal_version:proposal.proposal_version,approved_by:actor,approval_reference:crypto.randomUUID()}}),version)));
  $('server-cancel').addEventListener('click',()=>run(version=>executeSaved(prepared('cancel',{cancellation:{proposal_id:proposal.proposal_id,expected_proposal_version:proposal.proposal_version,cancelled_by:actor,reason_code:'USER_CANCELLED'}}),version)));
  $('server-disconnect').addEventListener('click',()=>{generation++;client=null;origin='';attachment=null;work=null;pending=null;proposal=null;clearPaint();status.textContent='Disconnected. The server copy has not been deleted.';controls();});
  return {
    setDocument(doc, surface=null) {
      if(doc?.id!==current?.id){generation++;attachment=null;work=null;pending=null;proposal=null;words=[];$('server-page').value='1';clearPaint();status.textContent='Choose a server only if you want to send this PDF there.';}
      current=doc;pdf=surface;panel.hidden=doc?.provenance?.sourceKind!=='pdf' || !doc?.sourceBytes;
      controls(); const version=generation; if(work)void paint().catch(error=>{if(version===generation)status.textContent=error.message;});
    },
  };
}
