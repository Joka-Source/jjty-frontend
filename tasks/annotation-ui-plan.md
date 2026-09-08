# JETT direct annotation workspace

Founder correction: the requested product is our own PDF Expert parity UI. Bento integration is a foundation and must not substitute for that interface. Latest correction prioritizes the PDF workspace over the previous next-action EPUB sequence; full Apple Books scope remains intact.

Implement visible Read/Annotate/Organize/Fill workspace navigation and a JETT annotation toolbar. Exact browser text selection maps back to validated PDF text offsets and token anchors. Highlight/note/undo use executeVerb and the existing serialized document queue. Export uses the existing reviewed native PDF exporter. No guessed current-block fallback. Selection captured before toolbar focus is tied to document identity, digest, revision and live rendered nodes. A switch/re-render invalidates it. Notes retain their draft on failed save; cross-page highlighting uses the verified range action. Single-passage notes only until multi-page note anchoring is implemented.

The primary Annotate workflow stays in JETT. Additional Bento editing remains explicitly separate. No unused tool icons, fake controls, parity completion or new source storage.

Verification: exact repeated phrase via real browser selection, toolbar highlight and note, durable records/reload, independent native annotation export, undo, stale selection after switching, failed record write with note draft recovery; desktop/phone screenshots; full npm test. Preserve unrelated README edits. Local commits only.
