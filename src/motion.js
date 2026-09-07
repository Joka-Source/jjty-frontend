// jt — motion adapter. The marker's travel and act confirmations are driven
// by jt-water's physics (closed-form glide / disturb / comeToRest samplers),
// not CSS transitions. The physics stays headless and pure; this file is the
// only place a rAF loop touches the DOM, and the pure trajectory helpers are
// exported for node tests.

import { glide, disturb, comeToRest, WATER, medium } from "jt-water";

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
  // m may be a medium or a () => medium, so a settings change (motion
  // intensity) takes hold on the very next glide without rebuilding drivers.
  const mediumNow = () => (typeof m === "function" ? m() : m);

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
      g = glide(value, target, mediumNow());
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
export function createMarkerDriver(el, mediumOf = () => MARKER_MEDIUM) {
  const top = createGlider(0, mediumOf);
  const left = createGlider(0, mediumOf);
  const width = createGlider(0, mediumOf);
  const height = createGlider(0, mediumOf);
  let raf = 0;
  let placed = false;

  function frame() {
    const a = top.sample();
    const b = left.sample();
    const c = width.sample();
    const d = height.sample();
    el.style.top = `${a.x.toFixed(2)}px`;
    el.style.left = `${b.x.toFixed(2)}px`;
    el.style.width = `${c.x.toFixed(2)}px`;
    el.style.height = `${d.x.toFixed(2)}px`;
    raf = a.done && b.done && c.done && d.done ? 0 : requestAnimationFrame(frame);
  }

  return {
    moveTo(target, legacyHeight) {
      const next = typeof target === "object"
        ? target
        : { top: target, left: 0, width: el.parentElement?.clientWidth ?? 0, height: legacyHeight };
      if (!placed) {
        // first placement: appear where the reading is, no cross-page swim
        top.set(next.top);
        left.set(next.left);
        width.set(next.width);
        height.set(next.height);
        placed = true;
      } else {
        top.to(next.top);
        left.to(next.left);
        width.to(next.width);
        height.to(next.height);
      }
      // Retarget the one loop instead of leaving an older scheduled frame
      // alive. Immediate sampling also keeps initial placement visible when
      // the browser throttles animation frames.
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      frame();
    },
    stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      placed = false;
    },
  };
}

/**
 * Surface arrival: when the shell shows a different surface, the new one
 * rises and clears through the same water the marker swims in — a glide
 * from 1 to 0 drives both translateY (x8 px) and opacity (1 - x). No CSS
 * easing; the trajectory is jt-water's closed-form glide.
 */
export function surfaceArrive(el, m = MARKER_MEDIUM) {
  if (globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    el.style.transform = "";
    el.style.opacity = "";
    return;
  }
  const g = glide(1, 0, m);
  const t0 = performance.now();
  function frame(ts) {
    const s = g.at((ts - t0) / 1000);
    if (s.done) {
      el.style.transform = "";
      el.style.opacity = "";
      return;
    }
    el.style.transform = `translateY(${(s.x * 8).toFixed(2)}px)`;
    el.style.opacity = (1 - s.x).toFixed(3);
    requestAnimationFrame(frame);
  }
  el.style.opacity = "0";
  requestAnimationFrame(frame);
}

/** Pure return trajectory: viewport travel and the quiet label fade are both
 * sampled from jt-water. `now` is injectable so node tests need no DOM. */
export function createReturnMotion(from, to, m = MARKER_MEDIUM, now = () => performance.now()) {
  const travel = glide(from, to, m);
  const fade = glide(1, 0, m);
  const t0 = now();
  const fadeDelay = 0.75;
  return {
    sample() {
      const elapsed = Math.max(0, (now() - t0) / 1000);
      const a = travel.at(elapsed);
      const b = fade.at(Math.max(0, elapsed - fadeDelay));
      return {
        scrollY: a.x,
        opacity: b.x,
        done: a.done && b.done && elapsed >= fadeDelay,
      };
    },
  };
}

/** Return the viewport to a block and show a short-lived place label. There is
 * deliberately no `scrollIntoView({behavior:"smooth"})` or CSS transition. */
export function returnToPlace(block, m = MARKER_MEDIUM) {
  document.querySelector(".return-marker")?.remove();
  const label = document.createElement("span");
  label.className = "return-marker";
  label.textContent = "you were here";
  label.setAttribute("aria-hidden", "true");
  block.appendChild(label);

  const rect = block.getBoundingClientRect();
  const target = Math.max(0, window.scrollY + rect.top - window.innerHeight * 0.36);
  const motion = createReturnMotion(window.scrollY, target, m);
  function frame() {
    const sample = motion.sample();
    window.scrollTo({ top: sample.scrollY, behavior: "auto" });
    label.style.opacity = sample.opacity.toFixed(3);
    if (sample.done) {
      label.remove();
      return;
    }
    requestAnimationFrame(frame);
  }
  label.style.opacity = "1";
  requestAnimationFrame(frame);
  return label;
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
