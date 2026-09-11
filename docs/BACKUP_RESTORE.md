# Backup and restore

JETT exports documents, records, reading positions, arrived moments, organization spaces, space feeds, user-facing settings and the durable outbound queue as one JSON file. Settings offers a staged restore: choosing a file validates it and shows its document, record and arrival counts without changing device data; a separate **restore this backup** action replaces the five application IndexedDB collections in one transaction, restores settings and organization data, then reloads from persistence. Queued sends are restored only when the export's device identity matches the current device.

The validator rejects malformed JSON, foreign formats, missing collections, duplicate document IDs, records without their documents, reading positions without their documents, invalid settings and organization records that fail the existing organization schemas. A database failure restores the previous local settings and organization blob rather than leaving those surfaces changed.

`test/backup.test.mjs` covers the file boundary. The desktop production-browser journey exports populated data, stages the resulting file, restores it, waits through reload and compares restored document, record and arrival IDs with the source export.

## Current boundary

The export does not contain pairing credentials or the transport delivery log. The product copy names the device boundary. A queued send carries device-bound transport identity, so JETT refuses to replay another device's queue while still restoring the portable saved data. This slice proves saved application-data and same-device outbox recovery; it is not yet a complete device migration or physical-device restore.
