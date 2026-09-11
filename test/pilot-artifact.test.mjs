import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const receipt = JSON.parse(readFileSync(path.join(root, "dist", "build-receipt.json"), "utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("pilot PWA artifact receipt covers the exact built files", () => {
  assert.equal(receipt.schema, "jjty.pwa-build-receipt/v1");
  assert.ok(receipt.fileCount > 5);
  assert.match(receipt.sourceRevision, /^(WORKING_TREE|[0-9a-f]{40})$/);
  let totalBytes = 0;
  for (const file of receipt.files) {
    const bytes = readFileSync(path.join(root, "dist", file.path));
    totalBytes += bytes.length;
    assert.equal(bytes.length, file.bytes, file.path);
    assert.equal(sha256(bytes), file.sha256, file.path);
  }
  assert.equal(totalBytes, receipt.totalBytes);
  const aggregate = receipt.files.map((file) => `${file.sha256}  ${file.path}\n`).join("");
  assert.equal(sha256(aggregate), receipt.aggregateSha256);
  assert.ok(receipt.files.some((file) => file.path === "index.html"));
  assert.ok(receipt.files.some((file) => file.path === "manifest.webmanifest"));
  assert.ok(receipt.files.some((file) => file.path === "sw.js"));
});
