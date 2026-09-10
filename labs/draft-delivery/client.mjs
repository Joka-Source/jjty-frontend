const state = { session: null, note: null, operation: null, saveTimer: null };
const elements = Object.fromEntries([...document.querySelectorAll('[id]')].map(node => [node.id, node]));

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(state.session ? { 'x-csrf-token': state.session.csrfToken } : {}),
      ...options.headers,
    },
  });
  const value = await response.json();
  if (!response.ok) throw Object.assign(new Error(value.message || value.error), { status: response.status, ...value });
  return { response, value };
}

function renderNote(note) {
  state.note = note;
  elements.revision.textContent = `Revision ${note.revision}`;
  elements.entries.replaceChildren(...note.entries.map(entry => {
    const item = document.createElement('li');
    const text = document.createElement('span');
    const detail = document.createElement('small');
    text.textContent = entry.text;
    detail.textContent = `${entry.author} · revision ${entry.revision}`;
    item.append(text, detail);
    return item;
  }));
  elements['empty-note'].hidden = note.entries.length > 0;
}

async function loadState() {
  const [{ value: note }, { value: draft }] = await Promise.all([api('/api/notes/shared'), api('/api/drafts/shared')]);
  renderNote(note);
  elements.draft.value = draft.text;
  elements['draft-state'].textContent = draft.text ? 'Recovered saved draft.' : 'Draft ready.';
}

async function choosePersona(persona) {
  const { value } = await api(`/api/session?persona=${persona}`);
  state.session = value;
  elements.participant.textContent = `Simulated ${persona}`;
  document.querySelector('.workspace').hidden = false;
  document.querySelectorAll('[data-persona]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.persona === persona)));
  await loadState();
  elements.draft.focus();
}

async function saveDraft() {
  if (!state.session) return;
  elements['draft-state'].textContent = 'Saving draft…';
  try {
    await api('/api/drafts/shared', { method: 'PUT', body: JSON.stringify({ text: elements.draft.value }) });
    elements['draft-state'].textContent = 'Draft saved locally.';
  } catch {
    elements['draft-state'].textContent = 'Draft save failed. Your text remains in this field.';
  }
}

function queueDraftSave() {
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(saveDraft, 180);
}

async function submitOperation(operation, simulateLoss = false) {
  elements['delivery-state'].dataset.kind = 'pending';
  elements['delivery-state'].textContent = simulateLoss ? 'Sending, then hiding the response…' : 'Sending operation…';
  elements.send.disabled = true;
  try {
    const result = await api('/api/notes/shared/entries', { method: 'POST', body: JSON.stringify(operation) });
    if (simulateLoss) throw Object.assign(new Error('Simulated lost response'), { simulated: true });
    state.operation = null;
    elements.retry.hidden = true;
    elements.draft.value = '';
    renderNote(await api('/api/notes/shared').then(item => item.value));
    elements['delivery-state'].dataset.kind = 'saved';
    elements['delivery-state'].textContent = result.response.status === 200 ? 'Retry confirmed the original operation; no duplicate was added.' : 'Entry accepted once.';
  } catch (error) {
    const conflict = error.status === 409 && error.error === 'CONFLICT';
    elements.retry.hidden = conflict;
    elements['delivery-state'].dataset.kind = conflict ? 'conflict' : 'failed';
    elements['delivery-state'].textContent = conflict
      ? `Conflict: server is at revision ${error.currentRevision}. Your draft is preserved; reload and review before sending again.`
      : 'No confirmation received. Retry will reuse the same operation ID.';
  } finally {
    elements.send.disabled = false;
  }
}

document.querySelectorAll('[data-persona]').forEach(button => button.addEventListener('click', () => choosePersona(button.dataset.persona)));
elements.draft.addEventListener('input', queueDraftSave);
elements.composer.addEventListener('submit', async event => {
  event.preventDefault();
  await saveDraft();
  state.operation = {
    operationId: crypto.randomUUID(),
    baseRevision: state.note.revision,
    text: elements.draft.value,
  };
  const simulateLoss = elements['lose-response'].checked;
  elements['lose-response'].checked = false;
  await submitOperation(state.operation, simulateLoss);
});
elements.retry.addEventListener('click', () => state.operation && submitOperation(state.operation));
elements.reload.addEventListener('click', loadState);
