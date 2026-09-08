# Recover a local library

In Settings, choose **Back up library** to download a JETT library backup.
To recover it, choose the file under **Restore a library backup**, review the
counts, then select **Restore these documents**. Successful restoration refreshes
the library. Documents already on the destination device are not replaced.
If any document, record or reading-position ID conflicts, the whole restore is
refused; use a different library or keep the existing copy.

The version 1 `jt-library-backup` format contains local documents and their
original bytes, saved form answers, local records and reading positions.
Server connections, pending server requests, account/voice settings, arrivals,
shared spaces and membership authority are excluded. The separate complete JSON
export remains available for data access; it is not this restore format.

## Consistency and custody

A single readonly IndexedDB transaction snapshots documents, records and
positions together. The codec validates bounded shapes and relationships,
duplicate IDs, undo references, original byte sizes and SHA256 digests. It
preserves original bytes and historical receipts. Cached anchor resolution is
recomputed rather than treated as proof. Form field names are data, including
names that resemble configuration keys.

The file and its UTF-8 serialization are limited to 100 MiB. Invalid input is
rejected before a write transaction starts. Restoration validates again and
uses `add()` in one transaction across all three stores. A collision or write
failure aborts all additions, including records queued before the failure.
The UI waits for completion or abort before reporting an outcome.

Source hashes check source-byte consistency; this is not a signed backup and
does not authenticate the person who created it or independently prove derived
reading text. Native PDF export retains its existing text/geometry checks.
Restored data grants no server or sharing authority. Keep backup files private
as you would the original documents.

The snapshot contains committed storage state. An unsaved or failed edit is not
made durable by downloading a backup; resolve its save error first.

The browser acceptance test downloads an actual backup, restores it into a
separate context containing another document, reloads and checks original PDF
bytes, saved form answer, highlight, historical receipt and reading position.
It also exercises duplicate/malformed refusal and a 390px preview. Dedicated
IndexedDB tests force collisions after earlier writes have been queued and
compare the entire before/after snapshot. Set `JETT_BACKUP_PROOF_DIR` while running
the browser test to retain its downloaded library and preview screenshot.
