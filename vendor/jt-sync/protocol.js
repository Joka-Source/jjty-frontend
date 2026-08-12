/**
 * Wire protocol frames (internal names). JSON text frames over WebSocket.
 * Shared by relay (node) and client (browser-safe): types only, no runtime
 * platform APIs.
 */
export function encodeFrame(frame) {
    return JSON.stringify(frame);
}
export function decodeFrame(data) {
    return JSON.parse(data);
}
