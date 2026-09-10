/**
 * Relay server v0 (node): pairs two devices by spoken word code, then
 * forwards moment and delivery frames verbatim between the pair. The relay
 * never inspects or rewrites envelopes — verification is end-to-end; the
 * receiver recomputes the content hash over the full envelope.
 */

import { createServer, type Server } from "node:http";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import { generatePairCode } from "./pairing.js";
import type { ClientFrame, RelayFrame } from "./protocol.js";

interface Session {
  code: string;
  createdAt: number;
  expiresAt: number;
  a?: WebSocket;
  aDeviceId: string;
  aResumeTokenHash: string;
  b?: WebSocket;
  bDeviceId?: string;
  bResumeTokenHash?: string;
}

export interface RelayOptions {
  sessionFile?: string;
  sessionTtlMs?: number;
  now?: () => number;
}

interface PersistedSessions {
  schema: "jt-sync-relay-sessions/2";
  sessions: Array<Pick<Session, "code" | "aDeviceId" | "aResumeTokenHash" | "bDeviceId" | "bResumeTokenHash" | "createdAt" | "expiresAt">>;
}

function issueResumeToken(): string { return randomBytes(32).toString("base64url"); }
function tokenHash(token: string): string { return createHash("sha256").update(token).digest("hex"); }
function tokenMatches(token: string, expectedHash: string | undefined): boolean {
  if (!expectedHash) return false;
  const actual = Buffer.from(tokenHash(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export class Relay {
  private http: Server;
  private wss: WebSocketServer;
  private sessions = new Map<string, Session>(); // code -> durable-in-process pairing session
  private peers = new Map<WebSocket, WebSocket>(); // paired socket -> its peer
  private memberships = new Map<WebSocket, { session: Session; side: "a" | "b" }>();
  private sessionFile?: string;
  private sessionTtlMs: number;
  private now: () => number;

  constructor(options: RelayOptions = {}) {
    this.sessionFile = options.sessionFile;
    this.sessionTtlMs = options.sessionTtlMs ?? 24 * 60 * 60 * 1_000;
    if (!Number.isFinite(this.sessionTtlMs) || this.sessionTtlMs <= 0) throw new Error("sessionTtlMs must be positive");
    this.now = options.now ?? Date.now;
    this.loadSessions();
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
          const createdAt = this.now();
          const resumeToken = issueResumeToken();
          const session = { code, createdAt, expiresAt: createdAt + this.sessionTtlMs, a: ws, aDeviceId: frame.deviceId, aResumeTokenHash: tokenHash(resumeToken) };
          this.sessions.set(code, session);
          this.persistSessions();
          this.memberships.set(ws, { session, side: "a" });
          this.send(ws, { t: "code", code, resumeToken });
          break;
        }
        case "join": {
          const session = this.liveSession(frame.code);
          if (!session || session.bDeviceId) {
            this.send(ws, { t: "error", message: `no pairing session for code '${frame.code}'` });
            return;
          }
          session.b = ws;
          session.bDeviceId = frame.deviceId;
          const resumeToken = issueResumeToken();
          session.bResumeTokenHash = tokenHash(resumeToken);
          this.persistSessions();
          this.memberships.set(ws, { session, side: "b" });
          this.pairOpenSockets(session, resumeToken);
          break;
        }
        case "resume": {
          const session = this.liveSession(frame.code);
          const side = session?.aDeviceId === frame.deviceId ? "a" : session?.bDeviceId === frame.deviceId ? "b" : null;
          if (!session || !side) {
            this.send(ws, { t: "error", message: "pairing session cannot be resumed" });
            return;
          }
          const expectedHash = side === "a" ? session.aResumeTokenHash : session.bResumeTokenHash;
          if (!tokenMatches(frame.resumeToken, expectedHash)) {
            this.send(ws, { t: "error", message: "resume credential is invalid" });
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
        case "revoke": {
          const session = this.liveSession(frame.code);
          const side = session?.aDeviceId === frame.deviceId ? "a" : session?.bDeviceId === frame.deviceId ? "b" : null;
          const expectedHash = side === "a" ? session?.aResumeTokenHash : side === "b" ? session?.bResumeTokenHash : undefined;
          if (!session || !side || !tokenMatches(frame.resumeToken, expectedHash)) {
            this.send(ws, { t: "error", message: "revocation credential is invalid" });
            return;
          }
          const peerSide = side === "a" ? "b" : "a";
          const peer = session[peerSide];
          this.sessions.delete(session.code);
          for (const socket of [session.a, session.b]) {
            if (!socket) continue;
            this.memberships.delete(socket);
            this.peers.delete(socket);
          }
          this.persistSessions();
          this.send(ws, { t: "revoked", reason: "requested" });
          if (peer && peer !== ws && peer.readyState === WebSocket.OPEN) this.send(peer, { t: "revoked", reason: "peer" });
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

  private liveSession(code: string): Session | undefined {
    const session = this.sessions.get(code);
    if (!session || session.expiresAt > this.now()) return session;
    this.sessions.delete(code);
    for (const socket of [session.a, session.b]) {
      if (!socket) continue;
      this.memberships.delete(socket);
      const peer = this.peers.get(socket);
      this.peers.delete(socket);
      if (peer) this.peers.delete(peer);
      if (socket.readyState === WebSocket.OPEN) socket.close(1008, "pairing expired");
    }
    this.persistSessions();
    return undefined;
  }

  private loadSessions(): void {
    if (!this.sessionFile) return;
    let raw: string;
    try {
      raw = readFileSync(this.sessionFile, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    const stored = JSON.parse(raw) as PersistedSessions;
    if (stored.schema !== "jt-sync-relay-sessions/2" || !Array.isArray(stored.sessions)) {
      throw new Error("invalid relay session store");
    }
    for (const row of stored.sessions) {
      if (
        typeof row.code === "string" && typeof row.aDeviceId === "string" && typeof row.aResumeTokenHash === "string" &&
        (row.bDeviceId === undefined || typeof row.bDeviceId === "string") &&
        (row.bResumeTokenHash === undefined || typeof row.bResumeTokenHash === "string") &&
        Number.isFinite(row.createdAt) && Number.isFinite(row.expiresAt) && row.expiresAt > this.now()
      ) this.sessions.set(row.code, { ...row });
    }
    if (this.sessions.size !== stored.sessions.length) this.persistSessions();
  }

  private persistSessions(): void {
    if (!this.sessionFile) return;
    const sessions = [...this.sessions.values()]
      .filter((session) => session.expiresAt > this.now())
      .map(({ code, aDeviceId, aResumeTokenHash, bDeviceId, bResumeTokenHash, createdAt, expiresAt }) => ({ code, aDeviceId, aResumeTokenHash, bDeviceId, bResumeTokenHash, createdAt, expiresAt }));
    const payload: PersistedSessions = { schema: "jt-sync-relay-sessions/2", sessions };
    mkdirSync(dirname(this.sessionFile), { recursive: true });
    const temporary = `${this.sessionFile}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(payload, null, 2) + "\n", { mode: 0o600 });
    renameSync(temporary, this.sessionFile);
    chmodSync(this.sessionFile, 0o600);
  }

  private pairOpenSockets(session: Session, joiningResumeToken?: string): void {
    if (!session.a || !session.b || session.a.readyState !== WebSocket.OPEN || session.b.readyState !== WebSocket.OPEN) return;
    this.peers.set(session.a, session.b);
    this.peers.set(session.b, session.a);
    const channelId = `ch-${session.code}`;
    this.send(session.a, { t: "paired", channelId, peerDeviceId: session.bDeviceId! });
    this.send(session.b, { t: "paired", channelId, peerDeviceId: session.aDeviceId, ...(joiningResumeToken ? { resumeToken: joiningResumeToken } : {}) });
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
