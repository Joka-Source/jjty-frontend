# jt-water

jt's interaction physics. Not a visual theme: the way things move, glide,
come to rest, and resist. A shared behavior module for the web app, the demo,
and eventually Android.

Zero runtime dependencies. Deterministic, time-stepped, pure functions of
`(state, dt)` — the same inputs always produce the same trajectory, so tests
are exact and headless.

## The model

Standard UI easing (cubic-bezier) is a shape drawn by hand. jt-water instead
simulates motion through a viscous medium and lets the trajectory fall out of
the physics.

### glide — critically damped motion through a viscous medium

A body pulled toward a target by tension and resisted by viscous drag obeys

    x'' = -omega^2 (x - target) - 2 zeta omega x'

At critical damping (`zeta = 1`) the closed-form solution is

    x(t) = target + (A + B t) e^(-omega t)
    A = x0 - target
    B = v0 + omega (x0 - target)

Critical damping is the fastest approach that can avoid oscillation. To get
water's signature — fast entry, drag, gentle arrival — we inject an entry
impulse toward the target: `v0 = -entry * omega * (x0 - target)` with
`entry < 1`. The trajectory crosses the target only if `B` and `A` have
opposite signs, i.e. only if `entry > 1`, so `entry < 1` **guarantees zero
overshoot** analytically (proof: `x(t) - target = (A + Bt)e^(-omega t)` has a
zero at `t = -A/B > 0` iff `sign(B) != sign(A)`; with
`B = (1 - entry) * omega * A`, `sign(B) = sign(A)` whenever `entry < 1`).

`omega` is derived from the medium: `omega = sqrt(tension / mass)` scaled by
viscosity, so a thicker medium arrives later and softer.

### disturb — decaying ripple

A disturbance at a point radiates influence

    u(r, t) = E e^(-lambda t) e^(-r / falloff) sin(k r - c t)

`E e^(-lambda t)` is the ripple's energy envelope — strictly decreasing in t,
which tests assert. The spatial term is a damped travelling wave: elements
near the point are offset, farther elements less and later.

### comeToRest — release into the medium

A released body with velocity `v0` and no restoring force sees pure viscous
drag `x'' = -mu x'`, giving

    v(t) = v0 e^(-mu t)
    x(t) = x0 + (v0 / mu)(1 - e^(-mu t))

It coasts, decelerates smoothly, and stops at a predictable point
`x0 + v0/mu` — an object released underwater, not a scroll-flick.

## API

```ts
import { surface, glide, disturb, comeToRest, step, attach } from "jt-water";

const field = surface({ viscosity: 1, tension: 170, seed: 42 });
const g = glide(0, 320, field.medium);        // sample: g.at(t) -> {x, v, done}
const r = disturb({ x: 100, y: 40 }, 24);     // r.at(point, t) -> offset
const c = comeToRest(900, field.medium);      // c.at(t) -> {x, v, done}
```

All samplers are pure closed-form functions of time — no accumulated error,
no hidden state. `step(fieldState, dt)` advances a whole field of motions
deterministically for the rAF adapter.

## Verify

```sh
npm install        # dev-only: typescript
npm test           # node --test, no build needed (type stripping)
npm run bench      # step-cost benchmark, 100 concurrent motions
npm run build      # emit dist/ for the browser demo
npx vite demo      # demo page
```
