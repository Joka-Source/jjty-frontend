# Bento-first delivery — 9 September

Founder priority: install/adopt actual Bento now; pause unrelated Android backup work.

Plan: preserve upstream at d69566e, adapt in separate runtime/bento-jett worktree. Add bounded local source/result transport with strict origin and token ownership while retaining Bento COOP/COEP. JETT Library opens the full tools; Reader sends an original copy to a real upstream upload handler. Saved output returns as a distinct durable document with provenance, retry identity and original preserved. No parity or production claim from local integration.

- [x] Install and run upstream Bento; verify real create/duplicate/export.
- [x] Bridge actual source intake and exported PDF through Bento tools.
- [x] JETT source handoff and durable result return with reload/retry recovery.
- [x] Independent review of origin checks, lifecycle, failures and source custody.
- [x] Real browser source -> duplicate/rotate -> export -> JETT reopen; independent PDF readback.
- [x] Focused checks and full frontend suite.
- [x] SSOT evidence and local commits (frontend3a9639b, Bento161d39a).

Ownership: bento_bridge owns isolated Bento worktree; frontend_bento owns frontend implementation; lead owns integration/review evidence and SSOT. Existing README edits preserved.

Review: actual upstream Multi Tool source intake -> duplicate -> PDF export -> durable JETT return -> Library reopen after reload passed in isolated Chrome. Poppler independently confirmed three pages in order1,1,2; original bytes unchanged. Full frontend suite387 passed, additional focused service/IndexedDB checks passed. Local integration only; original-copy handoff excludes JETT annotations. Android backup remains paused. Next: cover Edit PDF and Fill/Sign return journeys and remove handoff loss on upstream reset navigation.
