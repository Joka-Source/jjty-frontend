import { test } from "node:test";
import assert from "node:assert/strict";
import { disturb } from "../src/ripple.ts";

test("ripple energy strictly decays", () => {
  const r = disturb({ x: 0, y: 0 }, 24);
  let prev = r.energyAt(0);
  assert.equal(prev, 24);
  for (let t = 1 / 240; t <= 5; t += 1 / 240) {
    const e = r.energyAt(t);
    assert.ok(e < prev, `energy did not decrease at t=${t}: ${e} >= ${prev}`);
    prev = e;
  }
});

test("influence is bounded by the energy envelope everywhere", () => {
  const r = disturb({ x: 50, y: 50 }, 24);
  for (let t = 0; t <= 3; t += 0.05) {
    const env = r.energyAt(t);
    for (const p of [
      { x: 50, y: 50 },
      { x: 90, y: 50 },
      { x: 250, y: 130 },
      { x: -400, y: 900 },
    ]) {
      assert.ok(Math.abs(r.at(p, t)) <= env + 1e-12);
    }
  }
});

test("influence falls off with distance (peak amplitude over a cycle)", () => {
  const r = disturb({ x: 0, y: 0 }, 24);
  const peak = (px: number) => {
    let m = 0;
    for (let t = 0; t <= 2; t += 1 / 480) m = Math.max(m, Math.abs(r.at({ x: px, y: 0 }, t)));
    return m;
  };
  const near = peak(30);
  const mid = peak(150);
  const far = peak(400);
  assert.ok(near > mid && mid > far, `${near} > ${mid} > ${far} failed`);
});

test("ripple is spent after energy drops below threshold, and never before t=0", () => {
  const r = disturb({ x: 0, y: 0 }, 24);
  assert.equal(r.spent(0), false);
  assert.equal(r.spent(10), true);
  assert.equal(r.at({ x: 10, y: 10 }, -1), 0);
});

test("offset points radially away from the origin", () => {
  const r = disturb({ x: 0, y: 0 }, 24);
  const p = { x: 100, y: 0 };
  // find a time where influence is positive
  let t = 0;
  while (r.at(p, t) <= 0 && t < 2) t += 1 / 240;
  const o = r.offset(p, t);
  assert.ok(o.x > 0, "positive influence pushes +x for a point at +x");
  assert.equal(o.y, 0);
});

test("determinism: identical ripples produce identical fields", () => {
  const a = disturb({ x: 3, y: 4 }, 17.5, { lambda: 2.5 });
  const b = disturb({ x: 3, y: 4 }, 17.5, { lambda: 2.5 });
  for (let t = 0; t <= 2; t += 0.01) {
    assert.equal(a.at({ x: 40, y: 9 }, t), b.at({ x: 40, y: 9 }, t));
  }
});
