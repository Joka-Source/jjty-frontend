import test from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MomentChannel } from "../src/client.js";
import { MemoryLogStore } from "../src/log.js";
import { Relay } from "../src/relay.js";

function connect(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}

function nextFrame(socket: WebSocket, timeoutMs = 1_000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("no relay response")), timeoutMs);
    socket.once("message", (data) => { clearTimeout(timer); resolve(JSON.parse(data.toString())); });
  });
}

test("pair code and device ID without the device resume token are rejected", async () => {
  const relay = new Relay();
  const port = await relay.listen(0);
  let creator: WebSocket | undefined;
  let attacker: WebSocket | undefined;
  try {
    const url = `ws://127.0.0.1:${port}`;
    creator = await connect(url);
    creator.send(JSON.stringify({ t: "create", deviceId: "known-device" }));
    const created = await nextFrame(creator);
    assert.equal(created.t, "code");
    assert.match(String(created.resumeToken), /^[A-Za-z0-9_-]{40,}$/);
    creator.close();
    await new Promise((resolve) => creator!.once("close", resolve));

    attacker = await connect(url);
    attacker.send(JSON.stringify({
      t: "resume",
      deviceId: "known-device",
      code: created.code,
      resumeToken: "attacker-does-not-have-the-token",
    }));
    const rejected = await nextFrame(attacker);
    assert.equal(rejected.t, "error");
    assert.match(String(rejected.message), /credential/i);
  } finally {
    creator?.close(); attacker?.close();
    await relay.close();
  }
});

test("the client surfaces an invalid resume credential without waiting for timeout", { timeout: 2_000 }, async () => {
  const relay = new Relay();
  const port = await relay.listen(0);
  const url = `ws://127.0.0.1:${port}`;
  let a: MomentChannel | undefined;
  let b: MomentChannel | undefined;
  try {
    a = await MomentChannel.create(url, "client-a", new MemoryLogStore());
    b = await MomentChannel.join(url, "client-b", a.pairCode, new MemoryLogStore());
    await a.waitForPeer();
    const code = a.pairCode;
    a.close();
    await assert.rejects(
      MomentChannel.resume(url, "client-a", code, "wrong-resume-token", new MemoryLogStore()),
      /credential/i,
    );
  } finally {
    a?.close(); b?.close();
    await relay.close();
  }
});

test("revoking one side invalidates both resume credentials", { timeout: 2_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "jt-sync-revoke-"));
  const sessionFile = join(directory, "sessions.json");
  const relay = new Relay({ sessionFile });
  const port = await relay.listen(0);
  const url = `ws://127.0.0.1:${port}`;
  let a: MomentChannel | undefined;
  let b: MomentChannel | undefined;
  try {
    a = await MomentChannel.create(url, "revoke-a", new MemoryLogStore());
    b = await MomentChannel.join(url, "revoke-b", a.pairCode, new MemoryLogStore());
    await a.waitForPeer();
    const code = a.pairCode;
    const tokenA = a.resumeToken;
    const tokenB = b.resumeToken;
    const peerWasNotified = new Promise<void>((resolve) => b!.onRevoked(resolve));
    await a.revoke();
    await peerWasNotified;
    assert.deepEqual(JSON.parse(await readFile(sessionFile, "utf8")).sessions, []);

    await assert.rejects(MomentChannel.resume(url, "revoke-a", code, tokenA, new MemoryLogStore()), /cannot be resumed/i);
    await assert.rejects(MomentChannel.resume(url, "revoke-b", code, tokenB, new MemoryLogStore()), /cannot be resumed/i);
  } finally {
    a?.close(); b?.close();
    await relay.close();
    await rm(directory, { recursive: true, force: true });
  }
});
