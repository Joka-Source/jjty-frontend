/**
 * Canonical JSON + SHA-256 over the full moment envelope.
 * Browser-safe: uses Web Crypto (`crypto.subtle`) only — no node:crypto.
 */

/** Deterministic JSON: object keys sorted recursively, no whitespace. */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    if (value === undefined) throw new Error("cannot canonicalize undefined");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map((v) => canonicalize(v)).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return (
    "{" +
    keys.map((k) => JSON.stringify(k) + ":" + canonicalize(obj[k])).join(",") +
    "}"
  );
}

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Content hash of a full envelope, as 'sha256:<hex>'. */
export async function envelopeHash(envelope: unknown): Promise<string> {
  return "sha256:" + (await sha256Hex(canonicalize(envelope)));
}
