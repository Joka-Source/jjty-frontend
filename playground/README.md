# JJTY product playground

Install dependencies in this checkout with `npm ci` (do not share a node_modules symlink between worktrees).

Run `npm run dev -- --port 8784` and open `/playground/index.html`.
Production build: `npm run build`; serve `dist` with `npm run preview`.
Focused checks: `npm run test:playground`.

The six views connect 27 source-audited journeys, 27 curated Mobbin references,
20 component records, visual foundations, editable local review notes, and release gaps.
Search and filter journeys, save favorites, inspect source, explore synthetic states,
and open the existing document, notebook, and communication editors. Export inventory
includes review notes and favorites. Preferences are local to the browser and origin. After a successful online load, the production playground can reopen offline with saved review notes.

State specimens do not execute delivery, scanner, permissions, or account operations.
Working editor links use real browser storage. Planned journeys have no working-editor link.
The playground stylesheet is not yet shared across the existing production editors.
Mobbin images and design files are not copied into the application; canonical references
open in Mobbin. Ratings are editorial judgments, not independently measured quality scores.

This addition does not establish Android/iOS signed-artifact readiness, actual provider
integration, cross-device recovery, deployment, or store approval. Those gaps stay visible
in the catalog and Readiness view. Test links identify verification sources, not pass receipts.
