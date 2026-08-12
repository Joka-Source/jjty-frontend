// disturb(point, energy): a decaying ripple influence.
//
// u(r, t) = E e^(-lambda t) e^(-r / falloff) sin(k r - c t)
//
// The energy envelope E(t) = E e^(-lambda t) is strictly decreasing — the
// water always calms. The spatial term is a damped travelling wave: nearby
// elements are offset most, farther ones less and later.

export interface Point {
  x: number;
  y: number;
}

export interface RippleConfig {
  /** Energy decay rate, 1/s. Higher = calms faster. */
  lambda?: number;
  /** Spatial falloff distance in px. */
  falloff?: number;
  /** Wave number, radians per px. */
  k?: number;
  /** Phase speed, radians per second. */
  c?: number;
}

export interface Ripple {
  readonly origin: Point;
  readonly energy: number;
  /** Remaining energy at time t — strictly decreasing. */
  energyAt(t: number): number;
  /** Scalar influence at a point, time t. Offset elements by this along (p - origin). */
  at(p: Point, t: number): number;
  /** 2-D displacement of p at time t: influence directed radially outward. */
  offset(p: Point, t: number): Point;
  /** True once energy has decayed below `eps` (default 1e-3 of initial). */
  spent(t: number, eps?: number): boolean;
}

const DEFAULTS = { lambda: 3.2, falloff: 140, k: 0.05, c: 11 };

export function disturb(origin: Point, energy: number, config: RippleConfig = {}): Ripple {
  const { lambda, falloff, k, c } = { ...DEFAULTS, ...config };
  if (energy < 0) throw new RangeError("energy must be >= 0");
  if (lambda <= 0) throw new RangeError("lambda must be > 0");
  const o = { x: origin.x, y: origin.y };
  const energyAt = (t: number) => energy * Math.exp(-lambda * Math.max(0, t));
  const at = (p: Point, t: number): number => {
    if (t < 0) return 0;
    const r = Math.hypot(p.x - o.x, p.y - o.y);
    return energyAt(t) * Math.exp(-r / falloff) * Math.sin(k * r - c * t);
  };
  return Object.freeze({
    origin: Object.freeze(o),
    energy,
    energyAt,
    at,
    offset(p: Point, t: number): Point {
      const dx = p.x - o.x;
      const dy = p.y - o.y;
      const r = Math.hypot(dx, dy);
      const u = at(p, t);
      if (r === 0) return { x: 0, y: u }; // at the origin, heave straight up
      return { x: (dx / r) * u, y: (dy / r) * u };
    },
    spent(t: number, eps = energy * 1e-3): boolean {
      return energyAt(t) <= eps;
    },
  });
}
