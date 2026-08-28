/** Append-only log: delivery records, hash coverage, single-writer discipline. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MomentLog, MemoryLogStore } from "../src/log.js";
import { FileLogStore, SingleWriterViolation } from "../src/log-file.js";
import { envelopeHash } from "../src/hash.js";
import { makeMoment } from "./helpers.js";
import type { Moment } from "../src/envelope.js";

function withTransport(n: number): Moment {
  return {
    ...makeMoment(n),
    transport: {
      momentId: `mom-log-${n}`,
      fromDeviceId: "device-a",
      sentAt: "2026-08-12T10:00:00Z",
      seq: n,
      protocol: "jt-sync/0",
    },
  };
}

test("append acknowledges with a delivery record whose hash covers the full envelope", async () => {
  const log = new MomentLog("device-a", new MemoryLogStore());
  const m = withTransport(0);
  const rec = await log.append(m);
  assert.equal(rec.status, "verified");
  assert.equal(rec.logSeq, 0);
  assert.equal(rec.contentHash, await envelopeHash(m));
  // Any change to the intention record changes the hash.
  const mutated = structuredClone(m);
  mutated.cursor.proposedIntention = "something else entirely";
  assert.notEqual(rec.contentHash, await envelopeHash(mutated));
});

test("file store is JSON-lines and enforces single-writer discipline", async () => {
  const dir = mkdtempSync(join(tmpdir(), "jt-sync-"));
  const path = join(dir, "device-a.moments.jsonl");
  const store = new FileLogStore(path);
  try {
    const log = new MomentLog("device-a", store);
    await log.append(withTransport(0));
    await log.append(withTransport(1));
    const lines = readFileSync(path, "utf8").trim().split("\n");
    assert.equal(lines.length, 2);
    assert.equal((JSON.parse(lines[1]) as { logSeq: number }).logSeq, 1);
    // Second writer on the same log must be refused while the first holds it.
    assert.throws(() => new FileLogStore(path), SingleWriterViolation);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
