# order B4-RETURN — reading continuity

Branch `blitz/b4-return`, starting from `main` at
`44ca6f7e570a478c21078d3a24ee0e0f9c1bab95` (44/44 tests).

## Fixed product decision

Reading position belongs to a document, not to the open tab or current
session. jt keeps the last block a person deliberately tapped or the matcher
last followed. Opening a document with a remembered block returns there;
opening a document that has never been read starts normally and writes no
invented return.

No additional product questions are required. The calls below are the chosen
interpretation of the build order.

## Outcome

- Keep one lightweight IndexedDB position per document: document id and
  revision, zero-based block index, total block count, and last-read time.
- Coalesce rapid matcher updates so each document writes at most once per
  throttle window while preserving the newest block. Flush pending work when
  the page is hidden.
- Opening a remembered document sets the reading block, glides the viewport
  there through jt-water, and briefly shows `you were here` beside that block.
  Both travel and fade are sampled from jt-water; no CSS easing participates.
- Home document cards show the human one-based position (`block N of M`) and a
  relative last-read time. Unread documents say `not started`.
- Extend the vendored jt-speech lexicon locally for `take me back`, `where was
  I`, and `go back to <document name>`. Record the local delta for upstreaming.
- Resolve spoken document names by normalized exact match, containment, then
  edit similarity. If leading candidates are too close, show each title and
  wait for a choice; do not open or write a return record while ambiguous.
- Every successful remembered-place return writes one lightweight app entry
  containing a cursor and proof record made by the existing factories. The
  cursor uses the internal `return` lifecycle state and is not undoable; the UI
  only says `returned` and uses plain block words.

## Chosen architecture

`src/position.js` owns pure position normalization, relative-time copy,
per-document write throttling, and fuzzy document ranking. `src/db.js` remains
the only IndexedDB adapter and gains a versioned `positions` store.

`src/motion.js` owns return travel and label fade because every moving value
must come from jt-water. `src/main.js` connects taps and matched reading to the
position writer, restores positions when documents open, handles return voice
commands and ambiguity, and asks the existing act engine to persist a return.
`src/shell.js` reads position summaries for home cards.

`makeReturnEntry` composes the existing `makeCursor` and `makeReceipt`
factories. The act engine stores it beside existing history without applying
an annotation or offering undo.

## Alternatives considered

1. **Selected — dedicated position store plus ordinary record pair.** Keeps
   hot reading updates lightweight while preserving inspectable return events.
2. **Write a record pair on every matched block.** Fully inspectable but far
   too noisy and write-heavy for continuous speech.
3. **Store positions inside documents.** Avoids a store, but rewrites large
   document values for tiny cursor changes and mixes source provenance with
   device-local reading state.
4. **Browser smooth scrolling.** Shorter code, but does not satisfy jt-water
   motion or give a testable physical trajectory.

## Detailed behavior calls

- Block numbers in storage are zero-based; all UI block numbers are one-based.
- A stored index is clamped to the current document's last block. A revision
  change does not discard the place because append-only and re-ingested
  documents can retain a meaningful block; the current revision and block
  count replace the old values on the next read.
- `take me back` and `where was I` target the open document. With no open
  document, jt says there is no open document. With no remembered place, jt
  says it has not kept a place there yet and writes no record.
- `go back to <name>` searches all documents. Exact normalized titles win.
  Containment is next; similarity below the acceptance floor is an honest no
  match. Candidates inside the ambiguity gap are shown as buttons.
- A return record captures the spoken phrase for voice, and `opened from home`
  for card or library taps. Automatic boot restoration uses `page reopened`.
- A return entry is visible in both history views, contains no undo or send
  button, and remains part of normal JSON export.
- The return label is a transient, non-interactive child of the target block.
  It is removed after its water trajectory reaches rest; reduced-motion keeps
  the same physics at the configured calm medium.

## Vendored jt-speech delta for upstreaming

Upstream `document.return` with current-document triggers `take me back` and
`where was I`, plus the named-document trigger `go back to`. The parser should
emit optional `documentName`; jt-web keeps document-library ranking local
because the speech package has no access to application documents.

## Verification contract

- All 44 starting tests remain green.
- Unit coverage proves per-document throttling keeps the newest update,
  corrupted/out-of-range positions normalize safely, relative time is stable,
  and fuzzy document matching distinguishes exact, ambiguous, and missing.
- Speech coverage proves all three return forms parse without turning ordinary
  prose into a command.
- Record coverage proves the return cursor and proof record validate against
  existing schemas, use internal return state, and cannot be undone.
- Headless end-to-end coverage proves tap position survives reload, the home
  card reports `block N of M` with relative time, opening returns with the
  marker and a stored pair, voice returns work, named fuzzy return works, and
  ambiguity opens nothing until chosen.
- `npm test` and `npm run build` succeed; user-facing banned words remain
  absent; the work is committed on `blitz/b4-return` when git permits.
