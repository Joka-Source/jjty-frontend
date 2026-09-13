# Document-first material — working redesign, 13 September 2026

The prior image editor hid its PDF beneath stacked forms. This pass puts selection and manipulation on the page. It is a product implementation checkpoint; overall visual acceptance remains open.

## Observed references and limits

- [Evernote annotation screen, Mobbin](https://mobbin.com/screens/028189ef-667a-4c66-9aae-bc131bda7e7a): visually inspected the document on a grey canvas, compact upper actions, and a floating side tool strip. The page dominates; numeric controls do not cover it. The displayed reference image measured approximately 292 × 632 browser pixels; this is the rendered reference size, not a claim about original device points.
- [Docusign field placement, Mobbin](https://mobbin.com/screens/eaae3368-2ae1-441d-9f1e-30cd164c470e): visually inspected on-page fields and selection, a compact heading/recipient strip, and bottom field tools. This supports direct document interaction. No signature was sent.
- [Docusign signature-request flow](https://mobbin.com/flows/61726427-1280-4efe-ad75-4af951fb8d7a): the 20-frame recording was opened; the first home/add-document frame was visually inspected. The full flow has not been inventoried, so it is not evidence for all downstream steps.
- [Apple: Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/): controls and navigation form a distinct material layer above content; motion should explain changes in that layer. These are design principles, not proof of native material in this web implementation.

Current Mobbin searches did not return PDF Expert, Goodnotes or Acrobat app entries. This is a search limitation, not a claim that they are absent from the whole catalog. Existing help-page inventories are not direct app observation. Unrelated shopping/fitness widgets are not editor evidence.

## Visual decisions

| Role | Light | Dark |
|---|---|---|
| Control surface | `#f5f9f5` | `#26372e` |
| Workspace | `#dfe6e2` | `#17251e` |
| Navigation | `#e4ece6` | `#1f3027` |
| Primary text | `#263d34` | `#e3ede6` |
| Action | `#32624e` | `#9dc5ae` |
| Selection geometry | `#397de8` | `#397de8` |

Use the platform sans-serif for interface text, 17–18 px semibold contextual titles, 13–14 px controls, and 11–12 px secondary guidance. The PDF keeps its own typography and opaque paper. Floating controls have concentric rounding, a restrained edge highlight, and a soft depth shadow. Reduced transparency and higher contrast use solid surfaces. Reduced motion suppresses ongoing animation.

The upper capsule reports actual runtime work. The lower jelly contains the current document tools and reflects the selected tool family. Neither is claimed to be native ActivityKit or the hardware Dynamic Island. A second permanent status island is unnecessary when there is no active work.

## Build order and present evidence

1. Preserve source custody and working PDF operations. Done before redesign; do not regress them.
2. Replace image forms as the primary journey with an on-page frame. Implemented: drag, keyboard movement, lower-right resize, preview, Apply and Reset. Other corner dots indicate the selection bounds; only the lower-right handle resizes in this bounded engine.
3. Keep precision and image replacement accessible in a disclosure. Implemented. Failed saves retain the preview and original.
4. Fit the selected page above the mobile control sheet, while retaining manual zoom. Implemented; responsive geometry is asserted against the actual sheet position.
5. Unify light/dark material, selected jelly state, and accessible material fallbacks. Implemented for the actual editor.
6. Reduce markup and crop controls. Implemented compact search/style/color/history; crop dimensions are secondary. Actual markup/undo/redo/export/crop tests verify PDF content.
7. Review existing paragraph edit, forms, page arrangement, scanner review and export as a complete visual journey. Remaining. Their existing engine capability is preserved, but this checkpoint does not assert a complete reference match.
8. Review exact browser captures, package the reviewed SHA into Android, and exercise the installed artifact. Browser review and focused regression precede packaging; record exact artifact evidence separately.
9. Retain independent iOS scan integration and physical-device boundaries. iOS scanner integrated on `d93b53c`; physical capture, permissions/lifecycle and accessibility still require separate device evidence.

## Reproducible visual proof

`test/studio-image-direct.e2e.test.mjs` generates an original full-size illustrated event specimen, imports it through the actual file input, manipulates its image on the page, saves a separate PDF and reads the resulting bounds with MuPDF. It checks original byte equality, visible handle geometry, keyboard movement in the complementary image-tools test, and actual emulated reduced-motion/transparency/contrast preferences. Output captures are written to `/tmp/jetty-direct-image-review`; they must be copied into a SHA-labelled delivery receipt before reporting a packaged result. The old 4 × 4 engine fixture remains a narrow regression fixture, not visual acceptance evidence.

### Scanner follow-through reference

The [Docusign scanning recording](https://mobbin.com/flows/c97aad30-7ffa-4942-bde1-56a8f83b066a?tab=screens) was opened directly. Observed frames include the full-screen dark camera with lower shutter, flash controls, manual capture (frame 6), four-corner page correction with Retake/Keep Scan (frame 7), and the captured thumbnail beside the shutter and Save (frame 8). Frame identity and rendered 292 px image widths were checked against the page DOM. This is direct recording observation, not physical capture testing. It motivates a large scan-review surface with corner manipulation; that implementation is still a subsequent step.

Independent review found the new percentage-height sheets overrode the short-keyboard layout. The final stylesheet restores the full viewport below 350 px, including open precision panels. The direct test now verifies image precision at 800 × 126 in addition to portrait controls. This closes the browser regression; installed Android evidence is separate.
