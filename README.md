Current engineering handoff: [architecture and contributor tree](https://github.com/Joka-Source/jjty-human/blob/codex/founder-ssot-workbench/ARCHITECTURE.md) · [team pickup and pause](https://github.com/Joka-Source/jjty-human/blob/codex/founder-ssot-workbench/TEAM_HANDOFF.md).

> Current founder synthesis: [JETT SSOT](https://github.com/Joka-Source/jjty-human/blob/codex/founder-ssot-workbench/JETT_SSOT.md) is the shared entry point for current product direction and cross-repository status. Repository-specific engineering contracts, build instructions, and verification requirements remain below.

# jt-web

jt on the web: open your document, speak, and the thing you meant happens — with an inspectable, undoable record.

- `npm install`
- `npm run dev` — open in Chrome, allow the mic once
- append `?sim=1` for a micless scripted replay (`&fast=1` for CI speed)
- `npm test` — schema validation + unit tests + headless end-to-ends
  (sim replay and two-device moment transport)

What's fused in (see `vendor/`, one directory per sibling repo):

- **jt-speech** — spoken words become typed intents; when a phrase could
  mean two things, jt asks ("did you mean…") instead of guessing
- **jt-connectors** — text, markdown, paste, and PDF enter as blocks with
  provenance (sha-256 digest, byte size) shown in the library
- **jt-water** — the marker glides and acts confirm with real physics,
  not CSS transitions
- **jt-core** — the wasm kernel is the default matching engine
  (`?engine=js` opts back into the reference matcher; parity is proven
  bit-identical in `test/parity.test.mjs`)
- **jt-sync** — "send this to <three words>" moves a kept act to another
  device as a full moment, hash-verified on arrival (relay:
  `npm run relay` in jt-sync; point the app at it with `?relay=ws://…`)

Spaces are **PROVISIONAL**. A person can send any kept act or arrived moment
to a space they belong to, inspect its arrival-ordered local feed, and keep an
excerpt as a document with the source moment intact. Say "send this to
<space name>" for fuzzy voice routing; close names always require a choice.
Space feeds stay on this device until cross-device space sync arrives with the
relay.

Records conform to the schemas vendored in `contracts/` (from jt-contracts).
