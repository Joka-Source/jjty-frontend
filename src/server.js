// The application API owns remote work. Local records are not remote receipts.
export function createServerClient({ baseUrl, token, authority, fetchImpl = globalThis.fetch }) {
  const origin = new URL(baseUrl);
  if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') {
    throw new TypeError('Use a server origin without credentials, query or path.');
  }
  if (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname))) {
    throw new TypeError('Use HTTPS for a remote server.');
  }
  if (!token || !authority?.actor_id || !authority?.tenant_scope || !authority?.project_id) {
    throw new TypeError('Server credentials and actor, tenant and project are required.');
  }
  const access = Object.freeze({ ...authority });
  async function request(path, { method = 'GET', body, form = false, binary = false } = {}) {
    const response = await fetchImpl(new URL(path, origin), {
      method, redirect: 'error', credentials: 'omit', cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, ...(body && !form ? {'Content-Type':'application/json'} : {}) },
      ...(body ? {body: form ? body : JSON.stringify(body)} : {}),
    });
    if (response.ok && binary) return response.arrayBuffer();
    let result;
    try { result = await response.json(); }
    catch { throw new Error(`The server returned an unreadable response (${response.status}).`); }
    if (!response.ok) {
      const error = new Error(result.error?.message || result.safe_message || `Server request failed (${response.status}).`);
      error.status = response.status; error.code = result.error?.code || result.code;
      throw error;
    }
    return result;
  }
  const attachmentPath = id => `/api/v1/reader/documents/${encodeURIComponent(id)}/attach`;
  const pendingRequests = new Map();
  const send = body => request('/api/v1/interactions', {method:'POST',body});
  async function interaction(context, operation, payload, requestId = crypto.randomUUID()) {
    const intent = JSON.stringify({operation,authority:access,context,...payload});
    const cached = pendingRequests.get(requestId);
    if (cached && cached.intent !== intent) throw new Error('Use a new request ID for a changed instruction, or retry the original request.');
    if (!cached) {
      const body = JSON.parse(intent);
      body.control = {request_id:requestId,idempotency_key:requestId,deadline_at:new Date(Date.now()+120000).toISOString()};
      pendingRequests.set(requestId,{intent,body});
    }
    return send(pendingRequests.get(requestId).body);
  }
  return {
    retry(requestId) {
      const saved = pendingRequests.get(requestId);
      if (!saved) throw new Error('The original request is not available in this session.');
      return send(saved.body);
    },
    forgetRequest: requestId => pendingRequests.delete(requestId),
    downloadOriginal: objectId => request(`/api/v1/uploads/${encodeURIComponent(objectId)}`,{binary:true}),
    async uploadAndAttach(file) {
      const bytes = await file.arrayBuffer();
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
      const form = new FormData(); form.append('upload',new Blob([bytes],{type:file.type || 'application/pdf'}),file.name);
      const uploaded = await request('/api/v1/uploads',{method:'POST',body:form,form:true});
      if (uploaded.sha256 !== hash) throw new Error('The server did not retain the expected original file.');
      const attached = await request(attachmentPath(uploaded.object_id),{method:'POST'});
      if (attached.source_sha256 !== hash) throw new Error('The attached document differs from the original file.');
      return {...attached,objectId:uploaded.object_id};
    },
    attach: objectId => request(attachmentPath(objectId),{method:'POST'}),
    updateContext: (context, detail) => request('/api/v1/reader/context',{method:'POST',body:{...detail,context}}),
    submit: (context,text,{modality='typed',requestId}={}) => interaction(context,'submit',{input:{modality,text}},requestId),
    async readWork(context) {
      const query = new URLSearchParams({reading_session_id:context.reading_session_id,scene_id:context.scene_id,scene_version:String(context.scene_version),project_id:access.project_id});
      return request(`/api/v1/reader/documents/${encodeURIComponent(context.document_id)}/revisions/${encodeURIComponent(context.document_revision_id)}/work?${query}`);
    },
    undo: (context,work,{requestId=crypto.randomUUID()}={}) => {
      if (!work.undo_operation_id || !Number.isInteger(work.undo_work_version)) throw new Error('No server-confirmed undo is available.');
      return interaction(context,'undo',{undo:{operation_id:work.undo_operation_id,expected_work_version:work.undo_work_version,approved_by:access.actor_id,approval_reference:requestId}},requestId);
    },
  };
}
