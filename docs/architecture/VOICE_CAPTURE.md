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

The current adapter is browser-managed speech. It does not promise on-device
transcription or uninterrupted recording: a browser can use a network speech
service and end recognition independently. A future local adapter must declare
its processing location and availability; it must not silently switch to remote
processing. Public-source and recovered prototype research is in the parent
workspace's VOICE_CAPTURE_RESEARCH.md.

The tests inject recognizer events to verify races, retries, stale transcripts,
actual application controls and lifecycle cancellation. They do not establish
physical audio continuity, recognition accuracy or OS microphone indicator timing.
