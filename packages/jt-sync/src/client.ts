/**
 * Client library — browser-safe by construction.
 *
 * Uses only: global WebSocket (WHATWG, present in browsers and node >= 22),
 * Web Crypto via src/hash.ts, and a pluggable LogStore. No node-only APIs.
 *
 * Flow:
 *   const a = await MomentChannel.create(url, "device-a", logA);   // -> a.pairCode
 *   const b = await MomentChannel.join(url, "device-b", a.pairCode, logB);
 *   const delivery = await a.sendMoment(moment); // resolves with receiver's proof
 *
 * On receive, the client recomputes the content hash over the FULL envelope
 * (blocks + cursor + receipt + provenance + transport). Only a verified
 * envelope enters the log; the sender gets back a DeliveryRecord either way.
 */

import type { DeliveryRecord, Moment } from "./envelope.js";
import { envelopeHash } from "./hash.js";
import { MomentLog, type LogStore } from "./log.js";
import type { ClientFrame, RelayFrame } from "./protocol.js";

interface PendingDelivery {
  resolve: (record: DeliveryRecord) => void;
  reject: (err: Error) => void;
}

export class MomentChannel {
  readonly log: MomentLog;
  pairCode = "";
  channelId = "";
  peerDeviceId = "";
  private ws!: WebSocket;
  private sendSeq = 0;
  private lastReceivedSeq = -1;
  private pendingDeliveries = new Map<string, PendingDelivery>();
  private momentListeners: Array<(record: DeliveryRecord, moment: Moment) => void> = [];

  private constructor(
    public readonly deviceId: string,
    store: LogStore,
  ) {
    this.log = new MomentLog(deviceId, store);
  }

  /** Device A: open a channel and get a spoken pair code. */
  static async create(relayUrl: string, deviceId: string, store: LogStore): Promise<MomentChannel> {
    const ch = new MomentChannel(deviceId, store);
    await ch.connect(relayUrl);
    ch.pairCode = await ch.request({ t: "create", deviceId }, "code").then((f) => (f as { code: string }).code);
    return ch;
  }

  /** Device B: join with the code spoken by device A. */
  static async join(relayUrl: string, deviceId: string, code: string, store: LogStore): Promise<MomentChannel> {
    const ch = new MomentChannel(deviceId, store);
    await ch.connect(relayUrl);
    ch.pairCode = code;
    const paired = (await ch.request({ t: "join", deviceId, code }, "paired")) as {
      channelId: string;
      peerDeviceId: string;
    };
    ch.channelId = paired.channelId;
    ch.peerDeviceId = paired.peerDeviceId;
    return ch;
  }

  /** Resolves on device A when device B has joined. */
  waitForPeer(timeoutMs = 10_000): Promise<void> {
    if (this.channelId) return Promise.resolve();
    return this.waitFrame("paired", timeoutMs).then((f) => {
      const p = f as { channelId: string; peerDeviceId: string };
      this.channelId = p.channelId;
      this.peerDeviceId = p.peerDeviceId;
    });
  }

