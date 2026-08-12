import { test } from "node:test";
import assert from "node:assert/strict";
import { comeToRest } from "../src/rest.ts";
import { medium, WATER } from "../src/medium.ts";

test("velocity decays monotonically to zero, position monotonic to resting point", () => {
  const c = comeToRest(900, WATER, 0);
  let prevV = Math.abs(c.at(0).v);
  let prevX = c.at(0).x;
  for (let t = 1 / 240; t <= c.duration * 1.5; t += 1 / 240) {
    const s = c.at(t);
    assert.ok(Math.abs(s.v) <= prevV + 1e-9, `speed grew at t=${t}`);
    assert.ok(s.x >= prevX - 1e-9, `position reversed at t=${t}`);
    assert.ok(s.x <= c.restingPoint + 1e-9, `passed resting point at t=${t}`);
    prevV = Math.abs(s.v);
    prevX = s.x;
  }
  const end = c.at(c.duration);
  assert.equal(end.x, c.restingPoint);
  assert.equal(end.v, 0);
  assert.equal(end.done, true);
});

test("resting point is predictable: x0 + v0/mu", () => {
  const m = medium({ drag: 6, viscosity: 1 });
  const c = comeToRest(600, m, 100);
  assert.equal(c.restingPoint, 100 + 600 / 6);
});

test("thicker medium stops sooner and shorter", () => {
  const thin = comeToRest(900, medium({ viscosity: 0.8 }));
  const thick = comeToRest(900, medium({ viscosity: 2 }));
  assert.ok(thick.duration < thin.duration);
  assert.ok(Math.abs(thick.restingPoint) < Math.abs(thin.restingPoint));
});

test("negative velocity coasts the other way", () => {
  const c = comeToRest(-500, WATER, 50);
  assert.ok(c.restingPoint < 50);
  assert.ok(c.at(c.duration).x === c.restingPoint);
});

test("determinism", () => {
  const a = comeToRest(731.5, WATER, 12);
  const b = comeToRest(731.5, WATER, 12);
  for (let t = 0; t <= a.duration; t += 1 / 240) {
    assert.equal(a.at(t).x, b.at(t).x);
    assert.equal(a.at(t).v, b.at(t).v);
  }
});
