# PDF Expert on iPad: public user research

Research date: 2026-09-08. Read-only public-web research; no posting, contact, account access, or device testing.

## Method and limits

This is a purposeful convenience sample of **11 accessible Reddit thread bodies and their visible comments**, spanning 2019–2026, selected for concrete workflows, praise, and friction. Search snippets were discovery aids; the observations below use opened thread content. Nested comments hidden behind further expansion were not exhaustively collected. This is neither representative sentiment analysis nor a prevalence estimate. No percentage of users, product ranking, or universal defect claim follows from this sample.

Dates below are indexed posting dates, sometimes supplemented by comment dates. Reddit's fetched pages also show relative ages, which can differ with crawl time; treat exact comment dates as approximate unless explicitly stated. App versions and OS builds are generally unspecified. Historical reports are evidence of user needs, not proof of current PDF Expert behavior. Two threads concern failures in Apple's tools and mention switching to or considering PDF Expert; these are clearly marked adjacent-workflow evidence. We did not independently establish technical causes, current pricing, or current feature availability.

The existing Reddit mirror/lab was not used: the parent investigation had not located it. One candidate, `1j2nx4m` (subscription/cross-platform discussion), repeatedly failed to open and is excluded from this evidence set. No inaccessible snippet contributes an observation.

## Ten observations and proposed acceptance criteria

The acceptance criteria are **proposals for JETT**, not claims of implemented functionality or measured performance.

### 1. The document's existing home is part of the workflow

