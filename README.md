# jt-web

jt on the web: open your document, speak, and the thing you meant happens — with an inspectable, undoable record.

- `npm install`
- `npm run dev` — open in Chrome, allow the mic once
- append `?sim=1` for a micless scripted replay (`&fast=1` for CI speed)
- `npm test` — schema validation + matcher unit tests + headless end-to-end

Records conform to the schemas vendored in `contracts/` (from jt-contracts).
