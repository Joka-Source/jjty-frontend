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
import { MomentLog } from "./log.js";
export class MomentChannel {
    deviceId;
    log;
    pairCode = "";
    channelId = "";
    peerDeviceId = "";
    ws;
    sendSeq = 0;
    lastReceivedSeq = -1;
    pendingDeliveries = new Map();
    momentListeners = [];
    constructor(deviceId, store) {
        this.deviceId = deviceId;
        this.log = new MomentLog(deviceId, store);
    }
    /** Device A: open a channel and get a spoken pair code. */
    static async create(relayUrl, deviceId, store) {
        const ch = new MomentChannel(deviceId, store);
        await ch.connect(relayUrl);
        ch.pairCode = await ch.request({ t: "create", deviceId }, "code").then((f) => f.code);
        return ch;
    }
    /** Device B: join with the code spoken by device A. */
    static async join(relayUrl, deviceId, code, store) {
        const ch = new MomentChannel(deviceId, store);
        await ch.connect(relayUrl);
        ch.pairCode = code;
        const paired = (await ch.request({ t: "join", deviceId, code }, "paired"));
        ch.channelId = paired.channelId;
        ch.peerDeviceId = paired.peerDeviceId;
        return ch;
    }
    /** Resolves on device A when device B has joined. */
    waitForPeer(timeoutMs = 10_000) {
        if (this.channelId)
            return Promise.resolve();
        return this.waitFrame("paired", timeoutMs).then((f) => {
            const p = f;
            this.channelId = p.channelId;
            this.peerDeviceId = p.peerDeviceId;
        });
    }
    connect(relayUrl) {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(relayUrl);
            this.ws.onopen = () => resolve();
            this.ws.onerror = () => reject(new Error(`could not connect to relay ${relayUrl}`));
            this.ws.onmessage = (ev) => this.onFrame(String(ev.data));
        });
    }
    frameWaiters = new Map();
    waitFrame(type, timeoutMs = 10_000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`timed out waiting for '${type}' frame`)), timeoutMs);
            const list = this.frameWaiters.get(type) ?? [];
            list.push((f) => {
                clearTimeout(timer);
                resolve(f);
            });
            this.frameWaiters.set(type, list);
        });
    }
    request(frame, replyType) {
        const reply = this.waitFrame(replyType);
        this.ws.send(JSON.stringify(frame));
        return reply;
    }
    async onFrame(text) {
        let frame;
        try {
            frame = JSON.parse(text);
        }
        catch {
            return;
        }
        const waiters = this.frameWaiters.get(frame.t);
        if (waiters && waiters.length > 0 && frame.t !== "moment") {
            this.frameWaiters.set(frame.t, []);
            for (const w of waiters)
                w(frame);
            if (frame.t !== "error")
                return;
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
                for (const [, p] of this.pendingDeliveries)
                    p.reject(new Error(frame.message));
                this.pendingDeliveries.clear();
                break;
        }
    }
    async receiveMoment(envelope, assertedHash) {
        // Ordering discipline: sender seq must be strictly increasing.
        let record;
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
        }
        else {
            // End-to-end proof: recompute hash over the FULL envelope.
            record = await this.log.append(envelope, assertedHash);
            if (record.status === "verified")
                this.lastReceivedSeq = envelope.transport.seq;
        }
        this.ws.send(JSON.stringify({ t: "delivery", record }));
        for (const fn of this.momentListeners)
            fn(record, envelope);
    }
    /** Subscribe to arriving moments (verified and rejected). */
    onMoment(fn) {
        this.momentListeners.push(fn);
    }
    /**
     * Send a moment. Appends to the local (sender) log first, then transmits;
     * resolves with the RECEIVER's delivery record. The sender proves
     * what-arrived-is-what-was-sent by comparing the receiver's content hash
     * with its own.
     */
    async sendMoment(moment, timeoutMs = 10_000) {
        const seq = this.sendSeq++;
        const envelope = {
            ...moment,
            transport: {
                momentId: moment.transport?.momentId ?? `mom-${this.deviceId}-${seq}`,
                fromDeviceId: this.deviceId,
                toDeviceId: this.peerDeviceId || undefined,
                sentAt: new Date().toISOString(),
                seq,
                protocol: "jt-sync/0",
            },
        };
        const local = await this.log.append(envelope);
        const localHash = local.contentHash;
        const delivery = new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`no delivery record for ${envelope.transport.momentId} within ${timeoutMs}ms`)), timeoutMs);
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
        this.ws.send(JSON.stringify({ t: "moment", envelope, hash: localHash }));
        return { delivery: await delivery, localHash };
    }
    /** Raw frame injection — test hook for tamper scenarios. */
    _sendRaw(frame) {
        this.ws.send(JSON.stringify(frame));
    }
    close() {
        this.ws.close();
    }
}
