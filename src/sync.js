// jt — moment transport (jt-sync). What travels between people is the
// moment: the act's blocks plus its cursor and receipt records plus
// provenance — never a bare file. Pairing is by three spoken words; the
// relay is a separate node process (jt-sync). On receive the client
// recomputes the hash over the full envelope; only verified moments show
// the verified badge.

import { MomentChannel } from "jt-sync/src/client.ts";
import { IndexedDbLogStore } from "jt-sync/src/log-indexeddb.ts";
import { IndexedDbOutboxStore } from "jt-sync/src/outbox-indexeddb.ts";
import { isValidPairCode } from "jt-sync/src/pairing.ts";
import { contentDigest } from "jt-connectors";
import { verbRegistry } from "./registry/index.js";

export { isValidPairCode };

const DEVICE_ID_KEY = "jt.sync.deviceId";
const PAIR_CODE_KEY = "jt.sync.pairCode";
const RESUME_TOKEN_KEY = "jt.sync.resumeToken";

export function stableDeviceId(storage, createId) {
  const stored = storage.getItem(DEVICE_ID_KEY);
  if (stored) return stored;
  const created = createId();
  storage.setItem(DEVICE_ID_KEY, created);
  return created;
}

/** Normalize spoken recipient words ("amber brook cedar") to a pair code. */
export function codeFromSpoken(recipient) {
  const code = String(recipient ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z]+/g, "-")
    .replace(/^-|-$/g, "");
  return isValidPairCode(code) ? code : null;
}

/**
 * Build a Moment envelope from a kept act entry + its document.
 * Blocks carry the acted text (range-aware); provenance carries the
 * document's digest so the receiver knows exactly what revision it lived in.
 */
export async function momentFromEntry(entry, doc, blockTexts) {
  const from = entry.blockIndex;
  const to = entry.blockEnd ?? entry.blockIndex;
  const blocks = [];
  const verb = verbRegistry.resolve(entry.verbId ?? entry.act);
  for (let i = from; i <= to; i++) {
    blocks.push(
      verb?.momentBlock?.(entry, { document: doc, blockIndex: i, blockTexts }) ?? {
        kind: "text",
        content: blockTexts[i] ?? "",
        anchorId: `anc-${doc.id}-b${i}`,
      },
    );
  }
  const sourceDigest = doc.provenance?.contentDigest ?? (await contentDigest(doc.text ?? ""));
  return {
    blocks,
    cursor: entry.cursor,
    receipt: entry.receipt,
    provenance: {
      sourceId: doc.id,
      sourceTitle: doc.title,
      sourceDigest,
      sourceRevision: `r${doc.revision}`,
      createdAt: entry.createdAt,
    },
  };
}

/**
 * The app's sync surface. One channel at a time (v0), inbox listeners,
 * spoken-word pairing both directions.
 */
