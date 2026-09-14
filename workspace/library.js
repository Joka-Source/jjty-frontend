const timestamp = value => typeof value === 'number' ? value : Date.parse(value || '') || 0;

export function libraryItems(documents, notebooks) {
  const docs = documents.map(d => ({key:`document:${d.id}`, id:d.id, title:d.title || 'Untitled document', kind:d.provenance?.sourceKind === 'pdf' ? 'pdf' : 'document', text:d.text || '', updated:timestamp(d.updatedAt || d.createdAt), url:`/?workspaceDocument=${encodeURIComponent(d.id)}#/read`}));
  const notes = notebooks.map(n => ({key:`notebook:${n.id}`, id:n.id, title:n.title || 'Untitled notebook', kind:'notebook', text:(n.pages || []).flatMap(p=>(p.items || []).filter(i=>i.type==='text').map(i=>i.text)).join(' '), updated:timestamp(n.updated), url:`/notebooks/index.html?notebook=${encodeURIComponent(n.id)}`}));
  return [...docs,...notes].sort((a,b)=>b.updated-a.updated || a.title.localeCompare(b.title));
}

export function filterLibrary(items, query = '', kind = 'all') {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return items.filter(item => (kind==='all' || item.kind===kind) && terms.every(term=>`${item.title} ${item.text}`.toLocaleLowerCase().includes(term)));
}

export async function readLibrary() {
  const [{getDocs},{loadWorkspace}] = await Promise.all([import('../src/db.js'),import('../notebooks/storage.js')]);
  const [docs,workspace] = await Promise.all([getDocs(),loadWorkspace()]);
  // Match the notebook editor's read-before-migrate behavior without mutating it.
  let notebooks = workspace?.notebooks;
  if (!notebooks) {
    const raw = localStorage.getItem('jett-notebooks-v1');
    if (raw) {
      const {validate} = await import('../notebooks/model.js');
      notebooks = validate(JSON.parse(raw)).notebooks;
    }
  }
  return libraryItems(docs,notebooks || []);
}
