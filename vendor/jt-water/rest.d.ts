import { type Medium } from "./medium.ts";
export interface RestSample {
    x: number;
    v: number;
    done: boolean;
}
export interface Rest {
    readonly restingPoint: number;
    readonly duration: number;
    at(t: number): RestSample;
}
export declare function comeToRest(velocity: number, m?: Medium, x0?: number): Rest;
