import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { MomentChannel } from "../src/client.js";
import { MemoryLogStore } from "../src/log.js";
import { makeMoment } from "./helpers.js";

const repoRoot = new URL("..", import.meta.url).pathname;
let relayProc: ChildProcess;
let relayUrl = "";
let a: MomentChannel;
let b: MomentChannel;

before(async () => {
  relayProc = spawn(process.execPath, ["--import", "tsx", "src/relay-main.ts", "0"], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "inherit"],
  });
  relayUrl = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("relay did not start")), 15_000);
    relayProc.stdout!.on("data", (chunk: Buffer) => {
      const match = /listening (ws:\/\/[\d.]+:\d+)/.exec(chunk.toString());
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
  a = await MomentChannel.create(relayUrl, "reconnect-a", new MemoryLogStore());
  b = await MomentChannel.join(relayUrl, "reconnect-b", a.pairCode, new MemoryLogStore());
  await a.waitForPeer();
});

after(() => { a?.close(); b?.close(); relayProc?.kill(); });

test("a paired device resumes its channel after the socket disappears", { timeout: 30_000 }, async () => {
  b._dropTransport();
  await b.waitUntilConnected(10_000);
  assert.equal(b.channelId, a.channelId);
  assert.equal(b.peerDeviceId, "reconnect-a");

  const arrived = new Promise<void>((resolve) => b.onMoment((record) => {
    if (record.status === "verified") resolve();
  }));
  const result = await a.sendMoment(makeMoment(0));
  await arrived;
  assert.equal(result.delivery.status, "verified");
  assert.equal((await b.log.entries()).length, 1);
});
