# order S1-WEB — the functional jt web app

Sprint: 1.5h. Mission: a person opens their own document, speaks, and the
thing they meant happens — with an inspectable, undoable record. Voice is the
substrate: one mic permission, then speaking is the interface.

## Scope shipped

1. **Document ingestion** — paste text, drag-drop .txt/.md, file picker;
   parsed into paragraph blocks; documents persisted in IndexedDB with a
   library panel to reopen any of them.
2. **Continuous voice** — `webkitSpeechRecognition`, continuous + interim,
   auto-restart on silence; rolling transcript matched live against the open
   document by the vendored fuzzy two-anchor matcher (`src/match.js`, taken
   from jt-demo-voice-highlight); the highlight glides to the matched block
   with the demo's motion.
3. **Acts with records** — spoken cues (`highlight this`, `mark this
   important`, `note that …`, `undo`) and clicked undo each produce a
   schema-pure Cursor record and Receipt record conforming to
   `contracts/cursor.schema.json` / `contracts/receipt.schema.json`
   (vendored verbatim from `/Users/apple/projects/jt-contracts/schemas/`).
   Records persist in IndexedDB per document; effects re-apply on reload.
4. **Inspection + undo** — history panel lists every entry with evidence
   (words heard, text matched, match confidence, timestamp) and the full
   cursor + receipt JSON behind a disclosure; every act is undoable, and undo
   writes its own cursor + receipt pair referencing the reversed act.
5. **Simulation** — `?sim=1` replays a scripted transcript (with deliberate
   mishearings) through the exact live pipeline; `&fast=1` compresses time;
   a `#jt-report` DOM node serializes the outcome for headless assertion.

## Verify

```
cd /Users/apple/projects/jt-web
npm install
npm run build
npm test          # 9 tests: ajv schema validation, matcher/grammar, headless e2e
npm run dev       # open http://127.0.0.1:5173 in Chrome, allow mic once
                  # or append ?sim=1 for the micless replay
```

## Constraints honored

- Vanilla JS + Vite, matching the demo stack; matcher vendored, not rewritten.
- No remote created, no push — judge merges (branch `wo/s1-web`).
- Banned vocabulary absent from UI copy; schema wire names stay internal
  (the panel says "full record", never the schema nouns).
