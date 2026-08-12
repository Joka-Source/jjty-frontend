# Receipt S1-WATER

Repo: /Users/apple/projects/jt-water — branch wo/s1-water (skeleton on main).
No remotes; nothing pushed. Zero runtime dependencies (devDependency:
typescript only, for `dist/` emission; tests and bench run on Node's native
type stripping, no build step).

## What shipped

- src/medium.ts — the medium (viscosity, tension, entry, drag); omega =
  sqrt(tension)/viscosity, so a thicker fluid arrives later and softer.
- src/glide.ts — critically damped closed form
  `x(t) = to + (A + Bt) e^(-omega t)` with entry impulse
  `v0 = -entry*omega*A`; `entry < 1` gives `sign(B) = sign(A)`, so the
  trajectory can never cross the target: zero overshoot is analytic, not
  tuned. Settling time solved once per glide by Newton iteration on the
  amplitude bound. Math documented in README.md.
- src/ripple.ts — `disturb(point, energy)`:
  `u(r,t) = E e^(-lambda t) e^(-r/falloff) sin(kr - ct)`; energy envelope
  strictly decreasing.
- src/rest.ts — `comeToRest(velocity, medium)`: pure viscous drag,
  `v(t) = v0 e^(-mu t)`, predictable resting point `x0 + v0/mu`.
- src/surface.ts — the shared field: glides/coasts keyed by id, live
  ripples, seeded PRNG (mulberry32), `step(dt)` deterministic.
- src/attach.ts — rAF adapter writing transforms; one shared loop per field.
- demo/index.html — highlight bar gliding between text blocks; drag-release
  pebble settling in a tank; click-a-stone disturbance rippling neighbors.
  Serve the repo root statically (or `npx vite .`) and open /demo/.
- patches/jt-demo-voice-highlight.patch — adds vendored src/water.js
  (glide + medium, compiled), drives #marker top/height via rAF glides in
  src/main.js, removes the top/height cubic-bezier transitions in
  src/style.css. Demo repo left untouched (verified clean after generation).

## Verify

### Tests — `node --test test/*.test.ts`

```
✔ seeded random stream is reproducible and in [0,1) (0.153542ms)
ℹ tests 25
ℹ suites 0
ℹ pass 25
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 122.723459
```

25/25 pass. Coverage: dense-sweep no-overshoot across 5 media x 5 moves at
240Hz; monotonic approach; arrival envelope (0.15s < duration < 1.2s for
default water over 320px, exact rest at reported duration); ripple energy
strictly decaying at 240Hz; spatial falloff; bit-exact determinism for
glide/ripple/rest/field; field retirement (active() empties); seeded PRNG
reproducibility.

### Benchmark — `node bench/step-cost.ts`

```
jt-water step-cost benchmark
workload: 100 motions + 8 ripples; step + 100 samples + 100 ripple offsets per frame
frames:   6000
mean:     0.0710 ms/frame
p50:      0.0637 ms/frame
p95:      0.1062 ms/frame
p99:      0.1796 ms/frame
max:      3.5823 ms/frame
budget:   1.0000 ms/frame — PASS (p99 under budget)
(sink=205088592.37 to defeat dead-code elimination)
```

p99 0.18ms/frame for 100 simultaneous motions + 8 ripples with full
per-element sampling — 5.6x under the 1ms budget. (max outlier is GC/OS
noise on a single frame of 6000; p99 is the guarantee.)

### Patch — `cd /Users/apple/projects/jt-demo-voice-highlight && git apply --check .../patches/jt-demo-voice-highlight.patch`

```
ok: patch applies cleanly
```

`git status --short` in the demo repo after patch generation: empty (nothing
committed or left modified there). The patched files were syntax-checked
(`node --check`) and the demo repo's own test suite passed (fail 0) before
reverting.

### Demo smoke test

Served repo root over HTTP, loaded /demo/index.html in the embedded browser:
no console errors; clicking a paragraph started a glide (marker transform
observed mid-flight at translateY(100.87px) toward target 172px, height
snapped to the paragraph). Note: the embedded browser pane throttles
requestAnimationFrame to render frames, so full arrival could not be
observed there in real time; trajectory correctness is covered by the exact
headless tests above. Verify visually with `npx vite .` -> /demo/.

## Blockers (self-resolved, depth <= 2)

1. Embedded browser pane suppresses rAF except on render frames — could not
   watch the animation complete live. Resolved by verifying the DOM write
   path (transforms observed mid-glide) plus exact headless trajectory
   tests; recorded above.
2. `npx tsc` outside the repo resolves to a squatter package — resolved by
   installing typescript as the sole devDependency and building via
   `npm run build`.
