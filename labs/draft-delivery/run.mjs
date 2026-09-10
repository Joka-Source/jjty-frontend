#!/usr/bin/env node
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { startServer } from './server.mjs';

const databasePath = resolve(process.env.JETT_LAB_DATABASE ?? '.local/draft-delivery.sqlite');
mkdirSync(dirname(databasePath), { recursive: true });
const server = await startServer({ databasePath });
console.log(`Draft and delivery lab listening at ${server.url}`);
console.log(`SQLite: ${databasePath}`);

let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await server.close();
  process.exit(0);
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
