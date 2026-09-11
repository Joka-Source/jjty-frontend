# Unified JJTY product implementation plan

Goal: Deliver a coherent browser workspace for communication, documents and sharing, with portable UI contracts and honest integration boundaries.

Architecture: A shared shell owns navigation and communication drafts. Existing reader and notebook workspaces retain document custody and editing. Provider adapters own authentication, import, delivery receipts and connector errors; UI never manufactures successful delivery.

## Final acceptance tasks
- [ ] Shared responsive shell: Inbox, Messages, Library, PDF tools, Connections, Settings; browser back navigation and keyboard access.
- [ ] Inbox: account/folder navigation, thread detail, attachments, compose, locally persistent drafts, empty/search states; no false sent receipts.
- [ ] Messaging: channels, thread view, composer, attachments, destination and failure states; distinguish local preview from delivery.
- [ ] Documents: surface existing PDF editing/forms/page tools and notebooks; preserve original custody and drafts on navigation.
- [ ] Email → PDF → reply: stable attachment identity, open existing editor, return to originating draft, attach independent result.
- [ ] Video: picker, preview, size/type feedback, destination, permission, upload/progress/cancel/retry, adapter receipt.
- [ ] Gmail: adapter capability inspection, connect/import scope/progress/reconnect/disconnect; no account access without an explicit connection action.
- [ ] Settings: account identity, appearance, accessibility, notification preferences, storage and shortcuts with persistent outcomes.
- [ ] Finish: consistent icons/tokens, menus, transitions, intermediate states, focus, reduced motion, touch targets, responsive visual inspection.
- [ ] Verification: focused real-browser journeys, regression evidence, review, commit/push and durable issue receipt.

## Files and checks
workspace/index.html, workspace/app.js, workspace/style.css: shared navigation and communication surfaces.
workspace/model.js: validated local draft/preferences model and explicit adapter capabilities.
src existing PDF modules: retain working editing and Bento custody; integrate through stable entry points.
notebooks/: retain tested document storage and voice cursor.
test/unified-workspace*: model and browser acceptance.

## Goal tool boundary
New goal creation was attempted after founder authorization. Tool rejected it because the old inventory goal is paused and unfinished. Do not mark that goal complete merely to replace it. This checklist is the durable execution scope until the goal can be replaced through the app.

## Known baseline evidence
Notebook focused suite 12/12 and build passed at ebb8253. Earlier full suite 483/488 passed; red evidence retained. Real Gmail delivery, microphone and native platforms are not proven by browser previews.

## Implemented checkpoint (not final completion)
Shared navigation and settings shell is runnable at /workspace/index.html.
Inbox and Messages have independent local drafts; writes merge by edited field to avoid stale-tab overwrites.
Attachments up to 100 MB persist in IndexedDB; video preview/download/removal is local and never labelled delivery.
Existing notebook and PDF reader surfaces are embedded and available as full workspaces. This is not yet stable attachment-to-editor-to-reply wiring.
Gmail and messaging adapters are not configured. Their connection screens state that explicitly.

Verification: unified real-browser journey passed; field-level concurrent-tab model check passed; production build passed; production offline shell/draft reload passed. Desktop screenshot inspected. Independent review findings corrected and tested. Broader baseline remains red as recorded in notebook evidence.

Remaining critical work: provider-neutral thread/attachment identity and editor return contract; actual email import/provider authorization; communication thread data and delivery adapter; video upload destination/progress; exhaustive screen-state coverage and visual finish; broad regression gate. The app is not declared finished.

## PDF attachment return checkpoint
Implemented local attachment review sessions: original file retained, independent reader document, saved form/annotation export, uniquely identified reviewed results listed with the same draft after folder navigation and fresh visits. Completed sessions cannot overwrite returned results. First-run review opens the reader without changing onboarding or microphone preferences.

Fresh browser proof edits the synthetic full_name PDF field, returns the copy, parses exported bytes to verify the new value, verifies original attachment and draft retention, and reopens the canonical workspace URL to verify result discoverability.

Boundary: this is local attachment → PDF form/annotation review → draft, not Gmail import or delivery. Existing text-edit derived-document and Bento return flows are not yet bound to the draft review session; the return control refuses a different document or unapplied text draft. Full product checklist remains open.

Verification for this checkpoint: 3 focused acceptance tests passed; existing desktop shell walk passed; production build passed. Broad historical red evidence remains unchanged.
