# PDF Expert iPad baseline for JETT

The founder's current priority is PDF Expert's **current iPad/iPhone experience
as the minimum baseline**, including detailed interactions. BentoPDF is an
implementation foundation to reuse and improve. The broader JETT voice,
communication and device vision builds above that baseline. Research precedes
the physical iPad session; device availability does not block this desk research.

[Open the searchable research explorer](explorer.html).

## What is actually in this checkpoint

- [User research](USER_RESEARCH.md): ten observations drawn from eleven accessible
  public Reddit threads and visible comments, spanning 2019–2026. This is a
  purposeful convenience sample, not a representative survey. Adjacent failures
  in Apple's tools are labelled and not attributed to PDF Expert.
- [Official interaction inventory](PDF_EXPERT_IPAD_INTERACTIONS.md): 24 bounded
  interactions from nine official help pages. These are documented behaviors,
  not direct device observations; unknown app versions remain null.
- [Bento adoption map](BENTO_ADOPTION.md) and
  [ten source contracts](bento-reuse-contracts.json): pinned upstream modules,
  adaptation boundaries, risks and fixture acceptance. Source inspection only;
  no Bento runtime or worker was installed or executed for this research.
- [Research ontology](ONTOLOGY.md): the relationship between user job, object,
  context, trigger, feedback, durable result, recovery and evidence.

The root researcher additionally read a teacher's historical batch-grading
discussion about original PDFs, pen selection, zoom and two-way storage sync.
That account is recorded in ONTOLOGY.md separately and is **not** included in the
ten-observation/eleven-thread sample or explorer totals.

The explorer's 44 entries are research units, **not** 44 independent respondents,
44 shipped features, or a denominator for product-completion percentages. Several
entries share sources. Linked URL counts do not measure customer prevalence.

## From needs to acceptance

| User job | Evidence links within the data | Existing JETT foundation | Remaining full-journey proof |
|---|---|---|---|
| Keep the same working document | user-1, user-4 | Exact original custody; reviewed interactive exports | External-provider write-back, two-device identity, conflict and recovery |
| Mark meaningful words with Pencil | user-2, user-5, pe-ipad-text-markup | Exact voice/text anchors and native PDF highlights | Pencil/finger ownership, palm behavior and semantic text selection on iPad |
| Revisit what mattered | pe-ipad-annotation-search, pe-ipad-annotation-jump | Durable action history and anchors | Dedicated searchable, color-filtered annotation summary with source navigation |
| Take a reading detour and resume | user-7, pe-ipad-page-return | Saved document reading position | Page-jump return and independently tested navigation history; official docs only establish previous-page return |
| Work across several documents | user-6, pe-ipad-tab-switch | Serialized document opens and saved drafts | Tabs, compact switching, per-document zoom/selection, keyboard behavior |
| Keep tools close without clutter | user-3, user-8, pe-ipad-toolbar-position | Basic controls and undo | Movable/custom toolsets, stable presets, discoverable recovery from hidden chrome |
| Organize pages confidently | bento-page-selection and other Bento source entries | Prepared-copy page rotation | Reorder, extract, merge, native structure preservation and stale-operation cancellation |
| Fill fields or write on the page | user-10 and official form entries | Saved scalar form drafts and interactive copies | Deliberate handwriting mode, mixed ink/widgets and device input verification |

Existing foundation references: [audit ledger](../../quality/PRODUCT_AUDIT.md),
[exact ranges](../../architecture/EXACT_RANGES.md),
[forms](../../architecture/PDF_FORMS.md),
[combined copies](../../architecture/PDF_COMBINED.md),
[rotation](../../architecture/PDF_ROTATION.md),
[backup](../../architecture/LIBRARY_BACKUP.md).
Previous local tests establish those narrower behaviors; none certifies the
whole parity row above. No current iPad interaction has been directly tested.

## Evidence rules

Record source URL and type, platform, available date/version, actual claim,
uncertainty, and proposed acceptance separately. A customer explanation for a
failure is not an established technical cause. A historical issue that was later
reported fixed must not be presented as current. Do not promote another app's
feature into a PDF Expert claim. Do not infer timings, icon shapes, gestures,
entitlements or device behavior from marketing or text instructions alone.

Direct PDF Expert observation during the voice discussion used an old Mac copy
which the founder identified as cracked. It is excluded from this current iPad
baseline. No private PDF Expert source or current IPA was obtained.

The reported Reddit lab is still unlocated after bounded local searches,
including the IIIT Nagpur clue. A separate lead importer is not that lab and was
not executed. Public research continued without it. This is not proof that the
lab does not exist on another host or in another archive.

## Rebuild and review

Run `node scripts/build-research-view.mjs` from the frontend repository. The
builder validates stable IDs, required evidence fields and HTTPS source links,
then embeds the three data files in a self-contained HTML page. Rendering uses
text nodes; embedded JSON escapes HTML delimiters. No CDN or service is required
to search, filter or read the page. Opening a source link deliberately visits
that source in a separate tab.

This is a research artifact, separate from the customer-facing product. Extend
the evidence and acceptance inventory as coverage grows; retain provenance and
avoid marking a row complete solely because its implementation exists.
