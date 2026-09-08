# Reader page browser — next increment

## Problem

The inspected shared-navigation screenshot shows expanded Contents increasing the sticky toolbar to about 562px at 1280×900. Navigation works, but the panel leaves too little document visible. Reader thumbnails are still missing.

## Outcome

A Pages control opens a collapsible, independently scrolling side panel for thumbnails and Contents. Opening the panel does not increase toolbar height or change the current reading position. Every destination uses the existing document-owned navigation queue and shared Return point.

## Implementation direction

- Keep the existing Contents controller and controls; relocate its body into the bounded page browser rather than duplicating bookmarks or navigation state.
- Draw small thumbnails from the existing rendered page canvases. Draw lazily for visible rows; invalidate on document or canvas replacement and discard stale work.
- Give each page one labelled button, physical page number and current-page indication. Blank pages remain valid destinations without text authority.
- Keep document width/zoom stable while opening and closing the panel. Desktop uses a bounded side surface; narrow screens need explicit close/Escape and predictable focus restoration.
- Keep the current source/selection guard authoritative. A rejected jump retains the panel and explains the failure; a successful narrow-screen jump closes the panel without adding another departure point.

## Acceptance

- Mixed thumbnail→Contents→Find→Return journey preserves source bytes, saved marks and the original departure point.
- Opening/closing leaves document geometry and scroll stable; toolbar height does not grow with Contents.
- 200-page fixture only draws visible thumbnail previews. Rapid zoom and document switches cannot show old page images or target the wrong document.
- Keyboard, 390px viewport, Escape/close focus, empty Contents, rotated/blank pages and rejected navigation receive browser coverage and rendered inspection.
- Independent review, relevant tests/build and exact SSOT evidence. No full PDF Expert or native-device parity claim.

## Independent review notes

The reviewer confirmed an out-of-flow desktop panel is the smallest change that preserves document width and zoom. A width-reserving sidebar would require fit rerender and offset recovery, so is outside this increment. On mobile, navigate with destination focus deferred while the reader is inert; after successful navigation close the drawer and focus the destination with preventScroll. Escape/cancel restores trigger focus; successful navigation must not steal focus back to the trigger. Rejected navigation keeps the drawer open.

Thumbnail acceptance must measure bounded canvas allocation, not only visible image count. Disconnect observers on close and cancel work on source/canvas replacement. The existing physical page canvases include blank/rotated source pages but exclude DOM annotation overlays; thumbnail evidence must not imply reviewed-export composition.
