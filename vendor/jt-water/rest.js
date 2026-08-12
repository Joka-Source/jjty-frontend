// comeToRest(velocity, medium): release behavior. A body let go with
// velocity v0 and no restoring force sees pure viscous drag:
//
//   x'' = -mu x'   =>   v(t) = v0 e^(-mu t)
//                       x(t) = x0 + (v0 / mu)(1 - e^(-mu t))
//
// It coasts, decelerates smoothly, and stops at the predictable point
// x0 + v0/mu — an object released underwater, not a scroll flick.
import { WATER } from "./medium.js";
const V_EPSILON = 0.5; // units/s below which the body counts as at rest
export function comeToRest(velocity, m = WATER, x0 = 0) {
    const mu = m.drag * m.viscosity;
    const restingPoint = x0 + velocity / mu;
    const duration = Math.abs(velocity) <= V_EPSILON ? 0 : Math.log(Math.abs(velocity) / V_EPSILON) / mu;
    return Object.freeze({
        restingPoint,
        duration,
        at(t) {
            if (t <= 0)
                return { x: x0, v: velocity, done: duration === 0 };
            const e = Math.exp(-mu * t);
            const done = t >= duration;
            return {
                x: done ? restingPoint : x0 + (velocity / mu) * (1 - e),
                v: done ? 0 : velocity * e,
                done,
            };
        },
    });
}
