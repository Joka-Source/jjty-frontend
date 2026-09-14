import { bentoBase, createBentoHandoff, BENTO_TOOLS } from './bento-handoff.js';
export function initBentoPanel({ getCurrentDocument, getDocument, importDocument }) {
  const source = document.getElementById('bento-original');
  const tool = document.getElementById('bento-tool');
  const tools = document.getElementById('bento-tools');
  const panel = document.getElementById('bento-return');
  const status = document.getElementById('bento-status');
  const save = document.getElementById('bento-save');
  const resume = document.getElementById('bento-resume');
  const dismiss = document.getElementById('bento-dismiss');
  let base, bridge, initializationError, busy = false;
  try { base = bentoBase(import.meta.env.VITE_BENTO_URL, location.hostname); bridge = createBentoHandoff({ base, storage: localStorage, getDocument, importDocument }); }
  catch (error) { initializationError = `Bento handoff needs local storage: ${error.message}`; }
  function refresh(message) {
    let job, hasPending = false;
    try { hasPending = bridge?.hasPending(); job = bridge?.pending(); } catch (error) { message = error.message; }
    panel.hidden = !job && !message;
    status.textContent = message || (job ? `“${job.name}” is open in Bento. Export a PDF there, then save the result here as a new document.` : '');
    save.hidden = resume.hidden = !job;
    dismiss.hidden = !hasPending && !message;
    dismiss.textContent = hasPending ? 'Dismiss session' : 'Close';
    save.disabled = resume.disabled = dismiss.disabled = busy;
    source.disabled = busy || !!job;
    tool.disabled = busy || !!job;
    if (job) tool.value = Object.hasOwn(BENTO_TOOLS, job.tool) ? job.tool : 'organize';
  }
  async function run(action) {
    if (busy) return;
    busy = true; refresh('Working with Bento…');
    let message;
    try { message = await action(); } catch (error) { message = error.message; }
    finally { busy = false; refresh(message); }
  }
  tools.addEventListener('click', () => {
    if (!base) return refresh('Bento is not configured for this JETT installation.');
    window.open(`${base}/tools.html`, '_blank', 'noopener,noreferrer');
  });
  source.addEventListener('click', () => {
    if (!base) return refresh('Bento is not configured for this JETT installation.');
    if (!bridge) return refresh(initializationError || 'Bento handoff needs local storage enabled.');
    // Create the window during the gesture; navigation follows durable session creation.
    const popup = window.open('about:blank', '_blank');
    if (!popup) return refresh('Allow a new tab for Bento, then try again.');
    popup.opener = null;
    void run(async () => {
      try { const job = await bridge.start(getCurrentDocument(), tool.value); popup.location = bridge.url(job); }
      catch (error) { popup.close(); throw error; }
      return 'Original copy opened in Bento. JETT annotations and saved form changes stay here. Export a PDF in Bento, then save its result below.';
    });
  });
  resume.addEventListener('click', () => { const job = bridge.pending(); if (job) window.open(bridge.url(job), '_blank', 'noopener,noreferrer'); });
  save.addEventListener('click', () => void run(async () => {
    const result = await bridge.save();
    return !result ? 'No PDF returned yet. Export or download your finished PDF in Bento, then try Save Bento result again.' : result.newerResult ? `Saved “${result.doc.title}”. A newer Bento export is waiting; save again to keep that version too.` : result.cleanupPending ? `Saved “${result.doc.title}” on this device. Retry Save to clear the Bento session; it will not create another document.` : `Saved “${result.doc.title}” as a new document. Your original is unchanged.`;
  }));
  dismiss.addEventListener('click', () => {
    try { if (!bridge?.hasPending()) return refresh(); } catch { return refresh(); }
    if (confirm('Discard this Bento return session? Download any result you want to keep in Bento first. An unavailable session will be forgotten on this device. Your JETT original stays saved.')) void run(async () => { await bridge.dismiss(); return 'Bento session dismissed. Your original is unchanged.'; });
  });
  window.addEventListener('storage', event => { if (event.key === 'jett.bento.pending.v1') refresh(); });
  refresh(initializationError);
  return { update(doc) { tool.hidden = source.hidden = doc?.provenance?.sourceKind !== 'pdf' || !doc.sourceBytes; } };
}