  private connect(relayUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(relayUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = () => reject(new Error(`could not connect to relay ${relayUrl}`));
      this.ws.onmessage = (ev: MessageEvent) => this.onFrame(String(ev.data));
    });
  }

  private frameWaiters = new Map<string, Array<(f: RelayFrame) => void>>();

  private waitFrame(type: RelayFrame["t"], timeoutMs = 10_000): Promise<RelayFrame> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`timed out waiting for '${type}' frame`)),
        timeoutMs,
      );
      const list = this.frameWaiters.get(type) ?? [];
      list.push((f) => {
        clearTimeout(timer);
        resolve(f);
      });
      this.frameWaiters.set(type, list);
    });
  }

  private request(frame: ClientFrame, replyType: RelayFrame["t"]): Promise<RelayFrame> {
    const reply = this.waitFrame(replyType);
    this.ws.send(JSON.stringify(frame));
    return reply;
  }

  private async onFrame(text: string): Promise<void> {
    let frame: RelayFrame;
    try {
      frame = JSON.parse(text) as RelayFrame;
    } catch {
      return;
    }
    const waiters = this.frameWaiters.get(frame.t);
    if (waiters && waiters.length > 0 && frame.t !== "moment") {
      this.frameWaiters.set(frame.t, []);
      for (const w of waiters) w(frame);
      if (frame.t !== "error") return;
    }
    switch (frame.t) {
      case "paired":
        // May arrive before waitForPeer registers a waiter — record it.
        this.channelId = frame.channelId;
        this.peerDeviceId = frame.peerDeviceId;
        break;
      case "moment":
        await this.receiveMoment(frame.envelope, frame.hash);
        break;
      case "delivery": {
        const pending = this.pendingDeliveries.get(frame.record.momentId);
        if (pending) {
          this.pendingDeliveries.delete(frame.record.momentId);
          pending.resolve(frame.record);
        }
        break;
      }
      case "error":
        for (const [, p] of this.pendingDeliveries) p.reject(new Error(frame.message));
        this.pendingDeliveries.clear();
        break;
    }
  }

  private async receiveMoment(envelope: Moment, assertedHash: string): Promise<void> {
    // Ordering discipline: sender seq must be strictly increasing.
    let record: DeliveryRecord;
    if (envelope.transport.seq <= this.lastReceivedSeq) {
      record = {
        momentId: envelope.transport.momentId,
        contentHash: assertedHash,
        logSeq: -1,
        receivedAt: new Date().toISOString(),
        deviceId: this.deviceId,
        status: "rejected",
        reason: `out of order: seq ${envelope.transport.seq} after ${this.lastReceivedSeq}`,
      };
    } else {
      // End-to-end proof: recompute hash over the FULL envelope.
      record = await this.log.append(envelope, assertedHash);
      if (record.status === "verified") this.lastReceivedSeq = envelope.transport.seq;
    }
    this.ws.send(JSON.stringify({ t: "delivery", record } satisfies ClientFrame));
    for (const fn of this.momentListeners) fn(record, envelope);
  }

  /** Subscribe to arriving moments (verified and rejected). */
  onMoment(fn: (record: DeliveryRecord, moment: Moment) => void): void {
    this.momentListeners.push(fn);
  }

  /**
   * Send a moment. Appends to the local (sender) log first, then transmits;
   * resolves with the RECEIVER's delivery record. The sender proves
   * what-arrived-is-what-was-sent by comparing the receiver's content hash
   * with its own.
   */
  async sendMoment(
    moment: Omit<Moment, "transport"> & { transport?: Partial<Moment["transport"]> },
    timeoutMs = 10_000,
  ): Promise<{ delivery: DeliveryRecord; localHash: string }> {
    const seq = this.sendSeq++;
    const envelope: Moment = {
      ...moment,
      transport: {
        momentId: moment.transport?.momentId ?? `mom-${this.deviceId}-${seq}`,
        fromDeviceId: this.deviceId,
        toDeviceId: this.peerDeviceId || undefined,
        sentAt: new Date().toISOString(),
        seq,
        protocol: "jt-sync/0",
      },
    } as Moment;
    const local = await this.log.append(envelope);
    const localHash = local.contentHash;
    const delivery = new Promise<DeliveryRecord>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`no delivery record for ${envelope.transport.momentId} within ${timeoutMs}ms`)),
        timeoutMs,
      );
      this.pendingDeliveries.set(envelope.transport.momentId, {
        resolve: (r) => {
          clearTimeout(timer);
          resolve(r);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
    });
    this.ws.send(JSON.stringify({ t: "moment", envelope, hash: localHash } satisfies ClientFrame));
    return { delivery: await delivery, localHash };
  }

  /** Raw frame injection — test hook for tamper scenarios. */
  _sendRaw(frame: ClientFrame): void {
    this.ws.send(JSON.stringify(frame));
  }

  close(): void {
    this.ws.close();
  }
}
