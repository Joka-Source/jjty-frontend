// Structural diff of two conformance outputs. Numbers must be EXACTLY
// equal (same f64 after JSON parse); everything else deep-equal.
//
// Usage: node conformance/diff.mjs js_out.json rs_out.json

import { readFileSync } from "node:fs";

const [aPath, bPath] = process.argv.slice(2);
if (!aPath || !bPath) {
  console.error("usage: node conformance/diff.mjs <a.json> <b.json>");
  process.exit(2);
}
const a = JSON.parse(readFileSync(aPath, "utf8"));
const b = JSON.parse(readFileSync(bPath, "utf8"));

function eq(x, y) {
  if (typeof x === "number" && typeof y === "number") return Object.is(x, y);
  if (Array.isArray(x) && Array.isArray(y))
    return x.length === y.length && x.every((v, i) => eq(v, y[i]));
  if (x && y && typeof x === "object" && typeof y === "object") {
    const kx = Object.keys(x).sort();
    const ky = Object.keys(y).sort();
    return eq(kx, ky) && kx.every((k) => eq(x[k], y[k]));
  }
  return Object.is(x, y);
}

if (a.length !== b.length) {
  console.error(`LENGTH MISMATCH: ${a.length} vs ${b.length}`);
  process.exit(1);
}
let failures = 0;
a.forEach((v, i) => {
  if (!eq(v, b[i])) {
    failures++;
    console.error(`CASE ${i} DIFFERS`);
    console.error(`  ${aPath}: ${JSON.stringify(v)}`);
    console.error(`  ${bPath}: ${JSON.stringify(b[i])}`);
  }
});
if (failures) {
  console.error(`CONFORMANCE FAIL: ${failures}/${a.length} cases differ`);
  process.exit(1);
}
console.log(`CONFORMANCE OK: ${a.length}/${a.length} cases identical`);
