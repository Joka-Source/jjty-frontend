/**
 * Content digests. Isomorphic: uses WebCrypto, present in every modern browser
 * and in node >= 19 as globalThis.crypto.
 */
const encoder = new TextEncoder();
export function toBytes(input) {
    return typeof input === "string" ? encoder.encode(input) : input;
}
/** sha-256 of the exact input bytes, as "sha256:<hex>". Same input, same digest. */
export async function contentDigest(input) {
    const bytes = toBytes(input);
    const buf = await globalThis.crypto.subtle.digest("SHA-256", 
    // copy into a plain ArrayBuffer-backed view to satisfy BufferSource
    bytes.slice().buffer);
    const hex = Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    return `sha256:${hex}`;
}
export function byteSize(input) {
    return toBytes(input).byteLength;
}