export function createSyncSurface({ relayUrl, deviceId, onArrive, onState, storage = globalThis.localStorage }) {
  let channel = null;
  let pending = 0;
  let flushing = null;
  const activeSends = new Set();
  const outbox = new IndexedDbOutboxStore({ deviceId });
  let restoring = isValidPairCode(storage?.getItem(PAIR_CODE_KEY) ?? "") && !!storage?.getItem(RESUME_TOKEN_KEY);
  let restoreError = "";

  const state = () => ({
    connected: !!channel?.connected,
    paired: !!channel?.channelId,
    code: channel?.pairCode ?? "",
    peer: channel?.peerDeviceId ?? "",
    pending,
    restoring,
    restoreError,
  });
  const emit = () => onState?.(state());

  async function refreshPending() {
    pending = (await outbox.readAll()).length;
    emit();
  }

  async function deliverQueued(item) {
    const { delivery, localHash } = await channel.sendPreparedMoment(item.moment);
    if (delivery.status !== "verified" || delivery.contentHash !== localHash) {
      throw new Error(delivery.reason ?? "the other device could not verify delivery");
    }
    await outbox.remove(item.id);
    await refreshPending();
    return { delivered: true, hashMatch: true, delivery, localHash, queued: false };
  }

  async function flushOutbox() {
    if (flushing || !channel?.connected || !channel?.channelId) return flushing;
    flushing = (async () => {
      for (const item of await outbox.readAll()) {
        if (activeSends.has(item.id)) continue;
        try { await deliverQueued(item); }
        catch (error) {
          await outbox.recordFailure(item.id, String(error?.message ?? error));
          await refreshPending();
          break;
        }
      }
    })().finally(() => { flushing = null; });
    return flushing;
  }

  function wireInbox(ch) {
    ch.onMoment((record, moment) => {
      onArrive?.({
        momentId: record.momentId,
        verified: record.status === "verified",
        reason: record.reason ?? null,
        contentHash: record.contentHash,
        receivedAt: record.receivedAt,
        moment,
      });
    });
  }

  function attach(ch) {
    wireInbox(ch);
    ch.onConnectionState((connected) => { emit(); if (connected) void flushOutbox(); });
    ch.onRevoked(() => {
      storage?.removeItem(PAIR_CODE_KEY);
      storage?.removeItem(RESUME_TOKEN_KEY);
      if (channel === ch) channel = null;
      restoreError = "the other device ended this connection";
      emit();
    });
    void refreshPending().then(() => flushOutbox());
  }

  const ready = (async () => {
    const savedCode = storage?.getItem(PAIR_CODE_KEY) ?? "";
    const savedResumeToken = storage?.getItem(RESUME_TOKEN_KEY) ?? "";
    if (!isValidPairCode(savedCode) || !savedResumeToken) { restoring = false; return false; }
    try {
      channel = await MomentChannel.resume(relayUrl, deviceId, savedCode, savedResumeToken, new IndexedDbLogStore({ deviceId }));
      attach(channel);
      return true;
    } catch (error) {
      restoreError = String(error?.message ?? error);
      return false;
    } finally {
      restoring = false;
      emit();
    }
  })();

  return {
    deviceId,
    get state() {
      return state();
    },
    /** Start sharing: open a channel, get the three words to speak. */
    async open() {
      await ready;
      channel?.close();
      channel = await MomentChannel.create(relayUrl, deviceId, new IndexedDbLogStore({ deviceId }));
      restoreError = "";
      storage?.setItem(PAIR_CODE_KEY, channel.pairCode);
      storage?.setItem(RESUME_TOKEN_KEY, channel.resumeToken);
      attach(channel);
      emit();
      channel.waitForPeer(120000).then(emit, () => {});
      return channel.pairCode;
    },
    /** Join with the three words spoken on the other device. */
    async join(code) {
      await ready;
      const c = codeFromSpoken(code) ?? code;
      if (!isValidPairCode(c)) throw new Error("that does not sound like a share code");
      channel?.close();
      channel = await MomentChannel.join(relayUrl, deviceId, c, new IndexedDbLogStore({ deviceId }));
      restoreError = "";
      storage?.setItem(PAIR_CODE_KEY, c);
      storage?.setItem(RESUME_TOKEN_KEY, channel.resumeToken);
      attach(channel);
      emit();
      return c;
    },
    /** Send a kept act as a moment. Resolves with the receiver's proof. */
    async send(entry, doc, blockTexts) {
      await ready;
      if (!channel?.channelId) throw new Error("not connected to another device yet");
      const moment = await momentFromEntry(entry, doc, blockTexts);
      const prepared = channel.prepareMoment(moment);
      const item = { id: prepared.transport.momentId, createdAt: new Date().toISOString(), attemptCount: 0, lastError: null, moment: prepared };
      await outbox.put(item);
      await refreshPending();
      if (!channel.connected) return { delivered: false, hashMatch: false, queued: true, error: "connection unavailable" };
      activeSends.add(item.id);
      try { return await deliverQueued(item); }
      catch (error) {
        await outbox.recordFailure(item.id, String(error?.message ?? error));
        await refreshPending();
        setTimeout(() => void flushOutbox(), 0);
        return { delivered: false, hashMatch: false, queued: true, error: String(error?.message ?? error) };
      } finally { activeSends.delete(item.id); }
    },
    async retryPending(timeoutMs = 20_000) {
      await ready;
      if (!channel?.channelId) throw new Error("not connected to another device yet");
      await channel.waitUntilConnected(timeoutMs);
      await flushOutbox();
      return state();
    },
    async forget() {
      await ready;
      const active = channel;
      if (active?.pairCode && active?.resumeToken) await active.revoke();
      storage?.removeItem(PAIR_CODE_KEY);
      storage?.removeItem(RESUME_TOKEN_KEY);
      if (channel === active) channel = null;
      restoreError = "";
      emit();
    },
    disconnectForTest: () => channel?._dropTransport(),
    restorePairing: () => ready,
    pendingItems: () => outbox.readAll(),
    replacePending: (entries) => outbox.replaceAll(entries),
  };
}
