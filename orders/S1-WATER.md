# Order S1-WATER

Sprint: 1.5h. Founder ruling: water is integral to jt v1 — as interaction
PHYSICS, not decoration. The way things move, glide, come to rest, and
resist. A shared behavior module for the web app, the demo, and eventually
Android.

## Scope

1. Physics core (TypeScript, zero runtime deps, framework-agnostic,
   deterministic, time-stepped, pure functions of (state, dt)):
   - `surface()` — motion field with configurable viscosity/tension
   - `glide(from, to, medium)` — critically damped motion through a viscous
     medium (fast entry, drag, gentle arrival; NOT cubic-bezier; math
     documented in README)
   - `disturb(point, energy)` — decaying ripple influence for offsetting
     nearby elements
   - `comeToRest(velocity, medium)` — release/settling behavior
2. Behavioral guarantees as tests: no overshoot beyond epsilon; arrival
   within a duration envelope; ripple energy strictly decaying; determinism;
   60fps step-cost benchmark (well under 1ms/step for 100 motions).
3. Browser binding: `attach(element, field)` mapping trajectories to
   transform updates via rAF; self-contained demo/index.html with a gliding
   highlight bar, drag-release settling, and a rippling disturbance.
4. Integration patch: patches/jt-demo-voice-highlight.patch replacing the
   demo repo's CSS-transition highlight motion with jt-water's glide.
   Not committed into the demo repo; verified with `git apply --check`.

## Constraints

- New repo /Users/apple/projects/jt-water; skeleton on main; work on
  wo/s1-water; no remotes, no pushes.
- Package name jt-water. Physical API vocabulary (glide, ripple, rest,
  medium, viscosity) is engineering-internal. Banned in user-facing copy:
  Margin as a name, locus, settle/recede/receipt as UI nouns,
  sea/drops/shells as product nouns, QR anything.
- Proof of work: this order + receipts/S1-WATER.md with verify commands and
  verbatim output. Self-resolve blockers to depth 2, then record and ship.
