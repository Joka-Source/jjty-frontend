// jt-water integration: the marker's motion is physics, not CSS. These
// tests drive the app's glider with a fake clock and assert the water
// guarantees: monotonic approach, zero overshoot, retarget-from-flight,
// and a strictly decaying confirmation ripple.
import test from "node:test";
import assert from "node:assert/strict";
import { createGlider, createMarkerDriver, createReturnMotion, MARKER_MEDIUM, disturb, comeToRest } from "../src/motion.js";

test("rapid cursor updates keep one animation loop and stopping cancels all movement", t => {
  let nextId = 1;
  const frames = new Map();
  const originalRequest = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame');
  const originalCancel = Object.getOwnPropertyDescriptor(globalThis, 'cancelAnimationFrame');
  t.after(() => {
    if (originalRequest) Object.defineProperty(globalThis, 'requestAnimationFrame', originalRequest);
    else delete globalThis.requestAnimationFrame;
    if (originalCancel) Object.defineProperty(globalThis, 'cancelAnimationFrame', originalCancel);
    else delete globalThis.cancelAnimationFrame;
  });
  globalThis.requestAnimationFrame = callback => {
    const id = nextId++;
    frames.set(id, callback);
    return id;
  };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  const element = { style: {}, parentElement: { clientWidth: 100 } };
  const driver = createMarkerDriver(element);
  driver.moveTo({ top: 0, left: 0, width: 100, height: 20 });
  assert.equal(element.style.width, '100.00px', 'initial placement must be immediate');
  for (let top = 10; top <= 100; top += 10) {
    driver.moveTo({ top, left: 0, width: 100, height: 20 });
    assert.equal(frames.size, 1, 'an interim update must not fork the animation loop');
  }
  const [id, callback] = frames.entries().next().value;
  frames.delete(id);
  callback();
  assert.equal(frames.size, 1, 'the delivered frame must schedule only one successor');
  driver.stop();
  assert.equal(frames.size, 0, 'document changes must leave no old animation frames');
  driver.moveTo({ top: 500, left: 0, width: 100, height: 20 });
  assert.equal(element.style.top, '500.00px', 'a new document must start at its own position');
  driver.stop();
  assert.equal(frames.size, 0);
});

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

test("reading return travel and marker fade are both sampled from water", () => {
  let t = 0;
  const motion = createReturnMotion(100, 600, MARKER_MEDIUM, () => t);
  let priorY = 100;
  let priorOpacity = 1;
  for (t = 0; t <= 3000; t += 16) {
    const sample = motion.sample();
    assert.ok(sample.scrollY >= priorY - 1e-9, "return travel moved away from its target");
    assert.ok(sample.scrollY <= 600 + 1e-9, "return travel overshot its target");
    assert.ok(sample.opacity <= priorOpacity + 1e-9, "return marker became louder while fading");
    assert.ok(sample.opacity >= -1e-9, "return marker faded below zero");
    priorY = sample.scrollY;
    priorOpacity = sample.opacity;
  }
  t = 5000;
  assert.deepEqual(motion.sample(), { scrollY: 600, opacity: 0, done: true });
});
