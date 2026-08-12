# order W2-WEB — fuse the organs

Wave 1 built five working organs in sibling repos. This sprint fuses them
into jt-web so the product is one living thing: speak over your document and
the thing you meant happens, with records, physics, provenance, and moments
that travel.

Branch: `wo/w2-web` off `main` (main green at 9/9). Keep the existing tests
green at every step; each integration adds its own. Vendor or file-dep the
sibling packages — no registry publishing.

## The five integrations, in order

1. **jt-speech** — replace the ad-hoc command grammar with
   `IntentStream.push` (8 intents, explicit ambiguity). Ambiguity is wired
   into the UI honestly: the app asks ("did you mean…"), never silently
   guesses. Intents map to the act factories, including the two-anchor
   `highlight.range`.
2. **jt-connectors** — isomorphic surface for paste/text/md; pdfjs-dist in
   the browser for dropped/picked PDFs into blocks with page locators.
   Provenance (contentDigest, byteSize) stored with the document and shown
   in the library panel.
3. **jt-water** — the marker's motion via `glide`, act confirmation via
   `disturb`; physics, not CSS transitions. Subtle and fast.
4. **jt-core wasm** — `wasm-pack build --target web`; wired as the matching
   engine behind `?engine=...`. Parity test: same sim transcript through the
   JS matcher and the wasm engine → identical block sequence. Default flips
   to wasm only once parity is proven.
5. **jt-sync** — the moment-send act. "send this to <three words>" or a send
   button on a kept act; relay as a node process; received moments in an
   inbox with provenance and a hash-verified badge. E2E: relay + two pages,
   pair, send, assert arrival + verification + intact intention record.

## Rules

Banned user-facing vocabulary (Margin as a name, locus, settle/recede/
receipt as UI nouns, sea/drops/shells as product nouns, QR anything). Wire
names internal only. UI copy plain and human, lowercase jt. No QR pairing
ever — spoken words only.

## Done means

`receipts/W2-WEB.md` with verify commands and verbatim output: full suite
count (old 9 plus new), parity result, two-page sync e2e output.
