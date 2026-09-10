/**
 * Wire protocol frames (internal names). JSON text frames over WebSocket.
 * Shared by relay (node) and client (browser-safe): types only, no runtime
 * platform APIs.
 */

import type { DeliveryRecord, Moment } from "./envelope.js";

/** Client -> relay */
export type ClientFrame =
  | { t: "create"; deviceId: string }
  | { t: "join"; deviceId: string; code: string }
  | { t: "resume"; deviceId: string; code: string }
  | { t: "moment"; envelope: Moment; hash: string }
  | { t: "delivery"; record: DeliveryRecord };

/** Relay -> client */
export type RelayFrame =
  | { t: "code"; code: string }
  | { t: "paired"; channelId: string; peerDeviceId: string }
  | { t: "moment"; envelope: Moment; hash: string }
  | { t: "delivery"; record: DeliveryRecord }
  | { t: "error"; message: string };

export function encodeFrame(frame: ClientFrame | RelayFrame): string {
  return JSON.stringify(frame);
}

export function decodeFrame<T>(data: string): T {
  return JSON.parse(data) as T;
}
