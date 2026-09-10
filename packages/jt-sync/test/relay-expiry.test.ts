import test from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";
import { Relay } from "../src/relay.js";

function connect(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}

function nextFrame(socket: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve) => socket.once("message", (data) => resolve(JSON.parse(data.toString()))));
}

test("a long-running relay rejects a join after the pairing expires", async () => {
  let now = 1_000;
  const relay = new Relay({ sessionTtlMs: 100, now: () => now });
  const port = await relay.listen(0);
  let creator: WebSocket | undefined;
  let joiner: WebSocket | undefined;
  try {
    creator = await connect(`ws://127.0.0.1:${port}`);
    creator.send(JSON.stringify({ t: "create", deviceId: "expiry-a" }));
    const created = await nextFrame(creator);
    assert.equal(created.t, "code");

    now = 1_101;
    joiner = await connect(`ws://127.0.0.1:${port}`);
    joiner.send(JSON.stringify({ t: "join", deviceId: "expiry-b", code: created.code }));
    const result = await nextFrame(joiner);
    assert.equal(result.t, "error");
    assert.match(String(result.message), /no pairing session/);
  } finally {
    creator?.close(); joiner?.close();
    await relay.close();
  }
});
