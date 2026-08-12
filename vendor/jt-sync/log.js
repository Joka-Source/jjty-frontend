/**
 * Append-only per-device moment log.
 *
 * The log store is pluggable so the client library stays browser-safe:
 * - MemoryLogStore: no platform APIs at all (browser, tests).
 * - FileLogStore (log-file.ts): JSON-lines on disk with single-writer
 *   discipline via an exclusive lock file (node/device side).
 *
 * Every append is acknowledged with a DeliveryRecord that carries the
 * content hash over the full envelope, so the device can prove what
 * arrived is what was sent, intention record intact.
 */
import { envelopeHash } from "./hash.js";
export class MemoryLogStore {
    entries = [];
    async append(entry) {
        this.entries.push(entry);
    }
    async readAll() {
        return [...this.entries];
    }
    async nextSeq() {
        return this.entries.length;
    }
}
export class MomentLog {
    deviceId;
    store;
    constructor(deviceId, store) {
        this.deviceId = deviceId;
        this.store = store;
    }
    /**
     * Append a moment. Recomputes the content hash over the full envelope;
     * when `expectedHash` is given (a hash asserted by the sender), a
     * mismatch rejects the append — nothing tampered enters the log.
     */
    async append(moment, expectedHash) {
        const contentHash = await envelopeHash(moment);
        const receivedAt = new Date().toISOString();
        if (expectedHash !== undefined && expectedHash !== contentHash) {
            return {
                momentId: moment.transport.momentId,
                contentHash,
                logSeq: -1,
                receivedAt,
                deviceId: this.deviceId,
                status: "rejected",
                reason: `content hash mismatch: sender asserted ${expectedHash}, receiver computed ${contentHash}`,
            };
        }
        const logSeq = await this.store.nextSeq();
        await this.store.append({
            logSeq,
            appendedAt: receivedAt,
            contentHash,
            moment,
        });
        return {
            momentId: moment.transport.momentId,
            contentHash,
            logSeq,
            receivedAt,
            deviceId: this.deviceId,
            status: "verified",
        };
    }
    async entries() {
        return this.store.readAll();
    }
}
