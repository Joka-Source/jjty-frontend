# Notebook workspace implementation

Founder authorization: assemble the application from the Goodnotes and Slack studies and make implementation decisions. This increment uses the observed Goodnotes library/editor geometry and Slack's persistent navigation principle. Application code stays in the engineering repository.

Build a directly runnable /notebooks/ route, with independent editable notebook data, drawing and text, page switching, undo/redo, favorites, search, template selection, local persistence and JSON backup/restore. Keep existing / document desk reachable for PDF operations. No fake network collaboration or AI.

Files: public/notebooks/index.html, workspace.css, model.js, workspace.js. Model owns validation and immutable changes; UI owns rendering, pointer input, dialogs and storage status. Node tests cover serialized data, edits and isolation. Browser journey covers create, draw, page add, reload and backup. Run repository npm test and record failures honestly. Publish on feature branch for review.

Acceptance: create notebook, add content, change pages, undo and redo, reload without loss, export/import valid backup, reject invalid backup without changing data, keyboard-accessible dialogs, usable small-screen layout.
