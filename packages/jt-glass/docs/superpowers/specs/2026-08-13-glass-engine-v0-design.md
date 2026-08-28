# jt glass engine v0 design

## Purpose

jt glass makes the machine's work visible in the same surface for a person using jt
and a person building it. It is a standalone, zero-network package. The jt-web
integration is supplied as a patch and jt-web itself remains unchanged.

## Contract

`src/tap.ts` owns one versioned discriminated union. Every event has an id, session
id, sequence number, and ISO time. The event kinds are `transcriptEvent`,
`segmentationDecision`, `matchScores`, `intentResult`, `actCommitted`,
`recordWritten`, and `latencyMark`.

The tap accepts typed events, rejects malformed input at a JSON boundary, orders
events by sequence, allows subscribers, and records JSONL. The host only imports a
singleton emitter and calls it at existing decision boundaries.

## State and replay

A pure reducer turns an ordered event list into `GlassState`. Replay parses a JSONL
fixture, applies an inclusive sequence cursor, and always derives state from the
start. Expected outcomes are stable JSON. The diff engine reports exact paths,
expected values, and actual values; it never hides extra or missing data.

Live recording subscribes to the same tap, starts with an empty buffer, and exports
validated JSONL. A failed line names its line number and reason.

## Panels

Framework-free custom elements render one shared state:

- Live words: final and still-changing text, colored by reading, command, or
  unresolved segmentation.
- Match view: one strip per document block, score intensity, and a pinned exact span.
- Decision log: short explanations derived from event evidence and thresholds, such
  as “Asked because two passages scored within 0.04.”
- Saved record: raw JSON plus valid, invalid, or unchecked schema state and plain
  validation details.
- Timing: measured duration beside its budget, with clear within-budget and over-
  budget states.
- Replay Lab: file inputs, play/pause, step controls, scrubber, expected-outcome
  input, diff list, recording controls, and JSONL export.

The demo uses a bundled session and expected outcome, starts locally without any
request to another service, works from phone to wide desktop, exposes visible focus,
and respects reduced motion.

## Visual direction

The page is an instrument trace, not an admin dashboard. Colors are paper `#f7f6f2`,
graphite `#1d2428`, cobalt `#2855d9`, amber `#c97700`, signal red `#bd2c2c`, and calm
green `#277a58`. System humanist type handles explanations; system monospace handles
scores and raw data. A single horizontal replay line is the signature: scrubbing it
updates every panel at once.

## Integration boundary

`patches/jt-web-tap.patch` is generated against jt-web `main` at
`7da8e677ddd7851b3f7f2cd9d35bf399a364cb7f`. It adds the package dependency, a tiny
emit bridge, calls at transcript/match/intent/act/write/timing boundaries, and a
development-only `#/glass` mount. Production routing remains unchanged. The patch
must pass `git -C /Users/apple/projects/jt-web apply --check` without changing that
repository.

## Verification

Node tests cover contract acceptance and rejection, deterministic replay, and a
mutation that produces a diff. DOM rendering is kept thin over the pure reducer.
The build must finish with no runtime dependencies; the built demo is inspected in
a local browser; banned interface terms are scanned; and the jt-web patch is checked
against its pinned main tree.
