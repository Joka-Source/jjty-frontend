// Local history and default-on product telemetry have separate controls.
export function mountCommandJournal(journal, analytics) {
  const host = document.getElementById('view-settings');
  if (!host) return;
  const section = document.createElement('section');
  section.className = 'setting command-journal';
  section.innerHTML = `<h2>Command history</h2>
    <p class="hint">See what was understood and whether a change was saved. Product analytics sends command outcomes and feedback automatically. Audio, recognized words and document text are excluded.</p>
    <label><input id="product-analytics-enabled" type="checkbox"> Share product analytics</label>
    <p class="hint">On by default. Turning this off stops delivery and clears pending events on this browser. Events already delivered remain in the analytics project.</p>
    <p id="product-analytics-status" role="status"></p>
    <label><input id="command-journal-raw" type="checkbox"> Keep recognized words locally for diagnosis</label>
    <p class="hint">Off by default. Turning this off removes retained words from this journal. It does not delete document action records.</p>
    <button id="command-journal-export">Export analytics events</button>
    <button id="command-journal-clear">Clear command history</button>
    <p id="command-journal-status" role="status"></p>
    <ol id="command-journal-list"></ol>`;
  host.append(section);
  const list=section.querySelector('ol'), status=section.querySelector('#command-journal-status');
  const analyticsToggle=section.querySelector('#product-analytics-enabled');
  function renderAnalytics(){
    const state=analytics?.getState();analyticsToggle.checked=state?.enabled===true;analyticsToggle.disabled=!state;
    const label=section.querySelector('#product-analytics-status');
    label.textContent=!state?'Analytics unavailable.':!state.storageAvailable?'Analytics storage unavailable: queue or preference changes may not survive a reload.':!state.enabled?'Analytics off.':!state.configured?`Analytics on. ${state.pending} events queued; the PostHog project is not configured.`:state.lastError?`Analytics on. ${state.pending} events pending; ${state.lastError}.`:state.sending?`Sending analytics. ${state.pending} events pending.`:`Analytics on. ${state.pending} events pending.`;
    if(state?.enabled&&state?.configured&&state?.coordination==='unavailable')label.textContent=`Analytics on. ${state.pending} events queued; this browser cannot coordinate delivery across tabs. Delivery is unavailable.`;
  }
  analyticsToggle.addEventListener('change',async e=>{analyticsToggle.disabled=true;try{await analytics.setEnabled(e.target.checked);}finally{renderAnalytics();}});
  analytics?.subscribe(renderAnalytics);renderAnalytics();
  section.querySelector('#command-journal-raw').addEventListener('change',e=>journal.setRawOptIn(e.target.checked));
  section.querySelector('#command-journal-clear').addEventListener('click',()=>journal.clear());
  section.querySelector('#command-journal-export').addEventListener('click',()=>{
    const blob=new Blob([JSON.stringify(journal.export(),null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download='jett-command-events.json';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    status.textContent='Metadata download requested. No transcript or document text was exported or sent.';
  });
  function render(){
    section.querySelector('#command-journal-raw').checked=journal.getState().rawOptIn;
    list.replaceChildren();
    if(journal.getState().storageError) status.textContent='Storage unavailable: current changes are in memory. Older saved history may remain.';
    else if(status.textContent.startsWith('Storage unavailable:')) status.textContent='Storage available.';
    for(const row of journal.list().slice(-30).reverse()){
      const li=document.createElement('li'),label=document.createElement('p');
      const events=row.events ?? row.steps ?? [];
      label.textContent=`${row.source ?? 'command'} · ${events.map(e=>[e.stage,e.intent,e.captureState,e.reason==='none'?null:e.reason,e.status].filter(Boolean).join(': ')).join(' → ') || 'received'}`;
      li.append(label);
      const raw=events.find(event=>event.rawText)?.rawText;
      if(raw){const words=document.createElement('p');words.textContent=raw;li.append(words);}
      const expected=document.createElement('select');expected.setAttribute('aria-label','Expected command');
      for(const [value,text] of [['unknown','What did you intend?'],['highlight','Highlight'],['highlight-range','Highlight a range'],['annotate','Add a note'],['undo','Undo'],['reading','Follow reading']]){const option=document.createElement('option');option.value=value;option.textContent=text;expected.append(option);}
      expected.value=row.feedback?.expectedIntent ?? 'unknown';
      expected.addEventListener('change',()=>journal.feedback(row.id,{...row.feedback,expectedIntent:expected.value}));li.append(expected);
      for(const [rating,text] of [['worked','Worked'],['missed','Missed']]){
        const button=document.createElement('button');button.textContent=text;
        button.setAttribute('aria-pressed',String(row.feedback?.rating===rating));
        button.addEventListener('click',()=>journal.feedback(row.id ?? row.traceId,{...row.feedback,rating}));li.append(button);
      }
      list.append(li);
    }
  }
  journal.subscribe(render);render();
}
