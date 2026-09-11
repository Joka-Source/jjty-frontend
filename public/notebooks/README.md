# JETT notebook workspace

Open `/notebooks/index.html` from `npm run dev` or the built site. The existing document desk has a Notebooks navigation link. This is a functioning local notebook increment, not complete Goodnotes or Slack parity.

Implemented: create with four paper templates and cover color; favorites and library search; SVG pen and marker; typed text; whole-stroke erase; page add, duplicate and remove with undo; paper change; read-only tool mode; typed-text search; undo/redo within an open notebook; browser persistence; JSON backup and additive restore with validation.

Data is local to the browser origin under `jett-notebooks-v1`. It is separate from the existing PDF desk. Export before changing browser/device. The app reports storage failure; there is no cloud sync, collaborator delivery, OCR, AI, pressure-sensitive Pencil engine or PDF export in this route. The document desk remains available for existing PDF work.

References: Goodnotes atlas in `Joka-Source/jjty-human`, observed library/editor states G016/G020/G021/G022/G024/G087; Slack research informs persistent workspace navigation. Independently implemented code and synthetic content only.

Run `node --test test/notebook-model.test.mjs` from repository root. Model validation prevents malformed or duplicate identities entering the workspace and preserves old snapshots for undo. Browser evidence is in `docs/evidence/notebooks`.
