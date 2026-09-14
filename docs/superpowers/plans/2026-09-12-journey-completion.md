# Unified user journeys implementation plan

**Goal:** Inventory the complete JJTY product journey surface and implement missing journeys toward Apple App Store and Google Play readiness, as requested on 12 September 2026.

**Architecture:** Preserve document and notebook storage and editing engines. The workspace owns navigation, a unified searchable library, and persistent individual communication drafts. Each attachment review retains the originating draft identity. External providers and native distribution have separate acceptance gates.

**Stack:** Existing JavaScript/Vite, IndexedDB, native browser controls, existing PDF/notebook engines. No new UI framework or remote telemetry.

**Approved scope:** User asks for all journeys inventoried and made, grounded in UX principles and Mobbin. Existing 11 September plan remains the broader functional acceptance scope. This document decomposes its immediate runnable implementation; it does not reduce the release scope.

## Design

One stable navigation rail becomes reachable mobile navigation. A quiet paper-white canvas, slate text, deep blue actions, pale blue selection, and visible semantic feedback prioritize reading and writing. System typography uses 16px body, 24px page headings, and 13px supporting labels. Searchable lists replace placeholder search. On narrow screens, list and editor are separate steps with a visible return action. Empty states offer an immediate useful action. Saved, saving, failed, offline, and unavailable delivery are distinct states. Escape dismisses sheets and restores focus. All touch controls are at least 44px.

## Execution and verification

- [ ] Inventory every discovered domain and its transitions in `docs/quality/user-journeys.json` and `USER_JOURNEYS.md`; identify implementation, evidence and native/provider gaps without inferring success from existing tests.
- [ ] Verify Mobbin access and primary Apple HIG, Material, WCAG and usability references; map principles to concrete acceptance behaviors in `docs/research/UX_FOUNDATIONS.md`.
- [ ] Implement `workspace/drafts.js`: transactional multi-draft creation, field patching, ordering, archiving/restoration and idempotent legacy migration. Test concurrent edits, migration retry and commit failure.
- [ ] Implement `workspace/library.js`: read existing document/notebook metadata, type/text filtering and stable editor destinations. Preserve source stores and original files.
- [ ] Implement workspace Home, unified Library, searchable draft lists, individual draft selection, archive/restore, mobile list/detail navigation, storage backup and accessible feedback in `workspace/app.js` and `style.css`.
- [ ] Bind PDF attachment return to an individual draft in `pdf-handoff.js` and `src/workspace-return.js`, retaining legacy sessions. Verify two drafts cannot receive one another's result.
- [ ] Establish tests that fail on current placeholder search, missing multi-draft retention and missing shared library; then run them against the implementation. Run the repository full `npm test` gate and inspect rendered desktop/mobile journeys through the Browser skill.
- [ ] Read-only audit native projects, SDKs, physical devices, signing identity references and remaining store gates. Do not generate a permanent app identity or access credentials to fill a gap.
- [ ] Review changes, resolve regressions, commit and push the exact implementation. Record local/browser/native/deployed/store evidence independently and preserve remaining blockers.

## Ownership

Root owns workspace UI, library adapter, handoff integration and final verification in the existing isolated `feat/slack-learning-lab` worktree. Inventory and draft persistence agents have separate worktrees and non-overlapping files. Release audit is read-only; it owns the initial full test run. No edits to the document vault or restricted founder corpus.
