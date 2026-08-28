/**
 * Relay server v0 (node): pairs two devices by spoken word code, then
 * forwards moment and delivery frames verbatim between the pair. The relay
 * never inspects or rewrites envelopes — verification is end-to-end; the
 * receiver recomputes the content hash over the full envelope.
 */

import { createServer, type Server } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { generatePairCode } from "./pairing.js";
import type { ClientFrame, RelayFrame } from "./protocol.js";

interface Session {
  code: string;
  a: WebSocket;
  aDeviceId: string;
  b?: WebSocket;
  bDeviceId?: string;
}

export class Relay {
  private http: Server;
  private wss: WebSocketServer;
  private pending = new Map<string, Session>(); // code -> waiting session
  private peers = new Map<WebSocket, WebSocket>(); // paired socket -> its peer

  constructor() {
    this.http = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, service: "jt-sync-relay", protocol: "jt-sync/0" }));
    });
    this.wss = new WebSocketServer({ server: this.http });
    this.wss.on("connection", (ws) => this.handle(ws));
  }

  private send(ws: WebSocket, frame: RelayFrame): void {
    ws.send(JSON.stringify(frame));
  }

  private handle(ws: WebSocket): void {
    ws.on("message", (data) => {
      let frame: ClientFrame;
      try {
        frame = JSON.parse(data.toString()) as ClientFrame;
      } catch {
        this.send(ws, { t: "error", message: "malformed frame" });
        return;
      }
      switch (frame.t) {
        case "create": {
          let code = generatePairCode();
          while (this.pending.has(code)) code = generatePairCode();
          this.pending.set(code, { code, a: ws, aDeviceId: frame.deviceId });
          this.send(ws, { t: "code", code });
          break;
        }
        case "join": {
          const session = this.pending.get(frame.code);
          if (!session) {
            this.send(ws, { t: "error", message: `no pairing session for code '${frame.code}'` });
            return;
          }
          this.pending.delete(frame.code);
          session.b = ws;
          session.bDeviceId = frame.deviceId;
          this.peers.set(session.a, ws);
          this.peers.set(ws, session.a);
          const channelId = `ch-${frame.code}`;
          this.send(session.a, { t: "paired", channelId, peerDeviceId: frame.deviceId });
          this.send(ws, { t: "paired", channelId, peerDeviceId: session.aDeviceId });
          break;
        }
        case "moment":
        case "delivery": {
          const peer = this.peers.get(ws);
          if (!peer || peer.readyState !== WebSocket.OPEN) {
            this.send(ws, { t: "error", message: "not paired or peer gone" });
            return;
          }
          peer.send(data.toString()); // forwarded verbatim, never rewritten
          break;
        }
      }
    });
    ws.on("close", () => {
      const peer = this.peers.get(ws);
      if (peer) {
        this.peers.delete(ws);
        this.peers.delete(peer);
      }
      for (const [code, s] of this.pending) if (s.a === ws) this.pending.delete(code);
    });
  }

  listen(port: number): Promise<number> {
    return new Promise((resolve) => {
      this.http.listen(port, "127.0.0.1", () => {
        const addr = this.http.address();
        resolve(typeof addr === "object" && addr ? addr.port : port);
      });
    });
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      for (const ws of this.wss.clients) ws.terminate();
      this.wss.close(() => this.http.close(() => resolve()));
    });
  }
}
