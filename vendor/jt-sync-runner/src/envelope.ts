/**
 * The Moment envelope.
 *
 * jt's core claim: what travels between people and devices is the moment —
 * a document act with its context, evidence and intention record — never a
 * bare file. This module defines that envelope.
 *
 * CursorRecord and ReceiptRecord mirror the jt-contracts schemas
 * (jt-contracts/cursor/v0.1.0 and jt-contracts/receipt/v0.1.0) and are
 * validated against them in the test suite.
 */

/** Lifecycle states from the shared state machine (jt-contracts cursor schema). */
export type CursorState =
  | "rest"
  | "invitation"
  | "acquisition"
  | "provisional-intention"
  | "candidate"
  | "ambiguity"
  | "settlement"
  | "durable-result"
  | "recession"
  | "return";

export interface CursorHistoryStep {
  at?: string;
  event: string;
}

/** Conforms to jt-contracts/cursor/v0.1.0. */
export interface CursorRecord {
  schemaVersion: string;
  id: string;
  anchorId: string;
  sourceId: string;
  originModality?: string;
  originDeviceId?: string;
  capturedEvidence?: string;
  alternatives?: string[];
  proposedIntention?: string;
  state: CursorState;
  authorityRequired?: string;
  destination?: string;
  persistenceState?: string;
  receiptState?: "not-requested" | "pending" | "received" | "refused";
  history?: CursorHistoryStep[];
  undoAvailable?: boolean;
  repairRoute?: string;
  returnRoute?: string;
}

/** Conforms to jt-contracts/receipt/v0.1.0. */
export interface ReceiptRecord {
  schemaVersion: string;
  id: string;
  sourceId: string;
  sourceRevision: string;
  actionId: string;
  executor?: string;
  host?: string;
  device?: string;
  build?: string;
  result: string;
  artifactDigest?: string;
  occurredAt: string;
  authority?: string;
  arrival: "exact" | "degraded" | "refused";
  degradationNote?: string;
  undoRoute?: string;
  repairRoute?: string;
  recoveryRoute?: string;
  returnRoute?: string;
}

/** A piece of the document the act applies to. */
export interface DocumentBlock {
  /** Block kind: 'text' | 'note' | 'image-ref' | 'table' — open set for v0. */
  kind: string;
  /** The content itself (text) or a reference (for binary content). */
  content: string;
  /** Anchor id tying this block to an exact position in the source. */
  anchorId?: string;
}

/** Where the excerpt came from, so the moment never becomes a bare file. */
export interface Provenance {
  sourceId: string;
  sourceTitle?: string;
  /** sha256:<hex> digest of the source document revision the act ran against. */
  sourceDigest: string;
  sourceRevision?: string;
  author?: string;
  createdAt: string;
}

/** Transport metadata — wire-level, internal names. */
export interface TransportMeta {
  momentId: string;
  fromDeviceId: string;
  toDeviceId?: string;
  sentAt: string;
  /** Sender-assigned sequence number within the channel, for ordering. */
  seq: number;
  protocol: "jt-sync/0";
}

/**
 * The Moment: the unit that travels. The content hash covers this entire
 * envelope, so the intention record cannot be stripped or altered without
 * the arrival check failing.
 */
export interface Moment {
  /** The document act's visible substance. */
  blocks: DocumentBlock[];
  /** The live act that produced it — the intention record. */
  cursor: CursorRecord;
  /** Durable proof of what actually happened when the act ran. */
  receipt: ReceiptRecord;
  /** Where it all came from. */
  provenance: Provenance;
  /** Wire metadata. */
  transport: TransportMeta;
}

/**
 * Acknowledgement for an append: proof of what arrived. The hash is
 * recomputed by the receiver over the full envelope, so the sender can
 * verify that what arrived is what was sent, intention record intact.
 */
export interface DeliveryRecord {
  momentId: string;
  /** sha256:<hex> over the canonical full envelope, computed by the receiver. */
  contentHash: string;
  /** Position in the receiving device's log. */
  logSeq: number;
  receivedAt: string;
  deviceId: string;
  status: "verified" | "rejected";
  reason?: string;
}
