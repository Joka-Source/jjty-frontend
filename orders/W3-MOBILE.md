# order W3-MOBILE — jt-web fits a phone

The Android WebView host reported the known defect: the desktop-tuned
layout overlaps its sidebar panels on a phone-sized viewport. Make the app
genuinely phone-first.

Branch: `wo/w3-mobile` off `main` (main green at 27/27).

## What must be true at narrow widths

- The document is full-width; nothing overlaps it.
- The library/history/inbox panels become slide-over sheets or a bottom
  bar — reachable, dismissable, one at a time.
- Touch targets are at least 44px.
- No horizontal scroll, anywhere.
- The ambiguity prompt ("did you mean…") is usable with a thumb.

## Constraints

- Functionality-true: no visual redesign beyond what layout demands.
- Keep all copy. Keep water-driven motion.
- Desktop stays exactly as it was.

## Proof

Extend the puppeteer e2e to run the sim at 390x844 (phone) AND the
existing desktop size, asserting no horizontal overflow and that panels
open and close. All 27 existing tests stay green, plus the new ones.

Commit with this order and a receipt (verbatim outputs). Do not push.
