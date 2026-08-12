import { type Medium, type MediumConfig } from "./medium.ts";
import { type Glide } from "./glide.ts";
import { type Rest } from "./rest.ts";
import { type Point, type Ripple, type RippleConfig } from "./ripple.ts";
import { type Prng } from "./prng.ts";
export interface SurfaceConfig extends MediumConfig {
    seed?: number;
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
export declare function surface(config?: SurfaceConfig): Surface;
