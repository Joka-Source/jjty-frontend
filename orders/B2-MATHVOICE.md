# order B2-MATHVOICE — spoken mathematics as a durable act

Branch `blitz/b2-mathvoice`, starting from `main` at
`635fb3272b0c468d2bd7f1a0e76cb10f7ff6b081` (35/35 tests).

## Fixed product decision

With no document open, keeping an expression creates or reuses one local
document titled `spoken mathematics`. Its provenance says source `spoken` and
created by `voice`. With a reading document open, the expression anchors to
the current document block. No additional product questions are required;
implementation calls are recorded below.

## Outcome

Turn the existing typed spoken-math preview into a real voice mode:

- enter or leave math mode by voice or by a visible button;
- while active, every final speech segment passes through the vendored
  `spokenMathToLatex` rule engine rather than the reading intent stream;
- show the exact spoken words and locally rendered KaTeX output side by side;
- show every unparsed word, without silently dropping or guessing it;
- saying `keep that` or tapping `keep expression` persists a first-class math
  act through the existing record factories and act engine;
- kept expressions appear in the existing reading history and full history,
  can be undone, are present in export, and can be sent as moments;
- show the expressions kept during the current page session in a compact strip;
- state plainly in the product that the engine is rule-based and that the 65k
  dataset is untouched pending provenance.

KaTeX must be a pinned local package compiled into local app assets. The built
application must make no runtime request to a CDN or other KaTeX host.

## Chosen architecture

`src/math.js` owns the pure math-session decisions: mode phrases, keep phrase,
translation, spoken-document construction, and math record options. This keeps
the speech recognizer and DOM code in `main.js` small and makes the required
transcript-to-LaTeX-to-record path unit-testable without a browser.

Math is a new `act: "math"` accepted by `makeActEntry` and `createActEngine`.
The app-level entry carries `mathSpeech`, `mathLatex`, and `mathUnparsed`; the
existing schema-pure cursor and receipt factories carry the intention and
durable result. The act engine renders or removes an anchored math annotation,
so undo follows the same path as highlight, important, and note. No parallel
database or record format is introduced.

The reading surface gains one focused math workbench below its document header.
Its two columns are the actual input words and the KaTeX result; narrow screens
stack them. A live mode button remains available whether or not a document is
open. The session strip is ephemeral and contains only expressions actually
kept during this page session; IndexedDB history remains the durable authority.

## Alternatives considered

1. **Selected — first-class math act through existing factories.** Preserves
   one history/undo/export/send system and gives math honest semantics.
2. **Separate expressions store.** Simpler in isolation, but would require new
   undo, export, send, and history implementations and could drift from acts.
3. **Store LaTeX as a note.** Reuses persistence superficially, but mislabels a
   mathematical artifact as prose and loses structured spoken/unparsed fields.

## Detailed behavior calls

- Voice phrases `math mode` and `start math mode` enter; `exit math mode`,
  `stop math mode`, and `leave math mode` exit. These control phrases are not
  translated into expressions.
- `keep that` is a control phrase only while math mode is active. If no
  translatable expression is present, it keeps nothing and explains why.
- The button can enter/exit mode even when the microphone is off. Typed input
  in the workbench is translated on input and can be kept by tap, preserving
  `pointer` modality; recognized speech preserves `voice` modality.
- Unparsed words do not prevent keep when some LaTeX exists. They remain on
  screen and in the durable entry so history/export/send never imply a full
  parse.
- On a reading document, the anchor is the current block. If no block has been
  established, keeping is declined with a plain instruction to tap or read a
  block first; this avoids inventing an anchor.
- With no reading document, the first keep creates `spoken mathematics` with
  source kind `spoken`, creator `voice`, revision 1, and one expression block.
  Later keeps reuse that document and append expression blocks, incrementing
  the revision. A pointer keep uses the same document provenance because it
  remains a spoken-mathematics source created by the voice feature.
- Plain-copy labels disclose: `rule-based translator; 65k dataset untouched
  pending provenance`.
- KaTeX rendering uses `throwOnError: false` and never uses `innerHTML` from
  transcript text; KaTeX receives only the translator-produced LaTeX.

## Verification contract

- All 35 starting tests remain green.
- Unit coverage proves `one half plus x squared` becomes
  `\\frac{1}{2} + x^{2}`, then a valid math cursor/receipt pair containing the
  expected source, evidence, intention, and durable result.
- E2E simulation enters math mode, speaks `one half plus x squared`, keeps it,
  sees it in the session strip and history, validates both records against the
  existing JSON schemas, and proves undo/export remain wired.
- A production build succeeds and its emitted HTML/CSS/JS contains no KaTeX
  CDN or runtime network URL.

