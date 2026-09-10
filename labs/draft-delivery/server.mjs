import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createStore } from './store.mjs';

const MAX_BODY_BYTES = 64 * 1024;

function send(response, status, value, headers = {}) {
  const body = value === undefined ? '' : JSON.stringify(value);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers,
  });
  response.end(body);
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(part => part.trim().split('=', 2)).filter(pair => pair.length === 2));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    let tooLarge = false;
    request.setEncoding('utf8');
    request.on('data', chunk => {
      size += Buffer.byteLength(chunk);
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
      } else if (!tooLarge) body += chunk;
    });
    request.on('end', () => {
      if (tooLarge) return reject(Object.assign(new Error('Request body too large'), { code: 'BODY_TOO_LARGE' }));
      try { resolve(JSON.parse(body || '{}')); }
      catch { reject(Object.assign(new Error('Invalid JSON'), { code: 'INVALID_INPUT' })); }
    });
    request.on('error', reject);
  });
}

export async function startServer({ databasePath, host = '127.0.0.1', port = 0 }) {
  const store = createStore(databasePath);
  const sessions = new Map();
  const acceptedThisRun = new Set();
  let origin;
  const staticFiles = new Map([
    ['/', ['index.html', 'text/html; charset=utf-8']],
    ['/client.mjs', ['client.mjs', 'text/javascript; charset=utf-8']],
    ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
    ['/source/store.mjs', ['store.mjs', 'text/plain; charset=utf-8']],
    ['/source/server.mjs', ['server.mjs', 'text/plain; charset=utf-8']],
    ['/source/client.mjs', ['client.mjs', 'text/plain; charset=utf-8']],
  ]);

  const httpServer = createServer(async (request, response) => {
    const url = new URL(request.url, origin ?? `http://${host}`);
    try {
      if (request.method === 'GET' && staticFiles.has(url.pathname)) {
        const [name, contentType] = staticFiles.get(url.pathname);
        const body = readFileSync(new URL(name, import.meta.url));
        response.writeHead(200, {
          'content-type': contentType,
          'cache-control': 'no-store',
          'content-security-policy': "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
          'x-content-type-options': 'nosniff',
        });
        return response.end(body);
      }
      if (request.method === 'GET' && url.pathname === '/api/session') {
        const participant = url.searchParams.get('persona');
        if (!['alex', 'sam'].includes(participant)) return send(response, 400, { error: 'INVALID_IDENTITY' });
        const sessionId = randomBytes(32).toString('base64url');
        const csrfToken = randomBytes(32).toString('base64url');
        sessions.set(sessionId, { participant, csrfToken });
        return send(response, 200, { participant, csrfToken, simulatedIdentity: true }, {
          'set-cookie': `jett_lab_session=${sessionId}; HttpOnly; SameSite=Strict; Path=/`,
        });
      }

      const sessionId = parseCookies(request.headers.cookie).jett_lab_session;
      const session = sessions.get(sessionId);
      if (!session) return send(response, 401, { error: 'UNAUTHENTICATED' });

      const mutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method);
      if (mutation && (request.headers.origin !== origin || request.headers['x-csrf-token'] !== session.csrfToken)) {
        return send(response, 403, { error: 'REQUEST_GUARD_FAILED' });
      }

      let match = url.pathname.match(/^\/api\/notes\/([^/]+)$/);
      if (request.method === 'GET' && match) return send(response, 200, store.getNote(session.participant, decodeURIComponent(match[1])));

      match = url.pathname.match(/^\/api\/drafts\/([^/]+)$/);
      if (request.method === 'GET' && match) return send(response, 200, store.getDraft(session.participant, decodeURIComponent(match[1])));
      if (request.method === 'PUT' && match) {
        const input = await readJson(request);
        return send(response, 200, store.saveDraft(session.participant, decodeURIComponent(match[1]), input.text));
      }

      match = url.pathname.match(/^\/api\/notes\/([^/]+)\/entries$/);
      if (request.method === 'POST' && match) {
        const input = await readJson(request);
        const operation = { ...input, noteId: decodeURIComponent(match[1]) };
        const key = `${session.participant}:${operation.operationId}`;
        const previouslyAccepted = acceptedThisRun.has(key);
        const result = store.append(session.participant, operation);
        acceptedThisRun.add(key);
        return send(response, previouslyAccepted ? 200 : 201, result);
      }

      return send(response, 404, { error: 'NOT_FOUND' });
    } catch (error) {
      const status = error.code === 'BODY_TOO_LARGE' ? 413
        : error.code === 'NOT_FOUND' ? 404
          : error.code === 'CONFLICT' ? 409
            : error.code === 'OPERATION_MISMATCH' ? 409
              : 400;
      if (!response.headersSent) send(response, status, { error: error.code ?? 'INVALID_INPUT', message: error.message, currentRevision: error.currentRevision });
    }
  });

  await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, host, resolve);
  });
  const address = httpServer.address();
  origin = `http://${host}:${address.port}`;
  return {
    url: origin,
    close: () => new Promise((resolve, reject) => httpServer.close(error => {
      try { store.close(); } catch (closeError) { return reject(closeError); }
      if (error) reject(error); else resolve();
    })),
  };
}
