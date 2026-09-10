import { DatabaseSync } from 'node:sqlite';

const PARTICIPANTS = new Set(['alex', 'sam']);
const MAX_TEXT = 20_000;
const MAX_OPERATION_ID = 200;

function failure(code, message, details = {}) {
  return Object.assign(new Error(message), { code, ...details });
}

function assertParticipant(participant) {
  if (!PARTICIPANTS.has(participant)) throw failure('INVALID_IDENTITY', 'Unknown participant');
}

function assertIdentifier(value, label, max) {
  if (typeof value !== 'string' || value.length < 1 || value.length > max) {
    throw failure('INVALID_INPUT', `${label} is invalid`);
  }
}

function assertText(text, allowEmpty = false) {
  if (typeof text !== 'string' || text.length > MAX_TEXT || (!allowEmpty && text.trim().length === 0)) {
    throw failure('INVALID_INPUT', 'Text is invalid');
  }
}

function stableOperation(operation) {
  return JSON.stringify({
    operationId: operation.operationId,
    noteId: operation.noteId,
    baseRevision: operation.baseRevision,
    text: operation.text,
  });
}

export function createStore(path) {
  const database = new DatabaseSync(path);
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      owner TEXT,
      revision INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS entries (
      note_id TEXT NOT NULL REFERENCES notes(id),
      revision INTEGER NOT NULL,
      author TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (note_id, revision)
    );
    CREATE TABLE IF NOT EXISTS drafts (
      participant TEXT NOT NULL,
      note_id TEXT NOT NULL REFERENCES notes(id),
      text TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (participant, note_id)
    );
    CREATE TABLE IF NOT EXISTS operations (
      participant TEXT NOT NULL,
      operation_id TEXT NOT NULL,
      request_json TEXT NOT NULL,
      response_json TEXT NOT NULL,
      PRIMARY KEY (participant, operation_id)
    );
    INSERT OR IGNORE INTO notes (id, owner) VALUES ('shared', NULL);
    INSERT OR IGNORE INTO notes (id, owner) VALUES ('alex-private', 'alex');
  `);

  const noteFor = database.prepare('SELECT id, owner, revision FROM notes WHERE id = ?');
  const draftFor = database.prepare('SELECT text, updated_at FROM drafts WHERE participant = ? AND note_id = ?');
  const operationFor = database.prepare('SELECT request_json, response_json FROM operations WHERE participant = ? AND operation_id = ?');

  function permittedNote(participant, noteId) {
    assertParticipant(participant);
    assertIdentifier(noteId, 'noteId', 200);
    const note = noteFor.get(noteId);
    if (!note || (note.owner && note.owner !== participant)) throw failure('NOT_FOUND', 'Note not found');
    return note;
  }

  return {
    getDraft(participant, noteId) {
      permittedNote(participant, noteId);
      const draft = draftFor.get(participant, noteId);
      return { participant, noteId, text: draft?.text ?? '', updatedAt: draft?.updated_at ?? null };
    },

    saveDraft(participant, noteId, text) {
      permittedNote(participant, noteId);
      assertText(text, true);
      const updatedAt = new Date().toISOString();
      database.prepare(`
        INSERT INTO drafts (participant, note_id, text, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT (participant, note_id) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at
      `).run(participant, noteId, text, updatedAt);
      return { participant, noteId, text, updatedAt };
    },

    getNote(participant, noteId) {
      const note = permittedNote(participant, noteId);
      const entries = database.prepare(`
        SELECT revision, author, text, created_at AS createdAt
        FROM entries WHERE note_id = ? ORDER BY revision
      `).all(noteId);
      return { id: note.id, revision: note.revision, entries };
    },

    append(participant, operation) {
      assertParticipant(participant);
      if (!operation || typeof operation !== 'object' || Array.isArray(operation)) {
        throw failure('INVALID_INPUT', 'Operation is invalid');
      }
      assertIdentifier(operation.operationId, 'operationId', MAX_OPERATION_ID);
      assertIdentifier(operation.noteId, 'noteId', 200);
      assertText(operation.text);
      if (!Number.isInteger(operation.baseRevision) || operation.baseRevision < 0) {
        throw failure('INVALID_INPUT', 'baseRevision is invalid');
      }
      permittedNote(participant, operation.noteId);
      const requestJson = stableOperation(operation);
      const prior = operationFor.get(participant, operation.operationId);
      if (prior) {
        if (prior.request_json !== requestJson) throw failure('OPERATION_MISMATCH', 'Operation ID was reused with different content');
        return JSON.parse(prior.response_json);
      }

      database.exec('BEGIN IMMEDIATE');
      try {
        const note = permittedNote(participant, operation.noteId);
        if (note.revision !== operation.baseRevision) {
          throw failure('CONFLICT', 'The note changed before this operation was accepted', { currentRevision: note.revision });
        }
        const revision = note.revision + 1;
        const createdAt = new Date().toISOString();
        const entry = { revision, author: participant, text: operation.text, createdAt };
        const response = { operationId: operation.operationId, noteId: operation.noteId, revision, entry };
        database.prepare('INSERT INTO entries (note_id, revision, author, text, created_at) VALUES (?, ?, ?, ?, ?)')
          .run(operation.noteId, revision, participant, operation.text, createdAt);
        database.prepare('UPDATE notes SET revision = ? WHERE id = ?').run(revision, operation.noteId);
        database.prepare('DELETE FROM drafts WHERE participant = ? AND note_id = ? AND text = ?')
          .run(participant, operation.noteId, operation.text);
        database.prepare('INSERT INTO operations (participant, operation_id, request_json, response_json) VALUES (?, ?, ?, ?)')
          .run(participant, operation.operationId, requestJson, JSON.stringify(response));
        database.exec('COMMIT');
        return response;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },

    close() {
      database.close();
    },
  };
}
