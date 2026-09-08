import test from 'node:test';
import assert from 'node:assert/strict';
import { createBentoHandoff, BENTO_PENDING_KEY } from '../src/bento-handoff.js';

test('selected tool survives reload; old sessions retain Organize and invalid routes never upload', async () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  let uploads = 0;
  const options = { base: 'http://127.0.0.1:5181', storage, fetch: async () => {
    uploads++;
    return new Response(JSON.stringify({ token: 'a'.repeat(64) }));
  }};
  const source = { id: 'source', title: 'Original', sourceBytes: new TextEncoder().encode('%PDF-1.7'), provenance: { sourceKind: 'pdf' } };
  const bridge = createBentoHandoff(options);
  await assert.rejects(bridge.start(source, '../unrelated'), /supported/);
  await assert.rejects(bridge.start(source, '__proto__'), /supported/);
  assert.equal(uploads, 0);
  for (const [tool, path] of [['edit', 'edit-pdf'], ['forms', 'form-filler'], ['sign', 'sign-pdf']]) {
    values.clear();
    await bridge.start(source, tool);
    const restored = createBentoHandoff(options);
    assert.equal(restored.url(restored.pending()), `${options.base}/${path}.html#jett=${'a'.repeat(64)}`);
  }
  const legacy = JSON.parse(values.get(BENTO_PENDING_KEY));
  delete legacy.tool;
  values.set(BENTO_PENDING_KEY, JSON.stringify(legacy));
  assert.match(bridge.url(bridge.pending()), /pdf-multi-tool\.html#jett=/);
});
