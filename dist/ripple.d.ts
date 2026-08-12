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
export declare function disturb(origin: Point, energy: number, config?: RippleConfig): Ripple;
