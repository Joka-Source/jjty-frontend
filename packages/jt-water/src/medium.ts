// The medium: the fluid every jt motion happens inside.
// viscosity thickens the fluid (slower, softer arrivals);
// tension is the pull toward targets (springiness of the field).

export interface Medium {
  /** Relative thickness of the fluid. 1 = jt default water. >1 = thicker. */
  readonly viscosity: number;
  /** Restoring pull toward targets, in 1/s^2 (spring constant over unit mass). */
  readonly tension: number;
  /**
   * Entry impulse factor for glides, 0..1 exclusive. Fraction of the
   * critical velocity injected toward the target at t=0. Values < 1
   * analytically guarantee zero overshoot (see README).
   */
  readonly entry: number;
  /** Viscous drag coefficient for free coasting (comeToRest), in 1/s. */
  readonly drag: number;
}

export interface MediumConfig {
  viscosity?: number;
  tension?: number;
  entry?: number;
  drag?: number;
}

/** jt default water. */
export const WATER: Medium = Object.freeze({
  viscosity: 1,
  tension: 170,
  entry: 0.85,
  drag: 6,
});

export function medium(config: MediumConfig = {}): Medium {
  const viscosity = config.viscosity ?? WATER.viscosity;
  const tension = config.tension ?? WATER.tension;
  const entry = config.entry ?? WATER.entry;
  const drag = config.drag ?? WATER.drag;
  if (viscosity <= 0) throw new RangeError("viscosity must be > 0");
  if (tension <= 0) throw new RangeError("tension must be > 0");
  if (entry <= 0 || entry >= 1) {
    throw new RangeError("entry must be in (0, 1) — entry >= 1 can overshoot");
  }
  if (drag <= 0) throw new RangeError("drag must be > 0");
  return Object.freeze({ viscosity, tension, entry, drag });
}

/**
 * Natural frequency of the medium: omega = sqrt(tension) / viscosity.
 * Thicker fluid -> lower omega -> later, softer arrival.
 */
export function omegaOf(m: Medium): number {
  return Math.sqrt(m.tension) / m.viscosity;
}
