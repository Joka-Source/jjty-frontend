#!/usr/bin/env node
import { chmodSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createStore } from './store.mjs';

const [, , command, first, second] = process.argv;

function usage() {
  console.error('usage: backup.mjs export <database.sqlite> <backup.json>');
  console.error('   or: backup.mjs restore <backup.json> <new-database.sqlite>');
  process.exitCode = 2;
}

if (!['export', 'restore'].includes(command) || !first || !second) {
  usage();
} else if (command === 'export') {
  const databasePath = resolve(first);
  const outputPath = resolve(second);
  const temporaryPath = `${outputPath}.tmp-${process.pid}`;
  const store = createStore(databasePath);
  try {
    const backup = store.createBackup();
    writeFileSync(temporaryPath, `${JSON.stringify(backup, null, 2)}\n`, { mode: 0o600 });
    chmodSync(temporaryPath, 0o600);
    renameSync(temporaryPath, outputPath);
    console.log(JSON.stringify({ action: 'export', sha256: backup.sha256, output: outputPath }));
  } finally {
    store.close();
    rmSync(temporaryPath, { force: true });
  }
} else {
  const inputPath = resolve(first);
  const databasePath = resolve(second);
  const bytes = readFileSync(inputPath);
  if (bytes.length > 10 * 1024 * 1024) throw new Error('Backup exceeds the 10 MiB lab limit');
  const backup = JSON.parse(bytes.toString('utf8'));
  const store = createStore(databasePath);
  try {
    const result = store.restoreBackup(backup);
    console.log(JSON.stringify({ action: 'restore', ...result, database: databasePath }));
  } finally {
    store.close();
  }
}
