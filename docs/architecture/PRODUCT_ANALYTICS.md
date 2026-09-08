# Product analytics

Founder policy, 8 September 2026: JETT product analytics is enabled by default,
including production, with a persistent opt-out in Settings → Command history.
This supersedes the earlier manual-export-only delivery plan. GStack's own
telemetry is unrelated and remains off.

`command-journal.js` records capture, heard-command, intent, target, result and
feedback stages. Each event has an immutable UUID. A saved result follows durable
action persistence; hearing or parsing speech never establishes success. Feedback
creates a new event rather than changing earlier events. The local journal keeps
200 commands, up to16 events each. Optional local recognized-word retention is
separate from default-on telemetry. Audio, recognized words, document text, file
names and arbitrary error strings are excluded from network events.

`product-analytics.js` enrolls new events automatically in all builds. It assigns
an anonymous UUID per application page session. No person profile is requested.
Simulation remains `source: sim` so it can be separated from physical input.
Previously stored history and commands during an opt-out window are not replayed
when analytics is enabled again. Already-enrolled events retry after reload.

`analytics-delivery.js` uses a persistent outbox, batches of50, stable event UUIDs,
a20-second request timeout and exponential retry capped at60seconds. HTTP failure
retains pending events. The outbox holds up to1000 events /2MB; full or unavailable
storage is reported rather than falsely claiming delivery. This is bounded
browser storage, not an unlimited offline archive. Web Locks serialize cross-tab
changes and sending; storage events propagate preference changes. Browsers without
Web Locks report unavailable coordination and do not send. Opt-out aborts pending
requests and clears pending events; it cannot retract events already received.

Configuration is explicit: copy `.env.example` into `.env.local` or set
`VITE_POSTHOG_HOST` and `VITE_POSTHOG_PROJECT_TOKEN` in the production build
environment. Use the real project's HTTPS ingest origin and public `phc_` project
token; the adapter constructs `/batch`. A private/personal API key is not needed.
Build-time Vite configuration requires rebuilding after changing these values.
No host is guessed. Without both values, analytics remains enabled and queues
events while Settings reports that the project is not configured.

The test receiver is loopback-only and uses a synthetic token. Its HTTP receipts
prove request contents and retry behavior, not receipt by a real PostHog project.
Production ingestion requires the actual configuration, deployment and project
readback. No hosted-project configuration or production receipt exists yet.

PostHog batch contract reference: https://posthog.com/docs/api/capture.
