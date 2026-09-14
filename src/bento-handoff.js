/** Original-copy custody and retry-safe return from the local Bento adapter. */
export const BENTO_PENDING_KEY = 'jett.bento.pending.v1';
export const MAX_BENTO_BYTES = 64 * 1024 * 1024;
export const BENTO_TOOLS = Object.freeze({ organize: 'pdf-multi-tool', edit: 'edit-pdf', text: 'edit-pdf-text', forms: 'form-filler', sign: 'sign-pdf', ocr: 'ocr-pdf' });
function toolRoute(tool = 'organize') {
  if (!Object.hasOwn(BENTO_TOOLS, tool)) throw new Error('Choose a supported Bento tool.');
  return BENTO_TOOLS[tool];
}
export function bentoBase(configured, hostname) {
  const value = configured || (['localhost', '127.0.0.1'].includes(hostname) ? 'http://127.0.0.1:5181' : '');
  if (!value) return null;
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid Bento server address.');
  return url.origin;
}
function pdfBytes(raw) {
  const bytes = raw instanceof Uint8Array ? raw.slice() : new Uint8Array(Object.values(raw || {}));
  if (!bytes.length || bytes.length > MAX_BENTO_BYTES || new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') throw new Error('Bento needs a PDF of up to 64 MiB.');
  return bytes;
}
export function createBentoHandoff({ base, storage, fetch: request = globalThis.fetch, getDocument, importDocument }) {
  function pending() {
    const raw = storage.getItem(BENTO_PENDING_KEY);
    if (!raw) return null;
    const job = JSON.parse(raw);
    if (job.base !== base || !/^[a-zA-Z0-9_-]{16,128}$/.test(job.token)) throw new Error('The saved Bento session belongs to another server or is invalid.');
    return job;
  }
  async function call(path, options = {}) {
    if (!base) throw new Error('Bento is not configured for this JETT installation.');
    let response;
    try { response = await request(`${base}/api/jett/handoffs${path}`, { ...options, signal: AbortSignal.timeout(30000) }); }
    catch { throw new Error('Cannot reach Bento. Start the local Bento server and retry. Your original is safe.'); }
    if (!response.ok && !(options.method === 'DELETE' && [404, 410].includes(response.status))) {
      const error = new Error(response.status === 404 ? 'This Bento session is no longer available. Dismiss it and reopen the original in Bento.' : `Bento could not finish the request (${response.status}). Retry when the server is ready.`);
      error.status = response.status; throw error;
    }
    return response;
  }
  const api = {
    pending,
    hasPending() { return !!storage.getItem(BENTO_PENDING_KEY); },
    url(job, full = false) { return `${base}/${full ? 'tools' : toolRoute(job?.tool)}.html${job ? `#jett=${job.token}` : ''}`; },
    async start(doc, tool = 'organize') {
      toolRoute(tool);
      if (pending()) throw new Error('Save or dismiss the current Bento session before opening another.');
      if (doc?.provenance?.sourceKind !== 'pdf') throw new Error('Open a PDF first.');
      const bytes = pdfBytes(doc.sourceBytes);
      const response = await call('', { method: 'POST', headers: { 'Content-Type': 'application/pdf', 'X-JETT-Filename': encodeURIComponent(doc.provenance.name || `${doc.title}.pdf`) }, body: bytes });
      const { token } = await response.json();
      if (!/^[a-zA-Z0-9_-]{16,128}$/.test(token)) throw new Error('Bento returned an invalid session.');
      const job = { base, token, tool, id: `doc_bento_${token}`, parentId: doc.id, parentDigest: doc.provenance.contentDigest, name: doc.title, createdAt: new Date().toISOString() };
      // Persist before opening the tool, so reload never loses the return address.
      storage.setItem(BENTO_PENDING_KEY, JSON.stringify(job));
      return job;
    },
    async save() {
      const job = pending();
      if (!job) throw new Error('No Bento session is waiting.');
      let result;
      try { result = await (await call(`/${job.token}/result`)).json(); }
      catch (error) {
        const saved = job.lastSavedId && await getDocument(job.lastSavedId);
        if ([404, 410].includes(error.status) && saved) {
          storage.removeItem(BENTO_PENDING_KEY);
          return { doc: saved, cleanupPending: false };
        }
        throw error;
      }
      if (!result.ready) return null;
      if (typeof result.base64 !== 'string' || result.base64.length > Math.ceil(MAX_BENTO_BYTES / 3) * 4 || !/^[a-f0-9]{64}$/.test(result.digest)) throw new Error('Bento returned an invalid or oversized PDF.');
      let bytes;
      try { bytes = pdfBytes(Uint8Array.from(atob(result.base64), c => c.charCodeAt(0))); }
      catch { throw new Error('Bento returned an invalid or oversized PDF. Nothing was imported.'); }
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('');
      if (digest !== result.digest) throw new Error('Bento result verification failed. Nothing was imported.');
      const id = `${job.id}_${digest}`;
      let doc = await getDocument(id);
      if (!doc) {
        doc = await importDocument(bytes, typeof result.name === 'string' ? result.name : 'Bento result.pdf', { id, derivedFrom: { documentId: job.parentId, contentDigest: job.parentDigest, tool: 'BentoPDF', handoffId: job.token, resultDigest: digest } });
        if (!doc) throw new Error('JETT could not read this PDF. The result remains in Bento; download it there.');
      }
      storage.setItem(BENTO_PENDING_KEY, JSON.stringify({ ...job, lastSavedId: id }));
      // Conditional deletion never discards an export produced while this one saved.
      try { await call(`/${job.token}`, { method: 'DELETE', headers: { 'If-Match': digest } }); }
      catch (error) { return { doc, cleanupPending: true, newerResult: error.status === 409 }; }
      storage.removeItem(BENTO_PENDING_KEY);
      return { doc, cleanupPending: false };
    },
    async dismiss() {
      let job;
      try { job = pending(); }
      catch { storage.removeItem(BENTO_PENDING_KEY); return; }
      if (job) {
        let digest;
        try { const result = await (await call(`/${job.token}/result`)).json(); digest = result.digest; }
        catch (error) { if (![404, 410].includes(error.status)) throw error; }
        await call(`/${job.token}`, { method: 'DELETE', headers: digest ? { 'If-Match': digest } : {} });
      }
      storage.removeItem(BENTO_PENDING_KEY);
    },
  };
  for (const method of ['start', 'save', 'dismiss']) {
    const operation = api[method];
    api[method] = (...args) => globalThis.navigator?.locks
      ? navigator.locks.request('jett-bento-session', () => operation(...args))
      : operation(...args);
  }
  return api;
}
