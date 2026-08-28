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
export declare const WATER: Medium;
export declare function medium(config?: MediumConfig): Medium;
/**
 * Natural frequency of the medium: omega = sqrt(tension) / viscosity.
 * Thicker fluid -> lower omega -> later, softer arrival.
 */
export declare function omegaOf(m: Medium): number;
