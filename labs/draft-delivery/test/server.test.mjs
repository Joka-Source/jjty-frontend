import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../server.mjs';

async function setup(t) {
  const directory = mkdtempSync(join(tmpdir(), 'jett-http-lab-'));
  const server = await startServer({ databasePath: join(directory, 'lab.sqlite') });
  t.after(async () => {
    await server.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return server;
}

async function session(server, persona) {
  const response = await fetch(`${server.url}/api/session?persona=${persona}`);
  assert.equal(response.status, 200);
  return { cookie: response.headers.get('set-cookie').split(';', 1)[0], ...(await response.json()) };
}

function mutation(server, session, path, method, body, origin = server.url) {
  return fetch(`${server.url}${path}`, {
    method,
    headers: {
      cookie: session.cookie,
      origin,
      'content-type': 'application/json',
      'x-csrf-token': session.csrfToken,
    },
    body: JSON.stringify(body),
  });
}

test('fixture session can save a draft and retry one append without duplication', async t => {
  const server = await setup(t);
  const alex = await session(server, 'alex');
  let response = await mutation(server, alex, '/api/drafts/shared', 'PUT', { text: 'recover me' });
  assert.equal(response.status, 200);
  const operation = { operationId: 'http-op-1', baseRevision: 0, text: 'recover me' };
  response = await mutation(server, alex, '/api/notes/shared/entries', 'POST', operation);
  assert.equal(response.status, 201);
  const first = await response.json();
  response = await mutation(server, alex, '/api/notes/shared/entries', 'POST', operation);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), first);
  response = await fetch(`${server.url}/api/notes/shared`, { headers: { cookie: alex.cookie } });
  assert.equal((await response.json()).entries.length, 1);
});

test('mutations require the fixture session, same origin and CSRF token', async t => {
  const server = await setup(t);
  const alex = await session(server, 'alex');
  const path = '/api/drafts/shared';
  assert.equal((await fetch(`${server.url}${path}`, { method: 'PUT' })).status, 401);
  assert.equal((await mutation(server, { ...alex, csrfToken: 'wrong' }, path, 'PUT', { text: 'x' })).status, 403);
  assert.equal((await mutation(server, alex, path, 'PUT', { text: 'x' }, 'https://attacker.invalid')).status, 403);
});

test('participants cannot read or mutate another participant private note', async t => {
  const server = await setup(t);
  const sam = await session(server, 'sam');
  assert.equal((await fetch(`${server.url}/api/notes/alex-private`, { headers: { cookie: sam.cookie } })).status, 404);
  assert.equal((await mutation(server, sam, '/api/drafts/alex-private', 'PUT', { text: 'no' })).status, 404);
});

test('invalid personas and oversized request bodies fail closed', async t => {
  const server = await setup(t);
  assert.equal((await fetch(`${server.url}/api/session?persona=unknown`)).status, 400);
  const alex = await session(server, 'alex');
  const response = await mutation(server, alex, '/api/drafts/shared', 'PUT', { text: 'x'.repeat(70_000) });
  assert.equal(response.status, 413);
});

test('serves the original learning UI and source explanation from loopback', async t => {
  const server = await setup(t);
  const response = await fetch(`${server.url}/`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^text\/html/);
  const html = await response.text();
  assert.match(html, /Draft and delivery lab/);
  assert.match(html, /Simulated participants/);
  assert.match(html, /What the code proves/);
  assert.match(html, /href="\/source\/store\.mjs"/);
  for (const asset of ['/client.mjs', '/styles.css']) {
    const assetResponse = await fetch(`${server.url}${asset}`);
    assert.equal(assetResponse.status, 200);
  }
  const source = await fetch(`${server.url}/source/store.mjs`);
  assert.equal(source.status, 200);
  assert.match(source.headers.get('content-type'), /^text\/plain/);
  assert.match(await source.text(), /export function createStore/);
});
