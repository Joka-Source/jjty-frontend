import { test } from "node:test";
import assert from "node:assert/strict";
import { surface } from "../src/surface.ts";

test("field determinism: same seed + same steps => identical states", () => {
  const run = () => {
    const f = surface({ seed: 42, viscosity: 1.2 });
    f.glideTo("a", 0, 320);
    f.glideTo("b", 100, -40, "x");
    f.disturb({ x: 50, y: 50 }, 24);
    const trace: number[] = [];
    for (let i = 0; i < 240; i++) {
      f.step(1 / 120);
      const sa = f.sample("a");
      const sb = f.sample("b");
      const ro = f.rippleOffset({ x: 80, y: 60 });
      trace.push(sa ? sa.x : NaN, sb ? sb.x : NaN, ro.x, ro.y, f.random());
    }
    return trace;
  };
  assert.deepEqual(run(), run());
});

test("field comes to rest: motions retire, ripples spend, active() empties", () => {
  const f = surface({ seed: 1 });
  f.glideTo("m", 0, 320);
  f.release("n", 0, 900);
  f.disturb({ x: 0, y: 0 }, 24);
  assert.deepEqual(f.active().sort(), ["m", "n"]);
  for (let i = 0; i < 120 * 10; i++) f.step(1 / 120);
  assert.deepEqual(f.active(), []);
  assert.deepEqual(f.rippleOffset({ x: 10, y: 10 }), { x: 0, y: 0 });
});

test("finished glide samples exactly at target", () => {
  const f = surface();
  f.glideTo("m", 0, 320);
  for (let i = 0; i < 120; i++) f.step(1 / 60);
  // motion retired => sample null; before retirement it clamps to target
  const s = f.sample("m");
  assert.ok(s === null || (s.x === 320 && s.done));
});

test("step rejects negative dt", () => {
  const f = surface();
  assert.throws(() => f.step(-0.01), RangeError);
});

test("seeded random stream is reproducible and in [0,1)", () => {
  const a = surface({ seed: 7 });
  const b = surface({ seed: 7 });
  for (let i = 0; i < 100; i++) {
    const x = a.random();
    assert.equal(x, b.random());
    assert.ok(x >= 0 && x < 1);
  }
});
