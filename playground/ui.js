export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function statusBadge(status){return `<span class="status ${escapeHtml(status)}">${({implemented:'Implemented',partial:'Partial',planned:'Planned'})[status]||escapeHtml(status)}</span>`;}
export function feedback(state,subject='Your work') {
 const messages={empty:["Nothing here yet",'Create or import something to get started.'],loading:['Opening your work…','Keep this window open while it loads.'],saved:['Saved on this device','Your changes are available when you return.'],offline:['You’re offline','You can continue with work already saved on this device.'],error:['Could not save changes','Your text is still here. Retry before leaving.'],permission:['Microphone access','Allow access when you want to record. You can keep working with text.']};
 const [title,body]=messages[state]||[state==='ready'?subject:state.replaceAll('-',' '),state==='ready'?'Ready for your next action.':'Journey state under review. This specimen does not perform the underlying operation.'];
 return `<div class="notice ${state==='error'?'error':state==='saved'?'success':state}" role="${state==='error'?'alert':'status'}"><strong>${title}</strong><p>${body}</p></div>`;
}
