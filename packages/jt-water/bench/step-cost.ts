// 60fps step-cost benchmark: 100 simultaneous motions + 8 live ripples,
// stepped at 1/60s with 100 sampled elements per frame (the realistic rAF
// workload: step + sample every attached element + ripple offsets).
// Budget: well under 1ms per frame.

import { surface } from "../src/surface.ts";

const N = 100;
const FRAMES = 6000;

function makeField() {
  const f = surface({ seed: 42 });
  for (let i = 0; i < N; i++) {
    if (i % 3 === 0) f.release(`m${i}`, i * 7, 400 + i);
    else f.glideTo(`m${i}`, i * 11, (i * 37) % 900);
  }
  for (let i = 0; i < 8; i++) f.disturb({ x: i * 90, y: i * 40 }, 24);
  return f;
}

// Warm-up for the JIT.
{
  const f = makeField();
  for (let i = 0; i < 2000; i++) {
    f.step(1 / 60);
    for (let j = 0; j < N; j++) f.sample(`m${j}`);
  }
}

const points = Array.from({ length: N }, (_, i) => ({ x: (i * 13) % 800, y: (i * 29) % 600 }));
let sink = 0;
const times: number[] = [];
let f = makeField();
for (let frame = 0; frame < FRAMES; frame++) {
  // Refresh the field periodically so motions stay live (finished ones retire).
  if (frame % 60 === 0) f = makeField();
  const t0 = performance.now();
  f.step(1 / 60);
  for (let j = 0; j < N; j++) {
    const s = f.sample(`m${j}`);
    if (s) sink += s.x;
    const o = f.rippleOffset(points[j]!);
    sink += o.x + o.y;
  }
  times.push(performance.now() - t0);
}

times.sort((a, b) => a - b);
const sum = times.reduce((a, b) => a + b, 0);
const pct = (p: number) => times[Math.min(times.length - 1, Math.floor((p / 100) * times.length))]!;
console.log(`jt-water step-cost benchmark`);
console.log(`workload: ${N} motions + 8 ripples; step + ${N} samples + ${N} ripple offsets per frame`);
console.log(`frames:   ${FRAMES}`);
console.log(`mean:     ${(sum / times.length).toFixed(4)} ms/frame`);
console.log(`p50:      ${pct(50).toFixed(4)} ms/frame`);
console.log(`p95:      ${pct(95).toFixed(4)} ms/frame`);
console.log(`p99:      ${pct(99).toFixed(4)} ms/frame`);
console.log(`max:      ${times[times.length - 1]!.toFixed(4)} ms/frame`);
console.log(`budget:   1.0000 ms/frame — ${pct(99) < 1 ? "PASS (p99 under budget)" : "FAIL"}`);
console.log(`(sink=${sink.toFixed(2)} to defeat dead-code elimination)`);
if (pct(99) >= 1) process.exit(1);
