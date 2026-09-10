# Draft and delivery interaction lab

An original, runnable learning implementation derived from the Slack study’s reliability lessons. It does not contain Slack source code or private Slack content, and it is not a production identity or collaboration service.

![Synthetic draft and delivery lab](screenshot.png)

## Run

Requires Node 22.5 or newer for `node:sqlite`; the verified development runtime is Node 26.7.0.

```sh
npm run lab:drafts
```

Open the printed loopback URL. Choose Alex in one private browser context and Sam in another. The database defaults to `.local/draft-delivery.sqlite`; override it with `JETT_LAB_DATABASE=/absolute/path.sqlite`.

## Journeys to inspect

1. Type a draft and reload. SQLite restores that participant’s draft.
2. Enable **Simulate a lost server response once**, append, then retry. The client reuses the operation ID and the timeline contains exactly one entry.
3. Open both personas before either writes. Let one append, then let the stale persona append. The server returns revision conflict and preserves the stale participant’s draft for review.
4. Follow the implementation links in the dark proof panel to read the exact store, HTTP and client modules in the browser.

## Verified behavior

- WAL-backed SQLite drafts and accepted entries survive close/reopen.
- Append and exact-draft clearing share one `BEGIN IMMEDIATE` transaction.
- Operation IDs are participant-scoped and payload-bound; retry returns the original response and different content fails closed.
- Fixture sessions use random cookies and CSRF tokens; mutation requires same origin.
- A participant receives `404` for another participant’s private note.
- Request and text limits fail closed.
- A real headless Chrome journey covers lost response, idempotent retry, conflict, reload and draft recovery.
- axe-core reports zero automated violations at 1280×800 and 375×760.

Run the bounded suite:

```sh
npm run test:lab:drafts
```

The lab uses two hard-coded fixture identities. It does not prove production account authentication, authorization policy, multi-instance coordination, encryption, backup restoration or release readiness.
