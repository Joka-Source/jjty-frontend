import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createStore } from '../store.mjs';

test('backup CLI exports and restores a restart-readable database', t => {
  const directory = mkdtempSync(join(tmpdir(), 'jett-lab-backup-cli-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const sourcePath = join(directory, 'source.sqlite');
  const restoredPath = join(directory, 'restored.sqlite');
  const backupPath = join(directory, 'backup.json');
  const source = createStore(sourcePath);
  source.saveDraft('sam', 'shared', 'survives restoration');
  source.append('alex', { operationId: 'cli-op', noteId: 'shared', baseRevision: 0, text: 'accepted once' });
  source.close();

  for (const args of [['export', sourcePath, backupPath], ['restore', backupPath, restoredPath]]) {
    const result = spawnSync(process.execPath, ['labs/draft-delivery/backup.mjs', ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
  assert.equal(statSync(backupPath).mode & 0o777, 0o600);
  const artifact = JSON.parse(readFileSync(backupPath, 'utf8'));
  assert.match(artifact.sha256, /^[a-f0-9]{64}$/);

  const restored = createStore(restoredPath);
  assert.equal(restored.getDraft('sam', 'shared').text, 'survives restoration');
  assert.equal(restored.getNote('sam', 'shared').entries[0].text, 'accepted once');
  restored.close();
});
