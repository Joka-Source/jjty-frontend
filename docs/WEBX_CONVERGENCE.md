# WebX convergence candidate

Base: Joka-Source/jjty-frontend main 6275606318999d92378a7a487750fccefbc2322b.
Selective frontend provenance: reviewed team preview 95aa864d57dd68c67b0849e9dd9f271954b58edb, including Studio eb842324 and Kothali b75dc528 ancestry. No bulk merge of their divergent histories. Remote Kothali f93ee198 was inspected; main's newer gateway remains authoritative.

The default root and /webx/ open a persistent document workbench. /reader/ keeps the established reader independently reachable. Documents, writing, scanning, tenders and Reader run as retained same-origin panels, sharing browser origin and existing IndexedDB stores without inventing a second sync/recovery system. Switching pauses capture; parent backgrounding also pauses capture. Source-linked notes and explicit reviewed-copy handoffs remain the integration boundary; unrelated collections are not silently combined. Export/backup remains per tool.

Main's sync, backup, restore coordinator, shell and gateway code remain unchanged. The database adds document-editing APIs while retaining main's replaceAllData rollback contract. Reader receives only an explicit reviewed-copy handoff and capture-pause hook. No Android code is changed.

Studio, scanning and tender preparation retain testing labels. Tender preparation does not perform government signing, payment or submission. Advanced PDF engine assets are lazy and are not guaranteed offline before first use. No production deployment is part of this branch.

Validation: main unit 98/98; final combined WebX/recovery/sync/Studio source-note/scanner/tender/attachment27/27; standalone Reader offline deep-link1/1; production build and vocabulary pass. The first full-suite run exposed old reader tests still targeting root, corrected to /reader/. The broad historical suite was interrupted after recording those failures; final release-gate evidence and remote CI should be consulted separately. Synthetic public Orchard PDF and test fixtures only; credential-signature scan found zero matches in candidate files.
