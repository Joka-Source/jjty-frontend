import {encodeLibraryBackup, decodeLibraryBackup} from './library-backup.js';
import {readLibrarySnapshot, restoreLibrarySnapshot} from './db.js';

const MAX_BYTES = 100 * 1024 * 1024;
const count = (n, label) => `${n} ${label}${n === 1 ? '' : 's'}`;
const summary = snapshot => `${count(snapshot.docs.length, 'document')}, ${count(snapshot.records.length, 'saved change')}, ${count(snapshot.positions.length, 'reading position')}`;
function explain(error) {
  const messages = {
    BACKUP_ID_COLLISION: 'Some documents or changes already exist here. Restore to a different library, or keep the existing copy.',
    BACKUP_TOO_LARGE: 'This backup exceeds the 100 MiB limit.',
    BACKUP_UNSUPPORTED_FORMAT: 'Choose a file made with Back up library in JETT.',
    BACKUP_SOURCE_DIGEST_MISMATCH: 'An original file does not match its recorded fingerprint.',
    BACKUP_RESTORE_FAILED: 'Storage could not accept the backup. Check available space and try again.',
  };
  if (messages[error.code || error.message]) return messages[error.code || error.message];
  if (String(error.code || error.message).startsWith('BACKUP_')) return 'The backup contains invalid or inconsistent library data.';
  return error.message || 'The operation could not finish. Try again.';
}

export function initLibraryBackupPanel({refresh}) {
  const download = document.getElementById('library-backup-download');
  const file = document.getElementById('library-backup-file');
  const preview = document.getElementById('library-backup-preview');
  const restore = document.getElementById('library-backup-restore');
  const status = document.getElementById('library-backup-status');
  let generation = 0, staged = null, restoring = false, exporting = false;

  download.addEventListener('click', async () => {
    if (download.disabled || restoring) return;
    exporting = true; download.disabled = true; file.disabled = true; restore.disabled = true;
    try {
      const text = await encodeLibraryBackup(await readLibrarySnapshot());
      const url = URL.createObjectURL(new Blob([text], {type: 'application/json'}));
      const link = document.createElement('a');
      link.href = url; link.download = `jett-library-${new Date().toISOString().slice(0, 10)}.json`;
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
      status.textContent = 'Library backup prepared for download.';
    } catch (error) {
      status.textContent = `Could not back up the library: ${explain(error)}`;
    } finally { exporting = false; download.disabled = false; file.disabled = false; restore.disabled = !staged; }
  });

  file.addEventListener('change', async () => {
    if (restoring) return;
    const version = ++generation, selected = file.files?.[0];
    staged = null; restore.hidden = true; restore.disabled = true;
    preview.textContent = ''; status.textContent = '';
    if (!selected) return;
    status.textContent = 'Checking library backup…';
    try {
      if (selected.size > MAX_BYTES) throw new Error('Choose a backup smaller than 100 MiB.');
      const snapshot = await decodeLibraryBackup(await selected.text());
      if (version !== generation) return;
      staged = snapshot; preview.textContent = `${summary(snapshot)}. Ready to restore.`;
      restore.hidden = false; restore.disabled = exporting; status.textContent = '';
    } catch (error) {
      if (version === generation) status.textContent = `Could not read this backup: ${explain(error)}`;
    }
  });

  restore.addEventListener('click', async () => {
    if (restoring || exporting || !staged || restore.disabled) return;
    const snapshot = staged;
    restoring = true; restore.disabled = true; file.disabled = true; download.disabled = true;
    status.textContent = 'Restoring library…';
    let committed = false;
    try {
      await restoreLibrarySnapshot(snapshot); committed = true;
      staged = null; restore.hidden = true; file.value = ''; preview.textContent = '';
      status.textContent = `Restored ${summary(snapshot)}. Your existing library is unchanged.`;
      await refresh();
    } catch (error) {
      status.textContent = committed
        ? 'The library was restored. Reload JETT to refresh the view.'
        : `Could not restore this backup: ${explain(error)} Nothing from it was added.`;
    } finally {
      restoring = false; file.disabled = false; download.disabled = false; restore.disabled = !staged;
    }
  });
}
