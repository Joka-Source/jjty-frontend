# Durable PDF text markup in the own JETT UI

## Outcome

Highlight, Underline and Strikethrough share exact selection/range targeting, a named color palette, durable reload/undo and native PDF output through both Export and Organize. Use the existing records store and registry operation semantics. Never label an underline as a highlight or substitute server-panel state for local work.

## Authoritative path audit

Toolbar → main queueReader/executeVerb → registered verb → performActAtTarget/performRange → acts.perform → records.makeActEntry → IndexedDB commit → DOM effect. Reload resolves anchors and reapplies registered effects; Undo atomically persists the changed original plus undo receipt before reversing the effect.

Current restrictions are explicit: toolbar/main/acts allow only Highlight ranges; records.makeActEntry drops unknown style fields; PDF export creates Highlight/Text only; combined export and Organize duplicate supported-mark filters. Current DOM highlight color and native export color differ. Cursor/receipt schemas disallow extra fields; annotation style belongs on the existing entry wrapper. Arguments need real runtime validation, not merely schema declaration.

## Implementation

- Add shared text-markup classification and named-palette validation used by UI, persistence, paint and export. Give legacy highlights one documented default that paints and exports consistently.
- Register truthful underline/strikethrough single and range operations, forward style in main and acts, and preserve exact target/source guards and commit-before-paint semantics.
- Extend existing per-text-node wrappers, retaining PDF item mapping and independent overlap/undo. Transparent PDF text requires explicit decoration color.
- Add native Underline/StrikeOut export with shared quads and validated color. Include new acts in combined export and Organize via the shared classifier so underline-only work cannot disappear.
- Persist the selected tool color through the existing Settings mechanism. Keep content-free journal intent/outcome classifications accurate. Audit voice dispatch compatibility and shared/WASM/native validation before claiming cross-platform operation support.

## Acceptance

Actual own-toolbar single/cross-page markup; mixed overlapping styles with independent undo; rejected blank-gap targets; persistence failure without paint; zoom/reload retaining style; original bytes unchanged; independent PDF.js subtype/color/quads readback; combined form export; underline-only Organize to Library and reopen. Inspect rendered results, run independent review and the full build/test gate. Native devices, real speech and complete PDF Expert parity remain separate gates.

## Independent review addition — backup custody

`src/library-backup.js` projects restored records through RECORD_KEYS. Extend its allowlist and validation for the new style/color fields, or backup/restore will silently discard them. Add backup → empty-library restore → rendered paint/native export checks for new styles and legacy defaults. Preserve range source identity through the existing rangeAnchor-based path rather than adding highlight-only verb exceptions.
