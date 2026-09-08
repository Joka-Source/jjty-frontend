# PDF form editing

The reader detects AcroForm widgets and exposes a form panel for text, multiline
text, checkboxes, radio choices and scalar dropdowns. Shared widgets appear as
one answer with their page numbers. Answers are saved locally against the source
digest; reopening waits for pending writes and restores the latest draft. Failed
saves retain the draft and offer Retry. Export freezes the answer controls so a
new edit cannot silently miss the exported snapshot.

Download filled copy opens fresh owned original bytes in MuPDF, disables PDF
JavaScript, applies permitted values, updates appearances and writes a separate
interactive PDF. The original document bytes/digest remain unchanged. The page
shown in the reader is explicitly the original, not a live filled preview.
Local annotations and server work are not embedded by this form-only export.

Encrypted/permission-restricted, signed or signature-protected, XFA and calculated
forms are not editable through this path. Unsupported widgets and action-driven
fields are shown with explanations. Blank signature widgets do not authorize
signing and do not prevent unrelated supported fields from being filled. Choice
export values are paired with display labels. Multiselect and rich-text form
behavior remain unsupported, and form JavaScript is never run.

## Verification

`node scripts/verify-form-ui.mjs` runs against local5174 with a private browser
and test/fixtures/jett-fillable.pdf. It fills six logical fields, saves/reloads,
downloads an edited copy and checks original bytes and narrow-screen overflow.
The fixture has eight widgets, including a correctly parented reference repeated
across two pages. scripts/create-form-fixture.py is its reproducible builder.

The independent Python script checks the exported canonical field tree, widget
ancestry, effective values and normal appearance streams:

```sh
python scripts/inspect-form.py OUTPUT.pdf --expect expected.json \
  --original test/fixtures/jett-fillable.pdf \
  --original-sha256 4fd8273558b765ab9597566bc0676a34d097ab3d909e733d8e30d9f8daf088af
```

Both core and UI exports passed this inspection and Poppler rendering of both
pages. Evidence is retained under the parent runtime/form-proof directory:
ui-result.json, ui-inspection.json, ui-expected.json and ui-filled-{1,2}.png.
The scripts use synthetic data; they never fill real identities or signatures.

This is the first verified form-edit/export journey, not PDF Expert/Acrobat
parity. Required field handling, unsupported behavior, calculation fidelity,
accessibility, large corpora and signature workflows retain their own acceptance
requirements. Existing MuPDF licensing/deployment review remains applicable.
