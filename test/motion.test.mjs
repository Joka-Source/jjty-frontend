// jt-water integration: the marker's motion is physics, not CSS. These
// tests drive the app's glider with a fake clock and assert the water
// guarantees: monotonic approach, zero overshoot, retarget-from-flight,
// and a strictly decaying confirmation ripple.
import test from "node:test";
import assert from "node:assert/strict";
import { createGlider, MARKER_MEDIUM, disturb, comeToRest } from "../src/motion.js";

test("glide approaches the target monotonically and never overshoots", () => {
  let t = 0;
  const now = () => t;
  const g = createGlider(0, MARKER_MEDIUM, now);
  g.set(100);
  g.to(500);
  let prev = 100;
  for (t = 0; t < 3000; t += 16) {
    const { x } = g.sample();
    assert.ok(x >= prev - 1e-9, `not monotonic at t=${t}: ${x} < ${prev}`);
    assert.ok(x <= 500 + 1e-9, `overshoot at t=${t}: ${x}`);
    prev = x;
  }
  t = 5000;
  const end = g.sample();
  assert.equal(end.x, 500);
  assert.equal(end.done, true);
});

test("retargeting mid-flight re-glides from the current position", () => {
  let t = 0;
  const g = createGlider(0, MARKER_MEDIUM, () => t);
  g.set(0);
  g.to(400);
  t = 40; // mid-flight
  const mid = g.sample().x;
  assert.ok(mid > 0 && mid < 400, `expected mid-flight, got ${mid}`);
  g.to(50); // new target below current position
  const t0 = t;
  let prev = mid;
  for (t = t0; t < t0 + 3000; t += 16) {
    const { x } = g.sample();
    assert.ok(x <= prev + 1e-9, "should move down toward the new target");
    assert.ok(x >= 50 - 1e-9, "no overshoot past the new target");
    prev = x;
  }
});

test("confirmation ripple energy strictly decays — the water always calms", () => {
  const r = disturb({ x: 0, y: 0 }, 5);
  let prev = Infinity;
  for (let t = 0; t <= 2; t += 0.05) {
    const e = r.energyAt(t);
    assert.ok(e < prev, `energy rose at t=${t}`);
    prev = e;
  }
  assert.ok(r.spent(3), "ripple should be spent after 3s");
});

test("comeToRest stops at the predictable resting point", () => {
  const c = comeToRest(600);
  const end = c.at(c.duration + 1);
  assert.equal(end.done, true);
  assert.equal(end.x, c.restingPoint);
  assert.equal(end.v, 0);
});
