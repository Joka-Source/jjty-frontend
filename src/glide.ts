// glide(from, to, medium): critically damped motion through a viscous medium.
//
// Equation of motion:  x'' = -omega^2 (x - to) - 2 omega x'   (zeta = 1)
// Closed form:         x(t) = to + (A + B t) e^(-omega t)
//                      A = from - to
//                      B = v0 + omega A,   v0 = -entry * omega * A
//                   => B = (1 - entry) * omega * A
//
// sign(B) == sign(A) because 0 < entry < 1, so (A + B t) never crosses zero
// for t > 0: the trajectory approaches `to` monotonically after its single
// velocity peak — fast entry, viscous drag, gentle arrival, zero overshoot.

import { type Medium, WATER, omegaOf } from "./medium.ts";

export interface GlideSample {
  x: number;
  v: number;
  done: boolean;
}

export interface Glide {
  readonly from: number;
  readonly to: number;
  readonly omega: number;
  /** Time in seconds after which |x - to| < restEpsilon and |v| < restEpsilon * omega. */
  readonly duration: number;
  /** Sample the trajectory at time t (seconds). Pure; exact; no state. */
  at(t: number): GlideSample;
}

/** Below this distance-from-target (in the caller's units) a glide is at rest. */
export const REST_EPSILON = 0.05;

/**
 * Solve for the settling time: the trajectory is |A + Bt| e^(-omega t).
 * We bound it by (|A| + |B| t) e^(-omega t) and step a closed-form Newton
 * iteration; cheap, done once per glide, never per frame.
 */
function settlingTime(A: number, B: number, omega: number, eps: number): number {
  if (Math.abs(A) < eps) return 0;
  const a = Math.abs(A);
  const b = Math.abs(B);
  // f(t) = (a + b t) e^(-omega t) - eps ; f is eventually decreasing.
  let t = Math.log(Math.max(a / eps, Math.E)) / omega; // decent seed
  for (let i = 0; i < 40; i++) {
    const e = Math.exp(-omega * t);
    const f = (a + b * t) * e - eps;
    const df = (b - omega * (a + b * t)) * e;
    if (df >= 0) {
      t += 1 / omega; // still before the peak of the bound; move right
      continue;
    }
    const next = t - f / df;
    if (!Number.isFinite(next) || next < 0) break;
    if (Math.abs(next - t) < 1e-6) return next;
    t = next;
  }
  return t;
}

export function glide(from: number, to: number, m: Medium = WATER): Glide {
  const omega = omegaOf(m);
  const A = from - to;
  const B = (1 - m.entry) * omega * A; // v0 = -entry * omega * A folded in
  const duration = settlingTime(A, B, omega, REST_EPSILON);
  return Object.freeze({
    from,
    to,
    omega,
    duration,
    at(t: number): GlideSample {
      if (t <= 0) return { x: from, v: -m.entry * omega * A, done: A === 0 };
      const e = Math.exp(-omega * t);
      const x = to + (A + B * t) * e;
      const v = (B - omega * (A + B * t)) * e;
      const done = t >= duration;
      return { x: done ? to : x, v: done ? 0 : v, done };
    },
  });
}
