# JJTY Sage design edition build order

> Execute inline under the founder's delegated creative authority. Use executing-plans for tracking and verification-before-completion for delivery.

**Goal:** Deliver a complete, polished designer prototype covering the existing 27 journeys in light and dark pastel-green themes.

**Architecture:** Add an independent `/studio/` entry to the existing Vite app. Reuse the reference catalog, while all Studio screens share its own visual primitives. Preserve the existing product and playground.

**Tech stack:** Existing Vite, vanilla JavaScript, semantic HTML, CSS, inline original SVG icons and illustration. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-12-sage-design.md`.

## Global constraints

- Designer prototype, fictional sample content, no backend integration.
- Preserve existing readers, storage, drafts, and original files.
- Palette and dark theme follow the spec. Focus visibility, reduced motion, and 390px layouts are required.
- References are inspiration and provenance, not owned design files or quality guarantees.

## Build sequence

### 1. Establish the visual frame
- [x] Add `studio/index.html`, `studio/app.js`, `studio/style.css`, `studio/screens.js`.
- [x] Implement shared sidebar, compact top bar, sample-edition badge, command search, theme switch, and responsive navigation.
- [x] Compose Home with featured document, recent work, quick capture, and useful shortcuts.
- [x] Open the first meaningful preview.

### 2. Compose the primary surfaces
- [x] Library: document covers, collection tiles, filter chips, grid, and search.
- [x] Inbox: sample threads, sender identities, conversation, attachment, contextual reply.
- [x] Reader: document outline, page, annotation tools, comments, preserved-source review.
- [x] Notebook: paper, title, editorial writing, ink palette, page navigation.
- [x] Capture: source choices, scan framing, waveform, transcript and review.

### 3. Complete the journey atlas
- [x] Import every journey ID and reference mapping from `playground/catalog.js`.
- [x] Give journey cards distinct visual previews by domain.
- [x] Map each step to the relevant product surface with meaningful per-step content.
- [x] Provide previous/next/restart and explicit completion views.
- [x] Add designed empty/offline/error states with actionable recovery.
- [x] Make sharing, account, reminder, backup, conflict, onboarding and deletion sequences visually complete.

### 4. Make the system inspectable
- [x] Compose color/type/control/state specimens using the same Studio styles.
- [x] Include light/dark preview controls and references.
- [x] Add command palette, dialogs, toast feedback, editable sample reply and undo.

### 5. Refine and deliver
- [x] Review desktop home, inbox, atlas and reading surfaces.
- [x] Review dark mode and 390px layout; correct overflow and clipped controls.
- [x] Build production output, run Studio acceptance and required repository suite.
- [x] Record precise verification and boundaries; commit and push isolated branch.
- [x] Leave an accessible local preview and concise user handoff.

### 6. Widget and island follow-up
- [x] Inspect live Mobbin iOS widget specimens and public Dynamic Island implementation references.
- [x] Decide the widget family, material, hierarchy, capsule roles, and motion behavior.
- [x] Build an interactive phone workbench, three widget specimens, and optional app-wide advanced preview.
- [x] Verify light/dark phone layouts, exclusive expansion, pause, exit, and focus continuity.
- [x] Document native API boundaries and preserve source links.

## Follow-on production order (outside this designer pass)

1. Ratify the visual edition's final components as the migration target.
2. Replace sample adapters with the existing document/attachment operations one journey at a time.
3. Connect provider authentication and delivery with explicit permission and receipt semantics.
4. Migrate notebook/reader tokens without changing document custody.
5. Verify recovery, accessibility, performance and native/device behavior on exact artifacts.
6. Release through the authorized deployment/signing/store gates.

The follow-on list is not counted as completed by this prototype.