**Observed:** In a 2025-11-21 thread, iPad users reported grayed annotation tools when opening existing Files/iCloud documents. Copying into PDF Expert made editing possible for some but disrupted original folders and confidence about where changes lived. Teachers and postgraduate readers described immediate work disruption. Users associated this with 7.24.0; December comments reported 7.25 fixes, with mixed follow-up and another positive update report in January 2026. Vendor-cause explanations and lock-in accusations were not independently verified. [Annotation bar grayed out](https://www.reddit.com/r/ipad/comments/1p2vp16/pdf_expert_annotation_bar_grayed_out/).

**Job → need:** Continue work on a document already organized elsewhere → make source location, copy identity, save destination, and writable status explicit.

**JETT acceptance:** Open an external-provider PDF, mark it, leave, reopen, and verify the intended destination. Never silently substitute a private copy. If only export-a-copy is supported, label that before editing. Regression-test provider permission loss and app upgrade: preserve drafts and offer a recoverable destination, rather than an unexplained disabled toolbar.

**Uncertainty:** Historical incident, multiple iPad configurations; no claim that the problem persists today.

### 2. A Pencil highlighter should follow text deliberately

**Observed:** A 2024-10-25 user wanted straight highlighting with Pencil rather than wavy ink in Apple Notes. A commenter suggested PDF Expert; the original poster replied that it worked. Another commenter described using it across iPad, Mac, and iPhone. [Annotate perfectly with Pencil](https://www.reddit.com/r/ipad/comments/1gbrdxl/how_to_annotate_perfectly_with_pencil/).

**Job → need:** Mark meaningful words while reading quickly → distinguish semantic text highlighting from freehand highlighting, instead of making precision depend on a steady hand.

**JETT acceptance:** With Pencil, drag across three wrapped lines and highlight exactly the covered words, including partial first/last lines. Provide a separately named freehand mode for diagrams or scanned pages. Neither mode should unpredictably change to the other. Test selection direction, page rotation, zoom, and unavailable text layers.

**Uncertainty:** No PDF Expert version, Pencil model, or OS version supplied. This establishes a reported successful interaction, not its implementation details.

### 3. Quiet chrome must remain discoverable

**Observed:** A 2019-12-18 iPad Air 3 user wanted to hide PDF Expert's toolbar while still annotating. Replies explained tapping an active mode again and, in later comments, moving the toolbar to an edge. Follow-ups years later thanked people for revealing these controls. [Hide toolbar while annotating](https://www.reddit.com/r/ipad/comments/ec6oe9/is_there_a_way_to_hide_the_toolbar_at_the_top/).

**Job → need:** Read and mark a full page on a limited display → reclaim space without losing access to the current tool or requiring secret gestures.

**JETT acceptance:** A visible, accessible control enters a quiet reading/marking layout; a single discoverable action restores tools. Active tool/color remains understandable, keyboard focus survives, and a first-time user can recover the toolbar without documentation. Test portrait, landscape, and narrow split view.

**Uncertainty:** Controls described over several app generations; this is a discoverability lesson, not a verified current toolbar map.

### 4. Marks should survive another reader, not merely an export

**Observed:** A 2021-02-18 iPad/Mac user valued erasing PDF Expert handwriting later on Mac or another PDF editor, while preferring a competing app's writing feel but rejecting its non-editable export. [iPad–Mac workflow](https://www.reddit.com/r/pdf/comments/lmw08x/workflow_question_ipad_mac/). A 2025-07-08 user reported blurry, flattened Pencil marks when moving PDFs through Preview/Google Drive, but not with PDF Expert; Google Drive was required for their team. Replies disagreed about the cause. [Pencil annotations get flattened](https://www.reddit.com/r/iPadOS/comments/1lurv2t/pencil_annotations_on_pdfs_get_flattened/).

**Job → need:** Hand off and revise a shared working document → preserve editable, standard annotations across readers and existing storage providers.

**JETT acceptance:** Export a PDF with vector ink, highlight, and note; independently inspect annotation objects, then open in another reader, edit/delete a mark, and return it. Verify sharp zoom, text contents, and originals. Flattening must be an explicit separate action. Repeat through the team's chosen storage path.

**Uncertainty:** Neither report establishes whether flattening originated in a reader, export option, or provider. Exact app versions unknown.

### 5. Finger navigation and Pencil marks need separate intent

**Observed, adjacent workflow:** On 2019-10-10, an iPad 6/Pencil 1 user said Files treated both finger and Pencil as drawing input despite the Notes preference. Another user said this drove them to PDF Expert, despite liking Apple's native writing feel. [Only draw with Pencil](https://www.reddit.com/r/ipad/comments/dg6in0/ipad_6th_and_pencil_issue_in_files_only_draw_with/).

**Job → need:** Navigate with a hand while holding a pen → predictable input ownership, with no accidental ink from scrolling.

**JETT acceptance:** In Pencil-only ink mode, finger drag pans, two-finger pinch zooms, and Pencil draws; no stray strokes appear when alternating rapidly. A clearly named finger-drawing option is reversible. Test palm contact, Pencil disconnect/reconnect, and touch-only fallback on real hardware.

**Uncertainty:** The failure was reported in Files, not PDF Expert. This is a migration motive, not proof of current PDF Expert input behavior.

### 6. Split view must not remove document switching

**Observed:** A 2024-06-25 PDF Expert iPad user reported tabs disappearing in split view, forcing a full-screen → switch document → split-view round trip. They asked for a keyboard shortcut or gesture; the accessible thread had no solution. [Switching open documents in split view](https://www.reddit.com/r/macapps/comments/1doi6ya/pdf_expert_ipad_keyboard_shortcut_for_switching/).

**Job → need:** Compare a source with notes or another app → keep document switching reachable at narrow widths.

**JETT acceptance:** With three PDFs open in a narrow pane, switch among them using a visible compact control and keyboard command without leaving split view. Each retains page, zoom, and pending work. Expanding/collapsing the pane must not reset navigation or hide all routes back.

**Uncertainty:** Single historical report; hardware, OS, and PDF Expert version unspecified. The absence of a reply does not prove there was no shortcut.

### 7. Temporary page detours should not require bookmarks

**Observed:** In a thread indexed 2026-08-29, a tabletop-RPG reader using free PDF Expert preferred its navigation after trying alternatives: jump among pages and return to earlier spots without creating bookmarks; use the sidebar TOC when the PDF supplies a useful one. [RPG PDF viewer discussion](https://www.reddit.com/r/Solo_Roleplaying/comments/1w14fv2/what_ipad_pdf_viewer_do_you_recommend_and_why/).

**Job → need:** Consult a rule or reference, then resume the original passage → a navigation history distinct from saved bookmarks.

**JETT acceptance:** Page 12 → TOC destination 85 → search result 140 → Back → Back returns to the prior locations and zoom, not merely the prior document. Forward works until a new branch is taken. A document without an outline still supports this flow.

**Uncertainty:** App version/device unspecified; relative comment timestamps vary with the fetched page. Other comments describe other apps: their features are not attributed to PDF Expert here.

### 8. Reusable markup turns an editor into a work instrument

**Observed:** In a 2026-03-12 iPad PDF-reader discussion, one paying PDF Expert user described construction drawings, rough measurements, multiple tabs, and custom markups saved as favorites as a major workflow improvement. Other replies recommended its free reader and confirmed tabs. [Any good PDF reader?](https://www.reddit.com/r/iPadPro/comments/1rrv389/any_good_pdf_reader/).

**Job → need:** Repeat a small set of domain annotations across drawings → persistent presets and reusable marks close to the document.

**JETT acceptance:** Create a named markup preset, apply it repeatedly across two documents, and recover it after restart with identical style. A measurement tool must visibly expose units/calibration and allow correction; never imply construction-grade accuracy merely because a ruler is present. Keep recent documents reachable while working.

**Uncertainty:** A self-reported construction workflow, not a calibrated accuracy test. Current premium entitlements and exact versions were not checked.

### 9. Complex vectors can break the reading rhythm

**Observed:** In a 2022-02-17 iPad/iOS 15.3.1 discussion, an engineering/architecture-office commenter reported older Pro PDF Expert taking up to 45 seconds after pan/zoom on layered vector drawings before tools became available. Another PDF Expert user did not see that severity and still valued direct Files editing. [PDF issues on iPad](https://www.reddit.com/r/ipad/comments/sujcol/anyone_having_this_issue_with_pdfs_on_the_ipad_if/).

**Job → need:** Inspect detailed plans → responsive navigation and honest loading states under vector complexity, not only large page counts.

**JETT acceptance:** Include synthetic dense-vector/layered drawings in performance gates. Record actual device, file complexity, zoom latency, and time until marking is safe. Keep a usable last frame and explicit loading feedback; prevent marks from landing on stale geometry. A failed render must preserve saved work and navigation.

**Uncertainty:** The 45-second claim is one unverified report, not a benchmark. Much of this thread concerns Apple's viewer; those losses are not attributed to PDF Expert.

### 10. Sometimes filling a form means handwriting, not conversion

**Observed, adjacent workflow:** A 2024-10-02 iPad Air user wanted to handwrite returned forms instead of print/write/rescan. Malformed fields, handwriting-to-text conversion, and autofill overlays interfered. A responder reproduced a Files issue on a W-9 and mentioned using PDF Expert; the original poster remained uncertain about paid prompts. [Fill PDF with just Apple Pencil](https://www.reddit.com/r/ipad/comments/1fu78jx/filling_pdf_with_just_apple_pencil/).

**Job → need:** Complete a document as if on paper → a deliberate choice between typed field entry and ink, even when widgets are malformed.

**JETT acceptance:** Offer explicit Fill fields and Write on page modes. Ink mode must not be intercepted by text conversion or autofill widgets. Export both typed values and handwriting in one readable PDF; verify visual placement and retained field values independently. Reveal paid boundaries before the user invests effort.

**Uncertainty:** No successful PDF Expert completion was established in this thread. The form interaction failure was in Apple's tools, and current pricing is not inferred.

## What this suggests for JETT

The strongest design hypothesis from this sample is continuity: keep the same document, the same place, the same marks, and the same input intention while the surrounding app gets out of the way. Validate that hypothesis with observed task completion, not a count of toolbar features.

Suggested next qualitative demo sequence: open an existing file → mark three wrapped lines with Pencil → pan with a finger → hide/recover tools → jump to a reference and return → switch documents in split view → handwrite and type on the same form → reopen the result in another reader. Ask where a person hesitates and where they believe the file was saved. That sequence is a research proposal; it has not been run on an iPad in this study.

This sample does not establish demands for social networking, voice, AI, cloud hosting, enterprise signatures, government-tender execution, or full Adobe parity. Those require their own evidence. PDF Expert's reported strengths are useful acceptance targets within JETT's broader vision, not evidence that the broader vision should be reduced to a PDF editor.
