export const sections = ['Inbox', 'Messages', 'Library', 'PDF tools', 'Connections', 'Settings'];
export const initial = { drafts: {}, appearance: 'system', reducedMotion: false, density: 'comfortable' };
export function loadState(storage) {
  try {
    const raw = JSON.parse(storage.getItem('jjty-workspace-v1') || '{}');
    return { ...initial, ...raw, drafts: raw.drafts && typeof raw.drafts === 'object' ? raw.drafts : {} };
  } catch { return structuredClone(initial); }
}
export function saveState(storage, state, change) {
 const latest=loadState(storage);
 if(change){latest.drafts[change.section]={...(latest.drafts[change.section]||{}),[change.field]:state.drafts[change.section][change.field]};}
 else {latest.appearance=state.appearance;latest.reducedMotion=state.reducedMotion;latest.density=state.density;}
 storage.setItem('jjty-workspace-v1', JSON.stringify(latest));
}
export const providers = [{ name: 'Gmail', capabilities: ['Email', 'Attachments', 'Folders'], state: 'Not connected' }, { name: 'Messaging', capabilities: ['Channels', 'Threads', 'Files'], state: 'Not connected' }];
