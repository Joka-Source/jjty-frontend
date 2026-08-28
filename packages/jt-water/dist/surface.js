// surface(): a motion field — the shared body of water a set of elements
// move through. Holds the medium, active glides/coasts keyed by id, and
// live ripples. step(state, dt) advances the whole field deterministically:
// pure function of (state, dt); same seed + same steps => identical states.
import { medium } from "./medium.js";
import { glide } from "./glide.js";
import { comeToRest } from "./rest.js";
import { disturb } from "./ripple.js";
import { prng } from "./prng.js";
export function surface(config = {}) {
    const m = medium(config);
    const random = prng(config.seed ?? 1);
    let now = 0;
    const motions = new Map();
    const ripples = [];
    return {
        medium: m,
        random,
        time: () => now,
        step(dt) {
            if (!(dt >= 0))
                throw new RangeError("dt must be >= 0");
            now += dt;
            // Retire finished motions and spent ripples so cost tracks live work.
            for (const [id, mo] of motions) {
                if (mo.sampler.at(now - mo.startedAt).done)
                    motions.delete(id);
            }
            for (let i = ripples.length - 1; i >= 0; i--) {
                const r = ripples[i];
                if (r.ripple.spent(now - r.startedAt))
                    ripples.splice(i, 1);
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
            if (!mo)
                return null;
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
            const out = [];
            for (const [id, mo] of motions) {
                if (!mo.sampler.at(now - mo.startedAt).done)
                    out.push(id);
            }
            return out;
        },
    };
}
