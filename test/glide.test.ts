import { test } from "node:test";
import assert from "node:assert/strict";
import { glide, REST_EPSILON } from "../src/glide.ts";
import { medium, WATER, omegaOf } from "../src/medium.ts";

const EPS = REST_EPSILON;

test("no overshoot beyond epsilon, dense sweep across media", () => {
  const media = [
    WATER,
    medium({ viscosity: 0.5 }),
    medium({ viscosity: 2.5 }),
    medium({ tension: 40 }),
    medium({ tension: 600, entry: 0.99 }),
  ];
  const moves: Array<[number, number]> = [
    [0, 320],
    [320, 0],
    [-50, 50],
    [10, 10.01],
    [1000, -1000],
  ];
  for (const m of media) {
    for (const [from, to] of moves) {
      const g = glide(from, to, m);
      const dir = Math.sign(to - from) || 1;
      for (let t = 0; t <= g.duration * 2; t += 1 / 240) {
        const { x } = g.at(t);
        // Never past the target by more than epsilon, in the direction of travel.
        assert.ok(
          (x - to) * dir <= EPS + 1e-9,
          `overshoot: from=${from} to=${to} t=${t.toFixed(4)} x=${x}`,
        );
      }
    }
  }
});

test("monotonic approach: distance to target never increases", () => {
  const g = glide(0, 320);
  let prev = Math.abs(g.at(0).x - 320);
  for (let t = 1 / 240; t <= g.duration * 1.5; t += 1 / 240) {
    const d = Math.abs(g.at(t).x - 320);
    assert.ok(d <= prev + 1e-9, `distance grew at t=${t}`);
    prev = d;
  }
});

test("arrival within duration envelope", () => {
  const g = glide(0, 320, WATER);
  // Envelope for default water: perceptible motion should land in 0.15..1.2s.
  assert.ok(g.duration > 0.15 && g.duration < 1.2, `duration=${g.duration}`);
  // At the reported duration the glide is at rest within epsilon.
  const end = g.at(g.duration);
  assert.equal(end.done, true);
  assert.equal(end.x, 320);
  assert.equal(end.v, 0);
  // Just before the duration it is within epsilon of the target.
  const near = g.at(g.duration * 0.999);
  assert.ok(Math.abs(near.x - 320) <= EPS * 1.05, `x=${near.x}`);
});

test("thicker medium arrives later and softer", () => {
  const thin = glide(0, 320, medium({ viscosity: 0.6 }));
  const thick = glide(0, 320, medium({ viscosity: 2 }));
  assert.ok(thick.duration > thin.duration);
  // Peak speed is lower in the thicker medium.
  const peak = (g: ReturnType<typeof glide>) => {
    let p = 0;
    for (let t = 0; t <= g.duration; t += 1 / 240) p = Math.max(p, Math.abs(g.at(t).v));
    return p;
  };
  assert.ok(peak(thick) < peak(thin));
});

test("fast entry: peak speed happens in the first third of the glide", () => {
  const g = glide(0, 320);
  let peakT = 0;
  let peakV = 0;
  for (let t = 0; t <= g.duration; t += 1 / 480) {
    const v = Math.abs(g.at(t).v);
    if (v > peakV) {
      peakV = v;
      peakT = t;
    }
  }
  assert.ok(peakT < g.duration / 3, `peak at ${peakT} of ${g.duration}`);
});

test("determinism: same inputs, identical trajectory to the bit", () => {
  const a = glide(12.5, 480.25, medium({ viscosity: 1.3, tension: 200 }));
  const b = glide(12.5, 480.25, medium({ viscosity: 1.3, tension: 200 }));
  for (let t = 0; t <= a.duration * 1.2; t += 1 / 240) {
    const sa = a.at(t);
    const sb = b.at(t);
    assert.equal(sa.x, sb.x);
    assert.equal(sa.v, sb.v);
    assert.equal(sa.done, sb.done);
  }
});

test("entry >= 1 is rejected (would allow overshoot)", () => {
  assert.throws(() => medium({ entry: 1 }), RangeError);
  assert.throws(() => medium({ entry: 1.5 }), RangeError);
});

test("zero-length glide is immediately done", () => {
  const g = glide(100, 100);
  assert.equal(g.duration, 0);
  assert.equal(g.at(0).done, true);
  assert.equal(g.at(0.5).x, 100);
});

test("omega derives from the medium", () => {
  assert.equal(omegaOf(WATER), Math.sqrt(WATER.tension) / WATER.viscosity);
});
