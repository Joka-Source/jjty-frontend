import {initReaderCompactTools} from './reader-compact-tools.js';
import './reader-compact-tools.css';
/** One document renderer, with a manually activated tab strip around it. */
export function initReaderChrome({ activate, close, setWorkspace, fitWidth, organize, compactLayout, readNavigation }) {
  const $ = id => document.getElementById(id);
  const strip = $('reader-tabs');
  let current = { tabs: [], activeId: null, workspace: 'read', zoomMode: 'fit-width', isPdf: false };
  let focusedId = null;
  let closing = false;
  const move = (id, destination) => { const node = $(id); if (node) $(destination).append(node); };

  // Relocate the original controls; their IDs and existing event listeners stay intact.
  const menu = document.createElement('details');
  menu.id = 'reader-document-menu'; menu.className = 'reader-menu';
  const summary = document.createElement('summary'); summary.textContent = 'Document';
  const actions = document.createElement('div'); actions.className = 'reader-menu-content'; actions.id = 'reader-document-actions';
  menu.append(summary, actions);
  $('doc-head').append(menu);
  for (const id of ['rename-document', 'doc-prov-btn', 'download-original', 'doc-prov']) actions.append($(id));
  $('doc-title').classList.add('sr-only');
  move('doc-head', 'reader-document-slot');
  const bento = document.createElement('div'); bento.className = 'reader-bento-controls';
  const bentoLabel = document.createElement('span'); bentoLabel.textContent = 'PDF tools';
  bento.append(bentoLabel, $('bento-tool'), $('bento-original'));
  $('reader-more-tools-content').append(bento);
  move('math-station', 'reader-more-tools-content');
  move('server-panel', 'reader-more-tools-content');
  move('pdf-tools', 'reader-pdf-slot');
  const searchToggle = document.createElement('button'); searchToggle.id='reader-search-toggle'; searchToggle.type='button'; searchToggle.textContent='Find';
  searchToggle.setAttribute('aria-expanded','false'); searchToggle.setAttribute('aria-controls','reader-search-controls');
  const searchControls=document.createElement('div'); searchControls.id='reader-search-controls'; searchControls.hidden=true;
  for(const node of [$('pdf-search-input').previousElementSibling,$('pdf-search-input'),$('pdf-search-previous'),$('pdf-search-next'),$('pdf-search-count')])searchControls.append(node);
  $('pdf-tools').append(searchToggle,searchControls);
  $('pdf-search-previous').textContent='Prev'; $('pdf-search-next').textContent='Next';
  move('pdf-contents', 'pdf-tools');
  searchToggle.addEventListener('click',()=>{searchControls.hidden=!searchControls.hidden;searchToggle.setAttribute('aria-expanded',String(!searchControls.hidden));if(!searchControls.hidden)$('pdf-search-input').focus();});
  move('pdf-annotation-panel', 'reader-workspace-panel');
  move('pdf-form-panel', 'reader-workspace-panel');
  move('review-original', 'reader-organize-panel');
  const organizePages=document.createElement('button');organizePages.type='button';organizePages.id='reader-organize-pages';organizePages.textContent='Organize pages';organizePages.addEventListener('click',()=>{Promise.resolve().then(()=>organize()).catch(reportFailure);});$('reader-workspace-panel').append(organizePages);
  const workspaceBento = document.createElement('button');
  workspaceBento.id = 'reader-workspace-bento'; workspaceBento.type = 'button';
  workspaceBento.addEventListener('click', () => {
    if ($('bento-original').disabled || $('bento-original').hidden) return;
    const operations = {annotate:'edit',organize:'organize',fill:'forms'};
    $('bento-tool').value = operations[current.workspace] || 'organize';
    $('bento-tool').dispatchEvent(new Event('change',{bubbles:true}));
    $('bento-original').click();
  });
  $('reader-workspace-panel').prepend(workspaceBento);

  document.querySelector('.library-heading').append($('home-add-more'));
  const bar = document.querySelector('.bar');
  bar.insertBefore($('tabbar'), bar.querySelector('.status'));
  new ResizeObserver(()=>document.documentElement.style.setProperty('--reader-bar-height',`${Math.ceil(bar.getBoundingClientRect().height)}px`)).observe(bar);
  new ResizeObserver(()=>document.documentElement.style.setProperty('--reader-chrome-height',`${Math.ceil($('reader-chrome').getBoundingClientRect().height)}px`)).observe($('reader-chrome'));
  document.querySelector('.bar').after($('bento-return'));

  // Every existing secondary route remains available in the compact app menu.
  const moreNav = document.querySelector('#more-panel .more-nav');
  const activity = document.createElement('a'); activity.href='#/history'; activity.textContent='All activity';
  moreNav.prepend($('tab-library'), $('tab-history'), activity);
  for (const [id, trigger] of [['library-panel','tab-library'],['history-panel','tab-history'],['more-panel','tab-more']]) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'reader-drawer-close';
    button.textContent = 'Close'; button.addEventListener('click', () => $(trigger).click());
    $(id).prepend(button);
  }

  function showPersistenceError(message) {
    const status = $('reader-persistence-status');
    status.textContent = message || ''; status.hidden = !message;
  }
  const reportFailure = error => showPersistenceError(error?.message || 'The document could not be opened. Try again.');
  function activateTab(id) { Promise.resolve(activate(id)).catch(reportFailure); }
  async function closeTab(id) {
    if (closing) return;
    closing = true;
    const index = current.tabs.findIndex(tab => tab.id === id);
    const next = current.tabs[index+1]?.id || current.tabs[index-1]?.id;
    try {
      await close(id);
      if (current.tabs.some(tab => tab.id === id)) return;
      focusedId = current.tabs.some(tab => tab.id === next) ? next : current.activeId;
      render(current);
      if (focusedId) focusTab(focusedId); else document.querySelector('[data-view-link="home"]')?.focus();
    } catch (error) { reportFailure(error); }
    finally { closing = false; }
  }
  function focusTab(id) {
    focusedId = id;
    for (const tab of strip.querySelectorAll('[role="tab"]')) {
      tab.tabIndex = tab.dataset.documentId === id ? 0 : -1;
      if (tab.tabIndex === 0) tab.focus();
    }
  }
  strip.addEventListener('keydown', event => {
    const tab = event.target.closest('[role="tab"]');
    if (!tab) return;
    const index = current.tabs.findIndex(item => item.id === tab.dataset.documentId);
    let next;
    if (event.key === 'ArrowRight') next = (index+1)%current.tabs.length;
    if (event.key === 'ArrowLeft') next = (index-1+current.tabs.length)%current.tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = current.tabs.length-1;
    if (next !== undefined) { event.preventDefault(); focusTab(current.tabs[next].id); }
    if (event.key === 'Delete') { event.preventDefault(); void closeTab(tab.dataset.documentId); }
    // Native button Enter/Space dispatch click, so activation remains manual.
  });
  const workspaceNav=document.createElement('nav');workspaceNav.id='reader-workspace-nav';workspaceNav.setAttribute('aria-label','Document workspace');
  for(const option of $('reader-workspace').options){
    const item=document.createElement('button');item.type='button';item.dataset.workspace=option.value;item.textContent=option.textContent;
    item.addEventListener('click',()=>{$('reader-workspace').value=option.value;$('reader-workspace').dispatchEvent(new Event('change',{bubbles:true}));});workspaceNav.append(item);
  }
  $('reader-toolbar').before(workspaceNav);
  $('reader-workspace').addEventListener('change', event => Promise.resolve().then(()=>setWorkspace(event.target.value)).catch(error=>{render(current);reportFailure(error);}));
  $('pdf-fit-width').addEventListener('click', () => Promise.resolve(fitWidth()).catch(reportFailure));

  function workspaceView() {
    document.body.dataset.readerWorkspace = current.workspace;
    $('pdf-edit-panel').hidden=current.workspace!=='edit'||!current.isPdf;
    organizePages.hidden=current.workspace!=='organize'||!current.isPdf;
    organizePages.disabled=!current.activeId;
    workspaceBento.hidden = ['read','annotate','edit','organize'].includes(current.workspace) || $('bento-original').hidden;
    workspaceBento.disabled = $('bento-original').disabled;
    workspaceBento.textContent = `${({annotate:'Annotate',organize:'Organize',fill:'Fill'})[current.workspace] || 'Open'} original in Bento`;
    workspaceBento.title = 'Open an original copy. Saved JETT marks and form answers stay here.';
    $('reader-workspace-panel').hidden = !current.activeId || !current.isPdf || ['read','annotate'].includes(current.workspace);
    const panel = current.workspace === 'fill' ? $('pdf-form-panel') : current.workspace === 'annotate' ? $('pdf-annotation-panel') : null;
    if (panel && current.workspace==='fill') panel.open = true;
    $('reader-workspace-hint').textContent = current.workspace === 'fill' && $('pdf-form-panel').hidden
      ? 'No fillable fields are available here. More tools includes Bento PDF form tools.' : current.workspace==='organize' ? 'Organize a copy with your saved marks, notes and form answers.' : '';
    $('reader-workspace-hint').hidden = !$('reader-workspace-hint').textContent;
  }
  function render(value) {
    const previousFocus = document.activeElement?.closest('[role="tab"]')?.dataset.documentId;
    const previousActiveId=current.activeId;
    current = { ...current, ...value };
    if (previousActiveId!==current.activeId) document.querySelectorAll('.reader-menu[open]').forEach(menu=>{menu.open=false;});
    if (current.activeId && document.body.classList.contains('sheet-library')) $('tab-library').click();
    if (!current.tabs.some(tab => tab.id === focusedId)) focusedId = current.activeId || current.tabs[0]?.id;
    strip.replaceChildren();
    for (const doc of current.tabs) {
      const item = document.createElement('div'); item.className = 'reader-tab'; item.classList.toggle('is-active', doc.id === current.activeId);
      const tab = document.createElement('button'); tab.type = 'button'; tab.role = 'tab'; tab.dataset.documentId = doc.id;
      tab.id = `reader-tab-${doc.id}`; tab.setAttribute('aria-controls', 'reader-main'); tab.setAttribute('aria-selected', String(doc.id === current.activeId));
      tab.tabIndex = doc.id === focusedId ? 0 : -1; tab.textContent = doc.title || 'Untitled'; tab.title = doc.title || 'Untitled';
      tab.addEventListener('focus', () => { focusedId = doc.id; }); tab.addEventListener('click', () => activateTab(doc.id));
      const dismiss = document.createElement('button'); dismiss.type = 'button'; dismiss.dataset.closeDocumentId = doc.id;
      dismiss.className = 'reader-tab-close'; dismiss.textContent = '×'; dismiss.setAttribute('aria-label', `Close ${doc.title || 'Untitled'} tab`);
      dismiss.addEventListener('click', () => void closeTab(doc.id));
      item.append(tab, dismiss); strip.append(item);
    }
    if (current.activeId) $('reader-main').setAttribute('aria-labelledby', `reader-tab-${current.activeId}`);
    else $('reader-main').removeAttribute('aria-labelledby');
    if ($('pdf-search-input').value) { searchControls.hidden=false; searchToggle.setAttribute('aria-expanded','true'); }
    for(const option of $('reader-workspace').options) option.disabled=option.value!=='read'&&!current.isPdf&&!(current.isEpub&&option.value==='annotate');
    $('reader-workspace').value = current.isPdf||current.isEpub ? current.workspace : 'read';
    $('reader-workspace').disabled = !current.activeId;
    for(const item of workspaceNav.children){item.disabled=!current.activeId||(item.dataset.workspace!=='read'&&!current.isPdf&&!(current.isEpub&&item.dataset.workspace==='annotate'));item.setAttribute('aria-current',item.dataset.workspace===current.workspace?'page':'false');}
    $('pdf-fit-width').setAttribute('aria-pressed', String(current.zoomMode === 'fit-width'));
    workspaceView();
    compactTools?.refresh();
    if (previousFocus && current.tabs.some(tab => tab.id === previousFocus)) focusTab(previousFocus);
  }
  new MutationObserver(workspaceView).observe($('pdf-form-panel'), { attributes:true, attributeFilter:['hidden'] });
  new MutationObserver(workspaceView).observe($('bento-original'), { attributes:true, attributeFilter:['hidden','disabled'] });

  // Drawers use the existing shell state. Keep keyboard focus inside the open sheet.
  let drawer = null, returnFocus = null;
  const inertRoots = [...document.querySelectorAll('.view, #reader-main, #reader-chrome, .bar')];
  function syncDrawer() {
    const kind = ['library','history','more'].find(kind => document.body.classList.contains(`sheet-${kind}`));
    const next = kind ? $(`${kind === 'library' ? 'library' : kind === 'history' ? 'history' : 'more'}-panel`) : null;
    if (next === drawer) return;
    const previous = drawer; drawer = next;
    inertRoots.forEach(node => { node.inert = !!next; });
    if (next) {
      if (!previous) returnFocus = document.activeElement;
      next.setAttribute('role', 'dialog'); next.setAttribute('aria-modal', 'true');
      next.setAttribute('aria-label', kind === 'history' ? 'Activity' : kind === 'library' ? 'Documents' : 'More');
      next.querySelector('button')?.focus();
    } else if (returnFocus?.isConnected) returnFocus.focus();
  }
  new MutationObserver(syncDrawer).observe(document.body, {attributes:true,attributeFilter:['class']});
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (drawer) { event.preventDefault(); drawer.querySelector('.reader-drawer-close')?.click(); }
      else document.querySelectorAll('.reader-menu[open]').forEach(menu => { menu.open=false; menu.querySelector('summary')?.focus(); });
    }
    if (event.key === 'Tab' && drawer) {
      const controls = [...drawer.querySelectorAll('button,a,input,select,textarea,summary')].filter(node=>!node.disabled&&!node.hidden&&node.getClientRects().length);
      const first=controls[0], last=controls.at(-1);
      if (event.shiftKey && document.activeElement===first) {event.preventDefault();last?.focus();}
      else if (!event.shiftKey && document.activeElement===last) {event.preventDefault();first?.focus();}
    }
  });
  for (const menu of document.querySelectorAll('.reader-menu')) menu.addEventListener('toggle', () => {
    if (menu.open) for (const other of document.querySelectorAll('.reader-menu[open]')) if(other!==menu)other.open=false;
  });
  const compactTools=initReaderCompactTools({read:()=>{const navigation=readNavigation?.();return {...navigation,owner:navigation?.owner??current.activeId,isPdf:current.isPdf};},layout:compactLayout});
  render(current);
  return { render, showPersistenceError };
}
