# Voice capture boundary

`src/voice-capture.js` owns the browser recognizer lifecycle. It accepts the
recognizer constructor, language provider, lifecycle callback and transcript
callbacks. The reader supplies its existing interim matcher and serialized
final-segment pipeline; capture does not own document mutation.

One requested session owns at most one recognizer. Cancellation increments the
session generation, clears a scheduled restart and aborts the recognizer.
Callbacks must still match both the generation and recognizer identity before
reaching the reader. A pending start can be cancelled using the same toggle.
Listening is reported after the recognizer's start event, rather than optimistically.

Natural ends, silence and network interruptions permit three delayed restarts
(500, 1000 and 2000 milliseconds). A useful transcript resets the retry budget;
start events alone do not. Permission, device and other terminal errors release
ownership and require an explicit retry. No second permission-check audio stream
is opened. Page exit pauses active capture, including the state retained for a
cached page return.

The current adapter uses the browser speech API. Its default browser mode
can use a network speech service. Explicit local mode, described below, requires
on-device processing. Either mode can end recognition independently, so neither
guarantees uninterrupted recording. Future native/WASM adapters must also declare
processing location and availability, without silently switching remotely. Public-source and recovered prototype research is in the parent
workspace's VOICE_CAPTURE_RESEARCH.md.

The tests inject recognizer events to verify races, retries, stale transcripts,
actual application controls and lifecycle cancellation. They do not establish
physical audio continuity, recognition accuracy or OS microphone indicator timing.

## On-device option

Settings now persists `voiceProcessing` as `browser` or `local`. Existing users
retain browser mode, with explicit disclosure that the browser may use a remote
speech service. The on-device option requires `SpeechRecognition.available`
for the selected locale to return `available`, and a recognizer that accepts
`processLocally = true`. A missing capability, missing pack, rejected query or
unsupported language leaves capture off. No automatic fallback or installation
occurs. Mode and language are captured once for the session and retained through
restarts; changing either in settings pauses the previous session.

The language check and download are explicit controls. Installation begins
inside its button's click activation, before any awaited work. Async check and
install results are fenced from later settings changes. Download completion is
followed by a fresh availability check, not treated as proof of audio recognition.
A browser may continue an already requested asset download after a mode change;
JETT ignores its stale result and does not start a microphone.

Private Chrome152 capability probing reported en-US/en-IN as downloadable. This
establishes API availability, not installed assets or successful local audio.
The raw probe is in the parent `jett-local-speech-capability.json` artifact.

## Real engine proof with generated audio

On this Mac, with the development app at localhost5174:

```sh
node scripts/generate-speech-fixture.mjs
node scripts/verify-local-speech.mjs --direct-track
```

The generator uses installed macOS Samantha speech and ffmpeg, producing a known
16kHz mono PCM WAV. The verifier uses a dedicated Chrome profile under the parent
runtime/local-speech-proof directory, requests language installation through the
explicit app control if needed, and supplies only a generated Web Audio stream
at the application's acquireAudio boundary. It never supplies a transcript or calls JETT's
text-injection helpers. Real local recognition drives the actual matcher, command
parser and IndexedDB action path. Page networking uses CDP offline emulation during recognition; this is not
OS-wide isolation of every Chrome service. The observed recognizer explicitly
reports processLocally=true, and the proof requires a real final command event.
The proof checks exactly one voice highlight of the expected quote, its receipt,
visible cursor, recovery after reload and UI undo. Profile and downloaded speech
assets are retained for repeatability; they are separate from the user's browser.

PASS_LOCAL_SYNTHETIC observed on Chrome152.0.7977.82: full orchard passage
recognized, exactly one intended voice highlight saved, recovered and undone.
Evidence is parent jett-local-speech-verified.log, runtime/local-speech-proof/
app-track-result.json and recognized-highlight.png. This proves real local-configured ASR
and downstream behavior for one generated English utterance. It does not prove
physical microphone continuity, accent/noise performance or all language support.

Before owned-stream capture, the default verifier exercised native
recognition.start() with fake input flags, including --disable-audio-input. That
route reported no-speech and did not establish device acceptance. The verifier
now exercises acquireAudio and production start(track) in both input modes. The earlier fake-media-device-only
attempt did not establish its intended native input routing and is excluded from
acceptance evidence. The isolated direct-track diagnostic is available through
scripts/diagnose-local-speech-track.mjs. Do not remove this distinction to claim
native device acceptance from a passing generated-track result.

## Owned on-device capture stream

On-device mode now requests one audio-only MediaStream after its language and
local-recognition capability checks pass. The recognizer consumes that track
through start(track). A recognition restart keeps the existing track, rather
than reopening the microphone. Device-ended events stop the session. Pause,
terminal errors and page exit abort the recognizer, cancel recovery, detach the
ended listener and stop all owned tracks. Browser-service mode retains its
browser-managed capture and does not create a second microphone stream.

A pending native getUserMedia permission request cannot necessarily be cancelled
by an AbortSignal. Session generations therefore reject a late resolution and
immediately stop its tracks; it cannot revive the cancelled recognizer or affect
a newer session. No fallback to native start() occurs if the local track is
invalid or start(track) fails.

The generated-audio verifier now supplies the fixture at acquireAudio's stream
boundary and leaves recognition.start(track) entirely in production code. It
checks one acquisition and an ended track after pause in addition to recognition,
receipt, original custody and undo. This strengthens capture ownership evidence
while retaining the physical-device and machine-wide network-isolation limits.
