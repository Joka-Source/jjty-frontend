# WebX convergence implementation plan

Approved scope: make app.jjty.in open a coherent WebX workspace; retain reader at /reader/ and WebX alias /webx/; preserve main security/recovery. Root owns deployment. No Android changes.

Architecture: start from main6275606, selectively add Studio/notebook/tender modules from95aa864. Preserve main sync, backup coordinator, relay, gateway and root reader code. Database gains additive atomic document/library methods while retaining main replaceAllData. Shared same-origin workspace frame keeps a persistent app switcher; navigation updates a durable selected tool but not document content. App panels retain original IndexedDB stores. Separate standalone reader remains reachable for recovery.

Visual direction: spatial document bench, white #ffffff document surfaces, cloud #e8eef4 background, ink #203346, slate #52677d, blue #245c91, amber #976914 experimental accents. System sans for tools, Georgia for the opening work prompt only. Left aligned work surface; vertical switcher on wide screens, horizontal compact switcher on phones. No automatic motion; reduced-motion removes transitions. App state and connection gaps stay explicit.

- [ ] Add selective modules and additive database capabilities; test main backup/sync interfaces remain unchanged.
- [ ] Build / root, /webx/ alias, /reader/ standalone routing and persistent tool switcher; retain query/hash handoffs inside same-origin panels.
- [ ] Update browser tests to address standalone reader explicitly; add production workbench test for switch/reload/offline, responsive layout and forbidden foreign messages.
- [ ] Verify reader source bytes and notebook handoff, scanner recovery, tender offline export, main unit/backup/sync and full regression. Preserve red evidence.
- [ ] Commit and push exact SHA; open draft PR to main; root promotes only after its own deployment verification.
