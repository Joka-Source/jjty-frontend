// disturb(point, energy): a decaying ripple influence.
//
// u(r, t) = E e^(-lambda t) e^(-r / falloff) sin(k r - c t)
//
// The energy envelope E(t) = E e^(-lambda t) is strictly decreasing — the
// water always calms. The spatial term is a damped travelling wave: nearby
// elements are offset most, farther ones less and later.
const DEFAULTS = { lambda: 3.2, falloff: 140, k: 0.05, c: 11 };
export function disturb(origin, energy, config = {}) {
    const { lambda, falloff, k, c } = { ...DEFAULTS, ...config };
    if (energy < 0)
        throw new RangeError("energy must be >= 0");
    if (lambda <= 0)
        throw new RangeError("lambda must be > 0");
    const o = { x: origin.x, y: origin.y };
    const energyAt = (t) => energy * Math.exp(-lambda * Math.max(0, t));
    const at = (p, t) => {
        if (t < 0)
            return 0;
        const r = Math.hypot(p.x - o.x, p.y - o.y);
        return energyAt(t) * Math.exp(-r / falloff) * Math.sin(k * r - c * t);
    };
    return Object.freeze({
        origin: Object.freeze(o),
        energy,
        energyAt,
        at,
        offset(p, t) {
            const dx = p.x - o.x;
            const dy = p.y - o.y;
            const r = Math.hypot(dx, dy);
            const u = at(p, t);
            if (r === 0)
                return { x: 0, y: u }; // at the origin, heave straight up
            return { x: (dx / r) * u, y: (dy / r) * u };
        },
        spent(t, eps = energy * 1e-3) {
            return energyAt(t) <= eps;
        },
    });
}
