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

import type { DeliveryRecord, Moment } from "./envelope.js";
import { envelopeHash } from "./hash.js";

export interface LogEntry {
  logSeq: number;
  appendedAt: string;
  contentHash: string;
  moment: Moment;
}

export interface LogStore {
  /** Persist one entry. Must be strictly append-only. */
  append(entry: LogEntry): Promise<void>;
  /** Read all entries in append order. */
  readAll(): Promise<LogEntry[]>;
  /** Next sequence number (count of existing entries). */
  nextSeq(): Promise<number>;
}

export class MemoryLogStore implements LogStore {
  private entries: LogEntry[] = [];
  async append(entry: LogEntry): Promise<void> {
    this.entries.push(entry);
  }
  async readAll(): Promise<LogEntry[]> {
    return [...this.entries];
  }
  async nextSeq(): Promise<number> {
    return this.entries.length;
  }
}

export class MomentLog {
  constructor(
    public readonly deviceId: string,
    private readonly store: LogStore,
  ) {}

  /**
   * Append a moment. Recomputes the content hash over the full envelope;
   * when `expectedHash` is given (a hash asserted by the sender), a
   * mismatch rejects the append — nothing tampered enters the log.
   */
  async append(moment: Moment, expectedHash?: string): Promise<DeliveryRecord> {
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
    const existing = (await this.store.readAll()).find(
      (entry) => entry.moment.transport.momentId === moment.transport.momentId,
    );
    if (existing) {
      return existing.contentHash === contentHash
        ? { momentId: moment.transport.momentId, contentHash, logSeq: existing.logSeq, receivedAt, deviceId: this.deviceId, status: "verified" }
        : { momentId: moment.transport.momentId, contentHash, logSeq: -1, receivedAt, deviceId: this.deviceId, status: "rejected", reason: "moment id was reused with different content" };
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

  async entries(): Promise<LogEntry[]> {
    return this.store.readAll();
  }
}
