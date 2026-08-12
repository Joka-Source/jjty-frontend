/**
 * Round-trip proof: relay boots in a SEPARATE OS PROCESS, two clients pair
 * by spoken word code over localhost, three moments travel A -> B (one with
 * a full cursor lifecycle). Asserts hash verification, ordering, intention
 * record reconstruction, and tamper rejection.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { MomentChannel } from "../src/client.js";
import { MemoryLogStore } from "../src/log.js";
import { envelopeHash } from "../src/hash.js";
import { isValidPairCode } from "../src/pairing.js";
import type { DeliveryRecord, Moment } from "../src/envelope.js";
import { CONTRACTS_DIR, makeMoment } from "./helpers.js";

const repoRoot = new URL("..", import.meta.url).pathname;
let relayProc: ChildProcess;
let relayUrl = "";
let a: MomentChannel;
let b: MomentChannel;
const bDeliveries: Array<{ record: DeliveryRecord; moment: Moment }> = [];

before(async () => {
  // Boot the relay as a separate OS process on an ephemeral port.
  relayProc = spawn(process.execPath, ["--import", "tsx", "src/relay-main.ts", "0"], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "inherit"],
  });
  relayUrl = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("relay did not start in 15s")), 15_000);
    relayProc.stdout!.on("data", (chunk: Buffer) => {
      const m = /listening (ws:\/\/[\d.]+:\d+)/.exec(chunk.toString());
      if (m) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    });
    relayProc.on("exit", (code) => reject(new Error(`relay exited early (${code})`)));
  });

  // Pair two clients with the spoken word code.
  a = await MomentChannel.create(relayUrl, "device-a", new MemoryLogStore());
  assert.equal(isValidPairCode(a.pairCode), true, `pair code '${a.pairCode}' must be three spoken words`);
  b = await MomentChannel.join(relayUrl, "device-b", a.pairCode, new MemoryLogStore());
  await a.waitForPeer();
  b.onMoment((record, moment) => bDeliveries.push({ record, moment }));
});

after(async () => {
  a?.close();
  b?.close();
  relayProc?.kill();
});

test("relay pairs the two devices", () => {
  assert.equal(a.peerDeviceId, "device-b");
  assert.equal(b.peerDeviceId, "device-a");
  assert.equal(a.channelId, b.channelId);
});

test("three moments A->B arrive verified, in order, hashes proven end-to-end", async () => {
  const localHashes: string[] = [];
  for (let n = 0; n < 3; n++) {
    const { delivery, localHash } = await a.sendMoment(makeMoment(n, n === 2));
    localHashes.push(localHash);
    assert.equal(delivery.status, "verified", delivery.reason);
    assert.equal(delivery.deviceId, "device-b");
    // Receiver-computed hash equals sender-computed hash: what arrived is what was sent.
    assert.equal(delivery.contentHash, localHash);
  }
  const bEntries = await b.log.entries();
  assert.equal(bEntries.length, 3);
  // Ordering: log sequence and sender sequence both monotonic 0,1,2.
  assert.deepEqual(bEntries.map((e) => e.logSeq), [0, 1, 2]);
  assert.deepEqual(bEntries.map((e) => e.moment.transport.seq), [0, 1, 2]);
  // B's stored hashes match what A computed before sending.
  assert.deepEqual(bEntries.map((e) => e.contentHash), localHashes);
  // And each stored envelope independently re-hashes to the stored hash.
  for (const e of bEntries) assert.equal(await envelopeHash(e.moment), e.contentHash);
});

test("B reconstructs the intention record intact and schema-valid", async () => {
  const bEntries = await b.log.entries();
  const sent = makeMoment(2, true);
  const arrived = bEntries[2].moment;
  // The full cursor lifecycle survived transport byte-for-byte.
  assert.deepEqual(arrived.cursor, sent.cursor);
  assert.equal(arrived.cursor.history!.length, 10);
  assert.deepEqual(arrived.receipt, sent.receipt);
  assert.deepEqual(arrived.provenance, sent.provenance);
  // And it still conforms to the jt-contracts cursor schema on arrival.
  const ajv = new Ajv2020.default({ allErrors: true, strict: false });
  addFormats.default(ajv);
  const validate = ajv.compile(
    JSON.parse(readFileSync(join(CONTRACTS_DIR, "schemas", "cursor.schema.json"), "utf8")),
  );
  assert.equal(validate(arrived.cursor), true, JSON.stringify(validate.errors));
});

test("tampered envelope is rejected and never enters B's log", async () => {
  const sent = makeMoment(3);
  const envelope: Moment = {
    ...sent,
    transport: {
      momentId: "mom-tampered",
      fromDeviceId: "device-a",
      toDeviceId: "device-b",
      sentAt: new Date().toISOString(),
      seq: 3,
      protocol: "jt-sync/0",
    },
  };
  const honestHash = await envelopeHash(envelope);
  // A man-in-the-middle strips the intention: rewrites the proposed
  // intention after the hash was computed.
  const tampered = structuredClone(envelope);
  tampered.cursor.proposedIntention = "delete-note at anchor anc-t3";
  const seen = new Promise<DeliveryRecord>((resolve) => {
    b.onMoment((record, m) => {
      if (m.transport.momentId === "mom-tampered") resolve(record);
    });
  });
  a._sendRaw({ t: "moment", envelope: tampered, hash: honestHash });
  const record = await seen;
  assert.equal(record.status, "rejected");
  assert.match(record.reason!, /content hash mismatch/);
  const bEntries = await b.log.entries();
  assert.equal(bEntries.length, 3, "tampered moment must not be appended");
  assert.ok(!bEntries.some((e) => e.moment.transport.momentId === "mom-tampered"));
});

test("out-of-order replay is rejected", async () => {
  const sent = makeMoment(4);
  const envelope: Moment = {
    ...sent,
    transport: {
      momentId: "mom-replay",
      fromDeviceId: "device-a",
      sentAt: new Date().toISOString(),
      seq: 1, // already seen: B is past seq 2
      protocol: "jt-sync/0",
    },
  };
  const seen = new Promise<DeliveryRecord>((resolve) => {
    b.onMoment((record, m) => {
      if (m.transport.momentId === "mom-replay") resolve(record);
    });
  });
  a._sendRaw({ t: "moment", envelope, hash: await envelopeHash(envelope) });
  const record = await seen;
  assert.equal(record.status, "rejected");
  assert.match(record.reason!, /out of order/);
  assert.equal((await b.log.entries()).length, 3);
});
