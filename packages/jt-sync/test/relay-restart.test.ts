import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MomentChannel } from "../src/client.js";
import { MemoryLogStore } from "../src/log.js";
import { makeMoment } from "./helpers.js";

const repoRoot = new URL("..", import.meta.url).pathname;

async function startRelay(sessionFile: string): Promise<{ process: ChildProcess; url: string }> {
  const process = spawn(
    globalThis.process.execPath,
    ["--import", "tsx", "src/relay-main.ts", "0", sessionFile, "60000"],
    { cwd: repoRoot, stdio: ["ignore", "pipe", "inherit"] },
  );
  const url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("relay did not start")), 15_000);
    process.stdout!.on("data", (chunk: Buffer) => {
      const match = /listening (ws:\/\/[\d.]+:\d+)/.exec(chunk.toString());
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    process.on("exit", (code) => reject(new Error(`relay exited early (${code})`)));
  });
  return { process, url };
}

async function stopRelay(process: ChildProcess): Promise<void> {
  process.kill("SIGTERM");
  await new Promise<void>((resolve) => process.once("exit", () => resolve()));
}

test("paired devices resume and deliver after the relay process restarts", { timeout: 45_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "jt-sync-relay-"));
  const sessionFile = join(directory, "sessions.json");
  const storeA = new MemoryLogStore();
  const storeB = new MemoryLogStore();
  let first: ChildProcess | undefined;
  let second: ChildProcess | undefined;
  let a: MomentChannel | undefined;
  let b: MomentChannel | undefined;
  try {
    const initial = await startRelay(sessionFile);
    first = initial.process;
    a = await MomentChannel.create(initial.url, "restart-a", storeA);
    b = await MomentChannel.join(initial.url, "restart-b", a.pairCode, storeB);
    await a.waitForPeer();
    const code = a.pairCode;
    a.close(); b.close();
    await stopRelay(first); first = undefined;

    const persisted = JSON.parse(await readFile(sessionFile, "utf8"));
    assert.equal(persisted.sessions.length, 1);
    assert.equal(persisted.sessions[0].code, code);
    assert.equal(persisted.sessions[0].aDeviceId, "restart-a");
    assert.equal(persisted.sessions[0].bDeviceId, "restart-b");

    const restarted = await startRelay(sessionFile);
    second = restarted.process;
    [a, b] = await Promise.all([
      MomentChannel.resume(restarted.url, "restart-a", code, storeA),
      MomentChannel.resume(restarted.url, "restart-b", code, storeB),
    ]);
    const result = await a.sendMoment(makeMoment(0));
    assert.equal(result.delivery.status, "verified");
    assert.equal((await storeB.readAll()).length, 1);
  } finally {
    a?.close(); b?.close();
    if (first) await stopRelay(first);
    if (second) await stopRelay(second);
    await rm(directory, { recursive: true, force: true });
  }
});
