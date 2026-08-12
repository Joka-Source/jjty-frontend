// jt — moment transport (jt-sync). What travels between people is the
// moment: the act's blocks plus its cursor and receipt records plus
// provenance — never a bare file. Pairing is by three spoken words; the
// relay is a separate node process (jt-sync). On receive the client
// recomputes the hash over the full envelope; only verified moments show
// the verified badge.

import { MomentChannel } from "../vendor/jt-sync/client.js";
import { MemoryLogStore } from "../vendor/jt-sync/log.js";
import { isValidPairCode } from "../vendor/jt-sync/pairing.js";
import { contentDigest } from "../vendor/jt-connectors/index.js";

export { isValidPairCode };

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
  for (let i = from; i <= to; i++) {
    if (entry.act === "math") {
      blocks.push({
        kind: "math",
        content: entry.mathLatex,
        spoken: entry.mathSpeech,
        unparsed: [...(entry.mathUnparsed ?? [])],
        anchorId: `anc-${doc.id}-b${i}`,
      });
    } else {
      blocks.push({
        kind: "text",
        content: blockTexts[i] ?? "",
        anchorId: `anc-${doc.id}-b${i}`,
      });
    }
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
export function createSyncSurface({ relayUrl, deviceId, onArrive, onState }) {
  let channel = null;

  const state = () => ({
    connected: !!channel,
    paired: !!channel?.channelId,
    code: channel?.pairCode ?? "",
    peer: channel?.peerDeviceId ?? "",
  });
  const emit = () => onState?.(state());

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

  return {
    get state() {
      return state();
    },
    /** Start sharing: open a channel, get the three words to speak. */
    async open() {
      channel = await MomentChannel.create(relayUrl, deviceId, new MemoryLogStore());
      wireInbox(channel);
      emit();
      channel.waitForPeer(120000).then(emit, () => {});
      return channel.pairCode;
    },
    /** Join with the three words spoken on the other device. */
    async join(code) {
      const c = codeFromSpoken(code) ?? code;
      if (!isValidPairCode(c)) throw new Error("that does not sound like a share code");
      channel = await MomentChannel.join(relayUrl, deviceId, c, new MemoryLogStore());
      wireInbox(channel);
      emit();
      return c;
    },
    /** Send a kept act as a moment. Resolves with the receiver's proof. */
    async send(entry, doc, blockTexts) {
      if (!channel?.channelId) throw new Error("not connected to another device yet");
      const moment = await momentFromEntry(entry, doc, blockTexts);
      const { delivery, localHash } = await channel.sendMoment(moment);
      return {
        delivered: delivery.status === "verified",
        hashMatch: delivery.contentHash === localHash,
        delivery,
        localHash,
      };
    },
  };
}
