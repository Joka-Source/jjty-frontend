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
  a?: WebSocket;
  aDeviceId: string;
  b?: WebSocket;
  bDeviceId?: string;
}

export class Relay {
  private http: Server;
  private wss: WebSocketServer;
  private sessions = new Map<string, Session>(); // code -> durable-in-process pairing session
  private peers = new Map<WebSocket, WebSocket>(); // paired socket -> its peer
  private memberships = new Map<WebSocket, { session: Session; side: "a" | "b" }>();

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
          while (this.sessions.has(code)) code = generatePairCode();
          const session = { code, a: ws, aDeviceId: frame.deviceId };
          this.sessions.set(code, session);
          this.memberships.set(ws, { session, side: "a" });
          this.send(ws, { t: "code", code });
          break;
        }
        case "join": {
          const session = this.sessions.get(frame.code);
          if (!session || session.bDeviceId) {
            this.send(ws, { t: "error", message: `no pairing session for code '${frame.code}'` });
            return;
          }
          session.b = ws;
          session.bDeviceId = frame.deviceId;
          this.memberships.set(ws, { session, side: "b" });
          this.pairOpenSockets(session);
          break;
        }
        case "resume": {
          const session = this.sessions.get(frame.code);
          const side = session?.aDeviceId === frame.deviceId ? "a" : session?.bDeviceId === frame.deviceId ? "b" : null;
          if (!session || !side) {
            this.send(ws, { t: "error", message: "pairing session cannot be resumed" });
            return;
          }
          const current = session[side];
          if (current && current !== ws && current.readyState === WebSocket.OPEN) {
            this.send(ws, { t: "error", message: "device is already connected" });
            return;
          }
          session[side] = ws;
          this.memberships.set(ws, { session, side });
          this.pairOpenSockets(session);
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
        if (peer.readyState === WebSocket.OPEN) peer.close(1012, "peer disconnected");
      }
      const membership = this.memberships.get(ws);
      if (membership) {
        this.memberships.delete(ws);
        if (membership.session[membership.side] === ws) membership.session[membership.side] = undefined;
      }
    });
  }

  private pairOpenSockets(session: Session): void {
    if (!session.a || !session.b || session.a.readyState !== WebSocket.OPEN || session.b.readyState !== WebSocket.OPEN) return;
    this.peers.set(session.a, session.b);
    this.peers.set(session.b, session.a);
    const channelId = `ch-${session.code}`;
    this.send(session.a, { t: "paired", channelId, peerDeviceId: session.bDeviceId! });
    this.send(session.b, { t: "paired", channelId, peerDeviceId: session.aDeviceId });
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
