import type { CursorRecord, Moment, ReceiptRecord } from "../src/envelope.js";

/** Path to the jt-contracts checkout holding the record schemas. */
export const CONTRACTS_DIR =
  process.env.JT_CONTRACTS_DIR ?? new URL("../../jt-contracts", import.meta.url).pathname;

export function makeCursor(n: number, fullLifecycle = false): CursorRecord {
  const base: CursorRecord = {
    schemaVersion: "0.1.0",
    id: `cur-t${n}`,
    anchorId: `anc-t${n}`,
    sourceId: `src-t${n}`,
    originModality: "voice",
    originDeviceId: "device-a",
    capturedEvidence: `add a note here saying checked item ${n}`,
    alternatives: [`add a note: checked item ${n}`],
    proposedIntention: `insert-note at anchor anc-t${n} with text 'checked item ${n}'`,
    state: "durable-result",
    authorityRequired: "person-test",
    destination: `src-t${n} at anc-t${n}`,
    persistenceState: "saved-local",
    receiptState: "received",
    undoAvailable: true,
    repairRoute: `reselect | retype | retry-voice | inspect-source, returning to anc-t${n}`,
    returnRoute: `open://src-t${n}/r1#anc-t${n}`,
  };
  if (fullLifecycle) {
    base.history = [
      { at: "2026-08-12T10:00:00Z", event: "at rest at anchor" },
      { at: "2026-08-12T10:00:01Z", event: "invitation shown" },
      { at: "2026-08-12T10:00:02Z", event: "voice input captured (acquisition)" },
      { at: "2026-08-12T10:00:03Z", event: "provisional intention formed" },
      { at: "2026-08-12T10:00:04Z", event: "candidate proposed with one alternative" },
      { at: "2026-08-12T10:00:05Z", event: "ambiguity resolved by person" },
      { at: "2026-08-12T10:00:06Z", event: "person confirmed (settlement)" },
      { at: "2026-08-12T10:00:07Z", event: "result made durable" },
      { at: "2026-08-12T10:00:08Z", event: "interaction stepped back (recession)" },
      { at: "2026-08-12T10:00:09Z", event: "person returned to source position" },
    ];
  }
  return base;
}

export function makeReceipt(n: number): ReceiptRecord {
  return {
    schemaVersion: "0.1.0",
    id: `rcp-t${n}`,
    sourceId: `src-t${n}`,
    sourceRevision: "r1",
    actionId: `act-t${n}`,
    executor: "local-domain-engine",
    host: "jt-sync-test",
    device: "device-a",
    build: "jt-sync 0.1.0",
    result: `note inserted at anc-t${n} and verified`,
    artifactDigest: "sha256:" + "ab".repeat(32),
    occurredAt: "2026-08-12T10:00:07Z",
    authority: "person-test",
    arrival: "exact",
    undoRoute: "remove the inserted note",
    returnRoute: `open://src-t${n}/r2#anc-t${n}`,
  };
}

export function makeMoment(n: number, fullLifecycle = false): Omit<Moment, "transport"> {
  return {
    blocks: [
      {
        kind: "text",
        content: `Inspection line ${n}: gauge reading recorded and cross-checked.`,
        anchorId: `anc-t${n}`,
      },
      { kind: "note", content: `checked item ${n}`, anchorId: `anc-t${n}` },
    ],
    cursor: makeCursor(n, fullLifecycle),
    receipt: makeReceipt(n),
    provenance: {
      sourceId: `src-t${n}`,
      sourceTitle: `Site inspection log ${n}`,
      sourceDigest: "sha256:" + "cd".repeat(32),
      sourceRevision: "r1",
      author: "person-test",
      createdAt: "2026-08-12T09:00:00Z",
    },
  };
}
