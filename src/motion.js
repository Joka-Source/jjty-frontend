// jt — motion adapter. The marker's travel and act confirmations are driven
// by jt-water's physics (closed-form glide / disturb / comeToRest samplers),
// not CSS transitions. The physics stays headless and pure; this file is the
// only place a rAF loop touches the DOM, and the pure trajectory helpers are
// exported for node tests.

import { glide, disturb, comeToRest, WATER, medium } from "../vendor/jt-water/index.js";

export { glide, disturb, comeToRest, WATER, medium };

/** jt's marker medium: slightly thicker than default water so the marker
 * arrives fast but soft. Subtle, never bouncy (entry < 1 ⇒ no overshoot). */
export const MARKER_MEDIUM = medium({ viscosity: 0.9, tension: 210, entry: 0.82, drag: 6 });

/**
 * A one-dimensional glide driver: retarget at any moment and it re-glides
 * from wherever it currently is. Pure state machine over performance.now();
 * `sample()` is separated from the rAF loop so tests can drive it with fake
 * clocks.
 */
export function createGlider(initial = 0, m = MARKER_MEDIUM, now = () => performance.now()) {
  let g = null;
  let t0 = 0;
  let value = initial;

  return {
    /** Where the value is right now. */
    sample() {
      if (!g) return { x: value, done: true };
      const s = g.at((now() - t0) / 1000);
      value = s.x;
      if (s.done) g = null;
      return { x: value, done: !g };
    },
    /** Glide toward a new target from the current position. */
    to(target) {
      this.sample();
      if (Math.abs(target - value) < 0.5) {
        value = target;
        g = null;
        return;
      }
      g = glide(value, target, m);
      t0 = now();
    },
    /** Jump without motion (initial placement). */
    set(v) {
      value = v;
      g = null;
    },
    get target() {
      return g ? g.to : value;
    },
  };
}

/**
 * Drive a marker element with two gliders (top, height) on one rAF loop.
 * Returns { moveTo(top, height), stop() }.
 */
export function createMarkerDriver(el) {
  const top = createGlider(0);
  const height = createGlider(0);
  let raf = 0;
  let placed = false;

  function frame() {
    const a = top.sample();
    const b = height.sample();
    el.style.top = `${a.x.toFixed(2)}px`;
    el.style.height = `${b.x.toFixed(2)}px`;
    raf = a.done && b.done ? 0 : requestAnimationFrame(frame);
  }

  return {
    moveTo(t, h) {
      if (!placed) {
        // first placement: appear where the reading is, no cross-page swim
        top.set(t);
        height.set(h);
        placed = true;
      } else {
        top.to(t);
        height.to(h);
      }
      if (!raf) raf = requestAnimationFrame(frame);
    },
    stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      placed = false;
    },
  };
}

/**
 * Act confirmation: a small disturbance at the block — the page registers
 * the act physically, then comes back to rest. Subtle: a few px, ~0.4s.
 */
export function confirmRipple(el, { energy = 5 } = {}) {
  const r = disturb({ x: 0, y: 0 }, energy);
  const t0 = performance.now();
  function frame(ts) {
    const t = (ts - t0) / 1000;
    if (r.spent(t)) {
      el.style.transform = "";
      return;
    }
    // sample the wave a fixed small distance from the origin so the block
    // heaves horizontally with the decaying travelling wave
    const u = r.at({ x: 12, y: 0 }, t);
    el.style.transform = `translateX(${u.toFixed(2)}px)`;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return r; // exposed for tests: energy envelope is strictly decreasing
}
