# Local recognition comparison

This experiment compares identical synthetic audio with JETT's four phrase hints
disabled and at boost 2. It measures finalized recognition and the actual intent
parser separately. It does not exercise document selection, saved actions,
physical microphones, accents, noise or long sessions.

On macOS, with Chrome and local English already available to the chosen origin:

```sh
node scripts/voice-benchmark-server.mjs ../runtime/voice-ab 4996
```

Open `http://127.0.0.1:4996` and press Run comparison. The server generates eight
Samantha WAV files silently with `say`, hashes them, and serves only those files,
the benchmark page and the protected result endpoint. Each sample runs once per
condition, alternating condition order. A single run is a smoke measurement,
not an accuracy estimate. Reload starts a new run; timestamped result files
preserve earlier receipts, while `results.json` points to the latest receipt.
The fifth argument sets the silence tail in milliseconds (default 3500); the
sixth selects `continuous` (the app's setting, default) or `single` recognition.
The decoded waveform includes explicit zero-valued samples for that tail. Merely
waiting after a source node ends is not equivalent: earlier native trials did
not detect the silence and only returned late hypotheses when forcibly stopped.
Stop timing, source-end and recognition-end events remain in the receipts.

Chrome can report local English as available at JETT's origin but downloadable at
a new origin. The harness never installs a model or falls back to remote speech.
To reuse the existing local app origin, start the server with that exact origin:

```sh
node scripts/voice-benchmark-server.mjs ../runtime/voice-ab 4996 http://127.0.0.1:5174
```

Temporarily copy generated `frame.html` into the local Vite source tree, open it
at that origin, and remove the temporary copy after testing. This page contains
only a frame hosting the harness; it does not load the application or modify its
storage. The frame disables microphone access through Permissions Policy. The
standalone server supplies the same restriction as a response header. The
harness refuses to start unless the browser reports microphone access disabled.
Only the configured loopback origin can send results with the current run token.

Audio feeds a Web Audio destination track, never the speaker destination.
Recognition uses `processLocally=true` and the explicit track argument to
[`SpeechRecognition.start(audioTrack)`](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/start).
The harness requires Chrome 135 or newer and the local recognition API. It closes
the context and ends generated tracks after trials. The `physicalMicCalls` counter
is supplementary instrumentation; the browser's enforced microphone policy is
the protection against implicit capture.

Score a receipt with:

```sh
node scripts/voice-benchmark-score.mjs ../runtime/voice-ab/results.json > ../runtime/voice-ab/score.json
```

Zero trials are reported as `no-data`, never a successful comparison. Interim
hypotheses and recognition errors cannot count as successful transcripts or
commands. Ordinary speech misrecognized as a command remains a reported risk.
Staged range commands handled in the application coordinator are outside this
parser-only scorer. No recordings or raw personal speech belong in the human
repository; this corpus contains only synthetic test phrases.
