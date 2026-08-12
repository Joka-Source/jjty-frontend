import { type Medium } from "./medium.ts";
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
export declare const REST_EPSILON = 0.05;
export declare function glide(from: number, to: number, m?: Medium): Glide;
