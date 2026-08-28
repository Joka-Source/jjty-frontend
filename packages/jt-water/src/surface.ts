// surface(): a motion field — the shared body of water a set of elements
// move through. Holds the medium, active glides/coasts keyed by id, and
// live ripples. step(state, dt) advances the whole field deterministically:
// pure function of (state, dt); same seed + same steps => identical states.

import { type Medium, type MediumConfig, medium } from "./medium.ts";
import { type Glide, glide } from "./glide.ts";
import { type Rest, comeToRest } from "./rest.ts";
import { type Point, type Ripple, type RippleConfig, disturb } from "./ripple.ts";
import { type Prng, prng } from "./prng.ts";

export interface SurfaceConfig extends MediumConfig {
  seed?: number;
}

interface Motion {
  kind: "glide" | "coast";
  startedAt: number; // field time when the motion began
  sampler: Glide | Rest;
  axis: "x" | "y";
}

interface LiveRipple {
  startedAt: number;
  ripple: Ripple;
}

export interface FieldSample {
  x: number;
  v: number;
  done: boolean;
}

export interface Surface {
  readonly medium: Medium;
  readonly random: Prng;
  /** Field clock in seconds. Advanced only by step(). */
  time(): number;
  /** Advance the field. Pure of external state: only (internal state, dt). */
  step(dt: number): void;
  /** Start a glide for element `id` along one axis. Replaces any prior motion. */
  glideTo(id: string, from: number, to: number, axis?: "x" | "y"): Glide;
  /** Release element `id` with a velocity; it coasts to rest in the medium. */
  release(id: string, position: number, velocity: number, axis?: "x" | "y"): Rest;
  /** Drop a disturbance into the field. */
  disturb(point: Point, energy: number, config?: RippleConfig): Ripple;
  /** Current sample for element `id`, or null if it has no motion. */
  sample(id: string): FieldSample | null;
  /** Total ripple displacement at a point right now (all live ripples summed). */
  rippleOffset(p: Point): Point;
  /** Ids with unfinished motions (a field at rest returns []). */
  active(): string[];
}

export function surface(config: SurfaceConfig = {}): Surface {
  const m = medium(config);
  const random = prng(config.seed ?? 1);
  let now = 0;
  const motions = new Map<string, Motion>();
  const ripples: LiveRipple[] = [];

  return {
    medium: m,
    random,
    time: () => now,
    step(dt: number) {
      if (!(dt >= 0)) throw new RangeError("dt must be >= 0");
      now += dt;
      // Retire finished motions and spent ripples so cost tracks live work.
      for (const [id, mo] of motions) {
        if (mo.sampler.at(now - mo.startedAt).done) motions.delete(id);
      }
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i]!;
        if (r.ripple.spent(now - r.startedAt)) ripples.splice(i, 1);
      }
    },
    glideTo(id, from, to, axis = "y") {
      const g = glide(from, to, m);
      motions.set(id, { kind: "glide", startedAt: now, sampler: g, axis });
      return g;
    },
    release(id, position, velocity, axis = "y") {
      const r = comeToRest(velocity, m, position);
      motions.set(id, { kind: "coast", startedAt: now, sampler: r, axis });
      return r;
    },
    disturb(point, energy, config) {
      const r = disturb(point, energy, config);
      ripples.push({ startedAt: now, ripple: r });
      return r;
    },
    sample(id) {
      const mo = motions.get(id);
      if (!mo) return null;
      return mo.sampler.at(now - mo.startedAt);
    },
    rippleOffset(p) {
      let x = 0;
      let y = 0;
      for (const r of ripples) {
        const o = r.ripple.offset(p, now - r.startedAt);
        x += o.x;
        y += o.y;
      }
      return { x, y };
    },
    active() {
      const out: string[] = [];
      for (const [id, mo] of motions) {
        if (!mo.sampler.at(now - mo.startedAt).done) out.push(id);
      }
      return out;
    },
  };
}
